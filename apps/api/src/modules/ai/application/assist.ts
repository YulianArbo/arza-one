import { Inject, Injectable } from '@nestjs/common';
import {
  PQRSF_TYPES,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  type AiAnswer,
  type AiTargetUseCase,
} from '@arza/contracts';

import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import {
  anyOfTerms,
  assistantCandidates,
  assistantDocument,
  type AssistantDocument,
} from '../../doc/index.js';
import {
  pqrsfForAssistant,
  ticketForAssistant,
  type AssistantPqrsf,
  type AssistantTicket,
} from '../../service/index.js';
import { readKeywords } from '../domain/answer-rules.js';
import { KEYWORDS_PROMPT } from '../domain/default-prompts.js';
import { frameOf } from '../domain/prompt-frame.js';
import { redactPersonalData } from '../domain/redaction.js';
import { aiInvalid, aiNotFound, sourceExcluded, type AiViewer } from './ai-support.js';
import { AiGateway, type Admission, type PreparedCall, type PreparedSource } from './gateway.js';

// Usos del asistente (B47, ficha 17.21). Cada uno lee su registro con las reglas del módulo dueño
// (Gestión documental o Servicio) y con los permisos de la persona: si no lo ve en la aplicación,
// el asistente tampoco. Lo restringido y las PQRSF sobre datos personales nunca se envían.

/** Documentos que se consideran para una pregunta y pasajes que se envían al modelo. */
const CANDIDATE_DOCUMENTS = 8;
const PASSAGES = 6;

interface Passage {
  readonly documentId: string;
  readonly content: string;
}

/** Los pasajes indexados que mejor responden, de los documentos que la persona puede abrir. */
async function passagesOf(
  tx: TenantTransaction,
  documents: readonly AssistantDocument[],
  keywords: readonly string[],
): Promise<Passage[]> {
  const versions = documents.map((doc) => doc.versionId);
  const query = anyOfTerms(keywords);
  if (versions.length === 0) return [];
  const ranked =
    query === null
      ? []
      : await tx.$queryRaw<Passage[]>`
          WITH q AS (SELECT to_tsquery('doc_spanish', ${query}) AS query)
          SELECT c.document_id AS "documentId", c.content
          FROM ai_index_chunks c, q
          WHERE c.document_version_id = ANY(${versions}::uuid[])
              AND to_tsvector('doc_spanish', c.content) @@ q.query
          ORDER BY ts_rank(to_tsvector('doc_spanish', c.content), q.query) DESC, c.id
          LIMIT ${PASSAGES}`;
  if (ranked.length > 0) return ranked;
  // Coincidió el código o el título, no el texto: el comienzo de los primeros documentos.
  const openings = await tx.aiIndexChunk.findMany({
    where: { documentVersionId: { in: versions.slice(0, 3) }, chunkNo: 0 },
    select: { documentId: true, content: true },
  });
  return openings;
}

function documentSource(doc: AssistantDocument, body: string): PreparedSource {
  return {
    kind: 'document',
    id: doc.id,
    code: doc.code,
    title: doc.title,
    classification: doc.classification,
    body,
  };
}

/** La etiqueta en español de un código; el código mismo si no está en la lista. */
function labelIn(labels: Readonly<Record<string, string>>, key: string): string {
  return new Map(Object.entries(labels)).get(key) ?? key;
}

function ticketBody(ticket: AssistantTicket): string {
  const lines = ticket.messages.map((message) => {
    const who = message.internal ? 'Nota interna' : message.fromClient ? 'Cliente' : 'Equipo';
    return `[${who}] ${message.body}`;
  });
  return [
    `Asunto: ${ticket.subject}`,
    `Categoría actual: ${labelIn(TICKET_CATEGORIES, ticket.category)}`,
    `Prioridad actual: ${labelIn(TICKET_PRIORITIES, ticket.priority)}`,
    `Descripción: ${ticket.description}`,
    'Conversación:',
    ...(lines.length === 0 ? ['(sin mensajes)'] : lines),
  ].join('\n');
}

function pqrsfBody(pqrsf: AssistantPqrsf): string {
  return [
    `Tipo registrado: ${labelIn(PQRSF_TYPES, pqrsf.type)}`,
    `Asunto: ${pqrsf.subject}`,
    `Descripción: ${pqrsf.description}`,
  ].join('\n');
}

function ticketSource(ticket: AssistantTicket): PreparedSource {
  const { id, code, subject: title } = ticket;
  return {
    kind: 'ticket',
    id,
    code,
    title,
    classification: 'confidential',
    body: ticketBody(ticket),
  };
}

