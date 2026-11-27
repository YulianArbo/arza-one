import { Inject, Injectable } from '@nestjs/common';
import type { AiAnswer, AiInputClass, AiOutcome, AiSource, AiUseCase } from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaStartOf, bogotaToday, tenantPlan } from '../../core/index.js';
import { readAnswer, type ModelAnswer } from '../domain/answer-rules.js';
import { DEFAULT_PROMPTS } from '../domain/default-prompts.js';
import {
  frameSources,
  inputClassOf,
  minimized,
  sourceViews,
  type Minimized,
  type PreparedCall,
  type PreparedSource,
} from '../domain/minimize.js';
import { frameOf } from '../domain/prompt-frame.js';
import {
  AI_MODEL,
  AiProviderError,
  type AiCompletion,
  type AiCompletionRequest,
  type AiModel,
} from '../infrastructure/ai-model.js';
import {
  aiActorOf,
  dailyLimitReached,
  gatewayOff,
  notInPlan,
  providerFailed,
  recordAiChange,
  useCaseDisabled,
  type AiViewer,
} from './ai-support.js';

// Pasarela de IA (ADR-022, B47): la única puerta hacia el modelo. Antes de leer nada revisa que el
// uso esté activo y que la persona no haya llegado a su límite del día. Después minimiza (borra los
// datos personales y recorta al tamaño máximo), arma el marco con las reglas fijas, llama al modelo,
// valida la respuesta, se queda solo con las citas a fuentes enviadas y registra el uso con su
// auditoría en una transacción. Nunca ejecuta nada: la persona decide qué hacer con la propuesta.

export const AI_SETTINGS = Symbol('AI_SETTINGS');

export interface AiSettings {
  readonly dailyLimit: number;
  readonly maxInputChars: number;
}

/** Lo que permite usar el asistente: el modelo y la instrucción vigente del uso. */
export interface Admission {
  readonly model: AiModel;
  readonly prompt: { readonly version: number; readonly body: string };
}

interface Usage {
  readonly tokensIn: number;
  readonly tokensOut: number;
}

export type { PreparedCall, PreparedSource } from '../domain/minimize.js';

const NO_SOURCES = 'No encontré la respuesta en los documentos que usted puede consultar.';
const REFUSED = 'El asistente no puede ayudar con esta solicitud.';

function outcomeOf(call: PreparedCall, answer: ModelAnswer | null, refused: boolean): AiOutcome {
  if (refused) return 'refused';
  if (answer === null) return 'failed';
  if (!call.alwaysCited && answer.cited.length === 0) return 'no_sources';
  return 'answered';
}

/** Lo que queda del uso en el registro (decisión 5): nunca el texto enviado ni la respuesta. */
interface RequestEntry {
  readonly call: PreparedCall;
  readonly admission: Admission;
  readonly outcome: AiOutcome;
  readonly inputClass: AiInputClass;
  readonly inputChars: number;
  readonly outputChars: number;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly redactions: number;
  readonly cited: readonly AiSource[];
}

interface Exchange {
  readonly completion: AiCompletion | null;
  readonly answer: ModelAnswer | null;
  readonly outcome: AiOutcome;
  readonly cited: readonly PreparedSource[];
}

function requestRow(principal: Principal, entry: RequestEntry) {
  const { call, admission } = entry;
  return {
    tenantId: principal.tenantId,
    userId: principal.userId,
    useCase: call.useCase,
    provider: admission.model.provider,
    model: admission.model.model,
    promptVersion: admission.prompt.version,
    inputClass: entry.inputClass,
    inputChars: entry.inputChars,
    outputChars: entry.outputChars,
    tokensIn: entry.tokensIn,
    tokensOut: entry.tokensOut,
    redactions: entry.redactions,
    outcome: entry.outcome,
    targetKind: call.target?.kind ?? null,
    targetId: call.target?.id ?? null,
    sources: entry.cited.map((source) => ({ kind: source.kind, id: source.id })),
  };
}

function textOf(outcome: AiOutcome, answer: ModelAnswer | null): string | null {
  if (outcome === 'answered') return answer?.text ?? null;
  return outcome === 'refused' ? REFUSED : NO_SOURCES;
}

