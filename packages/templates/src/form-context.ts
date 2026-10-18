import type { FormData, FormDefinition } from '@arza/contracts';

import { printedValues, type PrintedValue } from './form-values.js';
import type { RecordFacts } from './form-document.js';
import type { CompanyIdentity, DocumentIdentity } from './institutional.js';

// Variables que reciben las plantillas de salida (B20): cada campo por su nombre interno, ya
// impreso (fechas dd/mm/aaaa, sí o no, filas de verificaciones y tablas), y además los datos del
// formato, del registro y de la empresa. La guía de variables está en docs/manual/datos/doc.md.

export interface TemplateContext {
  readonly formato: { codigo: string; nombre: string; version: string; fecha: string };
  readonly registro: {
    codigo: string;
    estado: string;
    elaboro: string;
    fecha: string;
    aprobo: string;
    fecha_aprobacion: string;
  };
  readonly empresa: { razon_social: string; nit: string };
  readonly [field: string]: PrintedValue | Readonly<Record<string, string>>;
}

export function templateContext(
  input: {
    readonly document: DocumentIdentity;
    readonly company: CompanyIdentity;
    readonly facts: RecordFacts;
  },
  definition: FormDefinition,
  data: FormData,
): TemplateContext {
  const { document, company, facts } = input;
  return {
    ...printedValues(definition, data),
    formato: {
      codigo: document.code,
      nombre: document.name,
      version: document.version,
      fecha: document.date,
    },
    registro: {
      codigo: facts.code,
      estado: facts.status,
      elaboro: facts.createdBy,
      fecha: facts.createdOn,
      aprobo: facts.approvedBy ?? '',
      fecha_aprobacion: facts.approvedOn ?? '',
    },
    empresa: { razon_social: company.legalName, nit: company.taxId },
  };
}