function pqrsfSource(pqrsf: AssistantPqrsf): PreparedSource {
  const { id, code, subject: title } = pqrsf;
  return { kind: 'pqrsf', id, code, title, classification: 'confidential', body: pqrsfBody(pqrsf) };
}

@Injectable()
export class AiAssist {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AiGateway) private readonly gateway: AiGateway,
  ) {}

  /** Pregunta sobre los documentos que la persona puede abrir. */
  async search(viewer: AiViewer, meta: RequestMeta, question: string): Promise<AiAnswer> {
    const admission = await this.gateway.admit(viewer, 'doc_search');
    const { keywords, tokensIn, tokensOut } = await this.keywordsOf(admission, question);
    const sources = await this.database.withTenant(viewer.principal, async (tx) => {
      const documents = await assistantCandidates(tx, viewer, keywords, CANDIDATE_DOCUMENTS);
      const byId = new Map(documents.map((doc) => [doc.id, doc]));
      const passages = await passagesOf(tx, documents, keywords);
      return passages.flatMap((passage) => {
        const doc = byId.get(passage.documentId);
        return doc === undefined ? [] : [documentSource(doc, passage.content)];
      });
    });
    const call: PreparedCall = {
      useCase: 'doc_search',
      target: null,
      question,
      sources,
      alwaysCited: false,
    };
    return this.gateway.complete(viewer, meta, admission, call, { tokensIn, tokensOut });
  }

  /** Resumen, borrador o clasificación sugerida sobre un registro. */
  async assist(
    viewer: AiViewer,
    meta: RequestMeta,
    useCase: AiTargetUseCase,
    targetId: string,
  ): Promise<AiAnswer> {
    const admission = await this.gateway.admit(viewer, useCase);
    const kind =
      useCase === 'doc_summary' ? 'document' : useCase.startsWith('ticket') ? 'ticket' : 'pqrsf';
    const target = { kind, id: targetId } as const;
    const source = await this.sourceOf(viewer, useCase, targetId);
    if (typeof source === 'string') {
      await this.gateway.recordBlocked(viewer, meta, admission, { useCase, target });
      throw sourceExcluded(source);
    }
    const call: PreparedCall = {
      useCase,
      target,
      question: null,
      sources: [source],
      alwaysCited: true,
    };
    return this.gateway.complete(viewer, meta, admission, call);
  }

  /** El registro, o el motivo por el que nunca va a la IA. */
  private async sourceOf(
    viewer: AiViewer,
    useCase: AiTargetUseCase,
    id: string,
  ): Promise<PreparedSource | string> {
    return this.database.withTenant(viewer.principal, async (tx) => {
      if (useCase === 'doc_summary') {
        const found = await assistantDocument(tx, viewer, id);
        if (found === null) throw aiNotFound('El documento no existe o usted no puede verlo.');
        if (found === 'excluded')
          return 'Los documentos restringidos nunca se envían al asistente.';
        if (found.text === null) {
          throw aiInvalid('El texto de este documento aún no está listo. Intente en unos minutos.');
        }
        return documentSource(found.document, found.text);
      }
      if (useCase.startsWith('ticket'))
        return ticketSource(await ticketForAssistant(tx, viewer.ability, id));
      const pqrsf = await pqrsfForAssistant(tx, viewer.ability, id);
      if (pqrsf.privacyKind !== null) {
        return 'Las PQRSF sobre datos personales las atiende Privacidad y nunca se envían al asistente.';
      }
      return pqrsfSource(pqrsf);
    });
  }

  /** Palabras clave de la pregunta: las del modelo y las de la persona. */
  private async keywordsOf(
    admission: Admission,
    question: string,
  ): Promise<{ keywords: string[]; tokensIn: number; tokensOut: number }> {
    const clean = redactPersonalData(question).text;
    const frame = frameOf({
      useCase: 'keywords',
      instruction: KEYWORDS_PROMPT,
      question: clean,
      sources: [],
    });
    const completion = await this.gateway.ask(admission.model, {
      useCase: 'keywords',
      frame,
      question: clean,
      sources: [],
    });
    const fromModel = completion?.status === 'ok' ? readKeywords(completion.text) : [];
    const own = clean.split(/\s+/u).filter((word) => word.length > 3);
    return {
      keywords: [...fromModel, ...own],
      tokensIn: completion?.tokensIn ?? 0,
      tokensOut: completion?.tokensOut ?? 0,
    };
  }
}