@Injectable()
export class AiGateway {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AI_MODEL) private readonly model: AiModel | null,
    @Inject(AI_SETTINGS) private readonly settings: AiSettings,
  ) {}

  get modelInUse(): AiModel | null {
    return this.model;
  }

  get dailyLimit(): number {
    return this.settings.dailyLimit;
  }

  /** Usos de la persona en el día de hoy (hora de Bogotá). */
  async usedToday(tx: TenantTransaction, userId: string): Promise<number> {
    const since = bogotaStartOf(bogotaToday(this.clock.now()));
    return tx.aiRequest.count({ where: { userId, createdAt: { gte: since } } });
  }

  /** Revisa que se pueda usar: proveedor, uso activo y límite del día. */
  async admit(viewer: AiViewer, useCase: AiUseCase): Promise<Admission> {
    const model = this.model;
    if (model === null) throw gatewayOff();
    return this.database.withTenant(viewer.principal, async (tx) => {
      if (!(await tenantPlan(tx)).limits.aiAssistant) throw notInPlan();
      const setting = await tx.aiUseCase.findFirst({ where: { useCase, deletedAt: null } });
      if (setting?.enabled !== true) throw useCaseDisabled();
      if ((await this.usedToday(tx, viewer.principal.userId)) >= this.settings.dailyLimit) {
        throw dailyLimitReached(this.settings.dailyLimit);
      }
      const approved = await tx.aiPrompt.findFirst({
        where: { useCase, status: 'approved', deletedAt: null },
      });
      const prompt =
        approved === null
          ? { version: 0, body: DEFAULT_PROMPTS[useCase] }
          : { version: approved.promptVersion, body: approved.body };
      return { model, prompt };
    });
  }

  /** Llama al modelo; un error del proveedor no lleva contenido (AiProviderError). */
  async ask(model: AiModel, request: AiCompletionRequest): Promise<AiCompletion | null> {
    try {
      return await model.complete(request);
    } catch (error) {
      if (error instanceof AiProviderError) return null;
      throw error;
    }
  }

  /** Envía la petición minimizada, registra el uso y devuelve la propuesta. */
  async complete(
    viewer: AiViewer,
    meta: RequestMeta,
    admission: Admission,
    call: PreparedCall,
    spent: Usage = { tokensIn: 0, tokensOut: 0 },
  ): Promise<AiAnswer> {
    const input = minimized(call, this.settings.maxInputChars);
    const result = await this.exchange(admission, call, input);
    const answered = result.outcome === 'answered';
    const cited = answered ? sourceViews(result.cited) : [];
    const id = await this.record(viewer, meta, {
      call,
      admission,
      outcome: result.outcome,
      inputClass: inputClassOf(input.sources),
      inputChars: input.chars,
      outputChars: result.completion?.text.length ?? 0,
      tokensIn: spent.tokensIn + (result.completion?.tokensIn ?? 0),
      tokensOut: spent.tokensOut + (result.completion?.tokensOut ?? 0),
      redactions: input.redactions,
      cited,
    });
    if (result.outcome === 'failed') throw providerFailed();
    return {
      request_id: id,
      use_case: call.useCase,
      outcome: result.outcome,
      text: textOf(result.outcome, result.answer),
      suggestion: answered ? (result.answer?.suggestion ?? null) : null,
      sources: cited,
      model: admission.model.model,
      rehearsal: admission.model.provider === 'rehearsal',
      truncated: input.truncated,
    };
  }

  /** Un intento sobre un registro que nunca va a la IA queda registrado como bloqueado. */
  async recordBlocked(
    viewer: AiViewer,
    meta: RequestMeta,
    admission: Admission,
    call: Pick<PreparedCall, 'useCase' | 'target'>,
  ): Promise<void> {
    await this.record(viewer, meta, {
      call: { ...call, question: null, sources: [], alwaysCited: false },
      admission,
      outcome: 'blocked',
      inputClass: 'none',
      inputChars: 0,
      outputChars: 0,
      tokensIn: 0,
      tokensOut: 0,
      redactions: 0,
      cited: [],
    });
  }

  /** Arma el marco, llama al modelo (si hay fuentes) y lee su respuesta. */
  private async exchange(
    admission: Admission,
    call: PreparedCall,
    input: Minimized,
  ): Promise<Exchange> {
    const sources = frameSources(input.sources);
    // Sin fuentes no hay nada que responder: no se llama al modelo.
    if (!call.alwaysCited && sources.length === 0) {
      return { completion: null, answer: null, outcome: 'no_sources', cited: [] };
    }
    const frame = frameOf({
      useCase: call.useCase,
      instruction: admission.prompt.body,
      question: input.question,
      sources,
    });
    const completion = await this.ask(admission.model, {
      useCase: call.useCase,
      frame,
      question: input.question,
      sources,
    });
    const refused = completion?.status === 'refused';
    const refs = input.sources.map((source) => source.ref);
    const answer =
      completion === null || refused ? null : readAnswer(call.useCase, completion.text, refs);
    const cited = call.alwaysCited
      ? input.sources
      : input.sources.filter((source) => answer?.cited.includes(source.ref) === true);
    return { completion, answer, outcome: outcomeOf(call, answer, refused), cited };
  }

  private async record(viewer: AiViewer, meta: RequestMeta, entry: RequestEntry): Promise<string> {
    const actor = aiActorOf(viewer.principal, this.clock.now(), meta);
    return this.database.withTenant(viewer.principal, async (tx) => {
      const row = await tx.aiRequest.create({ data: requestRow(viewer.principal, entry) });
      await recordAiChange(tx, actor, {
        action: 'ai.request.create',
        event: 'ai.request.recorded',
        entityType: 'ai_request',
        entityId: row.id,
        changes: {
          use_case: entry.call.useCase,
          model: entry.admission.model.model,
          outcome: entry.outcome,
          input_class: entry.inputClass,
          sources: entry.cited.length,
        },
      });
      return row.id;
    });
  }
}
