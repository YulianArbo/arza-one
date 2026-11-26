import type { LegalNormType } from '@arza/contracts';

import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { nextPlainCode } from '../../core/index.js';
import { LEGAL_REQUIREMENTS } from './legal-requirements.js';

// Normograma de ejemplo para las empresas ficticias (B46, decisión 6): requisitos tomados de la
// matriz del capítulo 20 del manual. El normograma real se carga desde RE-DG-001 con la pantalla
// de carga; estos textos no reemplazan el concepto del asesor jurídico.

type Seed = readonly [LegalNormType, string, string, string | null, string, string];

const SAMPLE: readonly Seed[] = [
  [
    'law',
    'Ley 1581 de 2012',
    'Congreso de la República',
    'Art. 9',
    'Autorización previa, expresa e informada del titular y conservación de su prueba.',
    'Casilla no premarcada y registro de cada autorización en Privacidad.',
  ],
  [
    'law',
    'Ley 1581 de 2012',
    'Congreso de la República',
    'Arts. 8, 14 y 15',
    'Atender consultas y reclamos de los titulares dentro de los plazos legales.',
    'Solicitudes de titulares con plazos en días hábiles.',
  ],
  [
    'law',
    'Ley 1581 de 2012',
    'Congreso de la República',
    'Art. 12',
    'Informar al titular y publicar la política de tratamiento.',
    'Política y aviso publicados y versionados en el sitio.',
  ],
  [
    'decree',
    'Decreto 1074 de 2015',
    'Ministerio de Comercio, Industria y Turismo',
    'Arts. 2.2.2.26.1.1 y ss.',
    'Evaluar cada año la obligación de inscribir las bases de datos en el Registro Nacional.',
    'Inventario de actividades de tratamiento listo para el registro.',
  ],
  [
    'circular',
    'Circular Única SIC',
    'Superintendencia de Industria y Comercio',
    'Título V',
    'Reportar los incidentes de seguridad de datos personales dentro de los quince días hábiles.',
    'Registro de incidentes de Privacidad con su fecha límite.',
  ],
  [
    'law',
    'Ley 527 de 1999',
    'Congreso de la República',
    'Arts. 5 a 12',
    'Garantizar la integridad y la conservación de los mensajes de datos.',
    'Huella de integridad de los documentos generados.',
  ],
  [
    'law',
    'Ley 1480 de 2011',
    'Congreso de la República',
    'Art. 50',
    'Ofrecer un mecanismo de PQR en el mismo medio y dar constancia de radicación.',
    'Formulario público de PQRSF con radicado.',
  ],
  [
    'law',
    'Ley 2300 de 2023',
    'Congreso de la República',
    null,
    'Contactar para cobranza y publicidad solo por canales autorizados y en el horario permitido.',
    'Preferencias de canal y horario de envío.',
  ],
  [
    'law',
    'Ley 23 de 1982',
    'Congreso de la República',
    null,
    'Constar por escrito la cesión de los derechos patrimoniales del software.',
    'Contratos con cláusula de cesión y registro de autores.',
  ],
  [
    'law',
    'Ley 1273 de 2009',
    'Congreso de la República',
    null,
    'Prevenir el acceso abusivo y la violación de datos personales.',
    'Controles de seguridad del capítulo 15 y preservación de evidencia.',
  ],
  [
    'resolution',
    'Resolución DIAN 000165 de 2023',
    'DIAN',
    null,
    'Expedir la factura electrónica con validación previa.',
    'Facturas emitidas en el software habilitado; la plataforma registra el número.',
  ],
  [
    'law',
    'Código de Comercio',
    'Congreso de la República',
    'Arts. 48 a 60',
    'Conservar libros y papeles durante diez años con reproducción exacta.',
    'Reglas de retención y copias de seguridad.',
  ],
  [
    'law',
    'Ley 2191 de 2022',
    'Congreso de la República',
    null,
    'Respetar la desconexión laboral fuera de la jornada.',
    'Horario de notificaciones y envío diferido.',
  ],
  [
    'law',
    'Ley 1010 de 2006',
    'Congreso de la República',
    null,
    'Prevenir y atender el acoso laboral.',
    'Canal confidencial al Comité de Convivencia.',
  ],
];

async function seedTenant(tx: TenantTransaction, tenantId: string, at: Date): Promise<void> {
  if ((await tx.qmsLegalRequirement.count()) > 0) return;
  for (const [normType, norm, issuer, article, requirement, means] of SAMPLE) {
    const code = await nextPlainCode(tx, LEGAL_REQUIREMENTS);
    const row = await tx.qmsLegalRequirement.create({
      data: {
        tenantId,
        code,
        normType,
        norm,
        issuer,
        article,
        requirement,
        complianceMeans: means,
      },
    });
    await recordAuditEvent(tx, {
      tenantId,
      occurredAt: at,
      actor: { kind: 'system' },
      action: 'qms.legal_requirement.create',
      entityType: 'qms_legal_requirement',
      entityId: row.id,
      result: 'success',
      changes: { code, norm, source: 'seed' },
      meta: null,
    });
  }
}

/** Requisitos de ejemplo para las empresas ficticias; no repite si ya hay normograma. */
export async function seedLegalDemo(
  database: Pick<DatabaseService, 'withTenant'>,
  tenantIds: readonly string[],
  clock: Clock,
): Promise<void> {
  for (const tenantId of tenantIds) {
    await database.withTenant({ tenantId, userId: null }, (tx) =>
      seedTenant(tx, tenantId, clock.now()),
    );
  }
}
