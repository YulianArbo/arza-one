import type { CreateFormTemplate, FormDefinition, FormFillMode } from '@arza/contracts';

import { CODE_REVIEW, CODE_REVIEW_CODE, TECHNICAL_DELIVERY_CODE } from './code-review-form.js';
import { choice, date, field, long, section, text, yesNo } from './form-builders.js';
import { LOAN_CONTRACT, LOAN_CONTRACT_CODE } from './loan-contract-form.js';

// Los formatos piloto del B20 (tabla 18.3) y el FT-TEC-002 del B27, que la semilla publica en cada
// empresa la primera vez. Sus campos son un borrador por validar contra el original: Calidad los
// ajusta en el diseñador y publica una versión nueva, sin programar.

export interface PilotForm {
  readonly template: Omit<CreateFormTemplate, 'output_template_id' | 'document_id'>;
  readonly fillMode: FormFillMode;
  /** Código de su plantilla de salida; null: la maqueta institucional del formato. */
  readonly outputCode: string | null;
}

const DOCUMENT_CHECKLIST: FormDefinition = {
  sections: [
    section('documento', 'Documento revisado', [
      text('codigo', 'Código del documento', true),
      text('nombre', 'Nombre del documento', true),
      text('version', 'Versión revisada', true),
    ]),
    section('verificacion', 'Verificación', [
      field({
        key: 'puntos',
        label: 'Puntos de verificación',
        type: 'checklist',
        required: true,
        items: [
          'La codificación sigue PR-SGC-001 (TIPO-PROCESO-NNN)',
          'El encabezado y el pie corresponden a la plantilla institucional',
          'El objetivo y el alcance están definidos',
          'Los responsables y las autoridades están definidos',
          'Las actividades son claras, completas y aplicables',
          'Es coherente con los demás documentos del proceso',
          'Las referencias normativas y los documentos relacionados están vigentes',
          'El control de cambios describe los cambios de esta versión',
          'La redacción y la ortografía son correctas',
        ],
      }),
    ]),
    section('resultado', 'Resultado de la revisión', [
      choice('resultado', 'Resultado', ['Conforme', 'Requiere ajustes'], true),
      long('observaciones', 'Observaciones generales'),
    ]),
  ],
};

const REQUIREMENTS_REVIEW: FormDefinition = {
  sections: [
    section('general', 'Datos generales', [
      text('cliente', 'Cliente', true),
      text('oportunidad', 'Oportunidad o proyecto', true),
      date('fecha', 'Fecha de la reunión', true),
      field({
        key: 'asistentes',
        label: 'Asistentes',
        type: 'table',
        columns: [
          { key: 'nombre', label: 'Nombre', type: 'text' },
          { key: 'cargo', label: 'Cargo', type: 'text' },
          { key: 'empresa', label: 'Empresa', type: 'text' },
        ],
      }),
    ]),
    section('requisitos', 'Revisión de requisitos', [
      field({
        key: 'requisitos',
        label: 'Requisitos del cliente',
        type: 'table',
        required: true,
        columns: [
          { key: 'requisito', label: 'Requisito', type: 'text' },
          { key: 'tipo', label: 'Tipo (funcional, técnico, legal)', type: 'text' },
          { key: 'capacidad', label: '¿Se puede cumplir?', type: 'text' },
        ],
      }),
      long('requisitos_legales', 'Requisitos legales y reglamentarios aplicables'),
      long('riesgos', 'Riesgos identificados'),
      long('recursos', 'Recursos necesarios'),
    ]),
    section('arranque', 'Decisión y arranque', [
      choice('decision', 'Decisión', ['Viable', 'Viable con condiciones', 'No viable'], true),
      long('condiciones', 'Condiciones'),
      date('inicio', 'Fecha estimada de inicio'),
      field({
        key: 'compromisos',
        label: 'Compromisos',
        type: 'table',
        columns: [
          { key: 'actividad', label: 'Actividad', type: 'text' },
          { key: 'responsable', label: 'Responsable', type: 'text' },
          { key: 'fecha', label: 'Fecha', type: 'date' },
        ],
      }),
    ]),
  ],
};

const CUSTOMER_KNOWLEDGE: FormDefinition = {
  sections: [
    section('identificacion', 'Identificación', [
      choice('tipo_persona', 'Tipo de persona', ['Natural', 'Jurídica'], true),
      text('nombre', 'Nombre o razón social', true),
      text('documento', 'Tipo y número de documento (NIT o cédula)', true),
      text('actividad', 'Actividad económica (código CIIU)'),
      text('representante', 'Representante legal'),
      text('correo', 'Correo de contacto'),
      text('telefono', 'Teléfono de contacto'),
    ]),
    section('riesgo', 'Información para la evaluación del riesgo', [
      long('origen_fondos', 'Declaración de origen de fondos', true),
      yesNo('pep', '¿Es o está relacionado con una persona expuesta políticamente?'),
      yesNo('listas', '¿Se consultaron las listas restrictivas?'),
      long('resultado_listas', 'Resultado de la consulta'),
      choice('nivel_riesgo', 'Nivel de riesgo', ['Bajo', 'Medio', 'Alto'], true),
    ]),
    section('soportes', 'Soportes y autorización', [
      field({
        key: 'soportes',
        label: 'Documentos soporte recibidos',
        type: 'checklist',
        items: [
          'Certificado de existencia y representación legal (o cédula)',
          'RUT',
          'Certificación bancaria',
          'Estados financieros (si aplica)',
        ],
      }),
      yesNo('autoriza_datos', 'Autorizó el tratamiento de sus datos personales'),
    ]),
  ],
};

const TECHNICAL_DELIVERY: FormDefinition = {
  sections: [
    section('general', 'Datos generales', [
      text('cliente', 'Cliente', true),
      text('proyecto', 'Proyecto', true),
      date('fecha', 'Fecha de entrega', true),
      choice('ambiente', 'Ambiente', ['Pruebas', 'Producción']),
    ]),
    section('entregables', 'Entregables', [
      field({
        key: 'entregables',
        label: 'Entregables',
        type: 'table',
        required: true,
        columns: [
          { key: 'entregable', label: 'Entregable', type: 'text' },
          { key: 'version', label: 'Versión', type: 'text' },
          { key: 'descripcion', label: 'Descripción', type: 'text' },
        ],
      }),
      field({
        key: 'verificacion',
        label: 'Verificación de la entrega',
        type: 'checklist',
        items: [
          'Se cumplieron los criterios de aceptación acordados',
          'Se entregó la documentación técnica y de usuario',
          'Se entregaron los accesos y las credenciales por canal seguro',
          'Se realizó la capacitación acordada',
        ],
      }),
    ]),
    section('cierre', 'Pendientes y recibo', [
      long('pendientes', 'Pendientes y fechas de solución'),
      long('observaciones', 'Observaciones del cliente'),
      text('recibe_nombre', 'Recibe (nombre)', true),
      text('recibe_cargo', 'Recibe (cargo)'),
    ]),
  ],
};

/** La Solicitud de Acción Documental la llena la plataforma con los datos de la solicitud. */
const CHANGE_REQUEST_FORM: FormDefinition = {
  sections: [
    section('solicitud', 'Solicitud', [
      text('codigo', 'Código de la solicitud'),
      text('accion', 'Acción solicitada'),
      text('documento', 'Documento'),
      text('tipo', 'Tipo de documento'),
      text('proceso', 'Proceso'),
      long('justificacion', 'Justificación'),
      text('solicito', 'Solicitó'),
      date('fecha_solicitud', 'Fecha de la solicitud'),
    ]),
    section('decision', 'Decisión', [
      text('decision', 'Decisión'),
      text('decidio', 'Decidió'),
      date('fecha_decision', 'Fecha de la decisión'),
      long('nota', 'Motivo o nota'),
    ]),
  ],
};

export const CHANGE_REQUEST_FORM_CODE = 'FT-SGC-001';
export const DOCUMENT_CHECKLIST_CODE = 'FT-SGC-002';

/** Plantilla de salida del FT-SGC-001: el formato oficial con los datos de la solicitud. */
export const CHANGE_REQUEST_OUTPUT_BODY = `<h1 style="font-size:13px;margin:0 0 8px">Solicitud {{codigo}}</h1>
<table>
  <tr><th style="width:30%">Acción solicitada</th><td>{{accion}}</td></tr>
  <tr><th>Documento</th><td>{{documento}}</td></tr>
  <tr><th>Tipo de documento</th><td>{{tipo}}</td></tr>
  <tr><th>Proceso</th><td>{{proceso}}</td></tr>
  <tr><th>Justificación</th><td>{{justificacion}}</td></tr>
  <tr><th>Solicitó</th><td>{{solicito}} · {{fecha_solicitud}}</td></tr>
</table>
<h2 style="font-size:11px;margin:14px 0 6px">Decisión de Calidad</h2>
<table>
  <tr><th style="width:30%">Decisión</th><td>{{decision}}</td></tr>
  <tr><th>Decidió</th><td>{{decidio}} · {{fecha_decision}}</td></tr>
  <tr><th>Motivo o nota</th><td>{{nota}}</td></tr>
</table>
<p style="margin-top:14px;font-size:9px">Registro {{registro.codigo}} generado por ARZA ONE con los datos de la solicitud.</p>`;

export const PILOT_FORMS: readonly PilotForm[] = [
  {
    template: {
      code: DOCUMENT_CHECKLIST_CODE,
      name: 'Lista de Verificación Documental',
      definition: DOCUMENT_CHECKLIST,
      layout: { orientation: 'portrait' },
      workflow_key: null,
      classification: 'internal',
      entity_type: 'doc_version',
    },
    fillMode: 'manual',
    outputCode: null,
  },
  {
    template: {
      code: 'FT-COM-002',
      name: 'Acta de Revisión de Requisitos y Arranque',
      definition: REQUIREMENTS_REVIEW,
      layout: { orientation: 'portrait' },
      workflow_key: 'doc.form_record.direction',
      classification: 'internal',
      entity_type: null,
    },
    fillMode: 'manual',
    outputCode: null,
  },
  {
    template: {
      code: 'FT-COM-003',
      name: 'Conocimiento del Cliente',
      definition: CUSTOMER_KNOWLEDGE,
      layout: { orientation: 'portrait' },
      workflow_key: 'doc.form_record.direction',
      classification: 'confidential',
      entity_type: 'party',
    },
    fillMode: 'manual',
    outputCode: null,
  },
  {
    template: {
      code: TECHNICAL_DELIVERY_CODE,
      name: 'Acta de Entrega Técnica',
      definition: TECHNICAL_DELIVERY,
      layout: { orientation: 'portrait' },
      workflow_key: 'doc.form_record.direction',
      classification: 'internal',
      entity_type: null,
    },
    fillMode: 'manual',
    outputCode: null,
  },
  {
    template: {
      code: CHANGE_REQUEST_FORM_CODE,
      name: 'Solicitud de Acción Documental',
      definition: CHANGE_REQUEST_FORM,
      layout: { orientation: 'portrait' },
      workflow_key: null,
      classification: 'internal',
      entity_type: 'doc_change_request',
    },
    fillMode: 'system',
    outputCode: CHANGE_REQUEST_FORM_CODE,
  },
  {
    template: {
      code: CODE_REVIEW_CODE,
      name: 'Lista de Revisión de Código',
      definition: CODE_REVIEW,
      layout: { orientation: 'portrait' },
      workflow_key: null,
      classification: 'internal',
      entity_type: 'prj_code_review',
    },
    fillMode: 'system',
    outputCode: null,
  },
  {
    template: {
      code: LOAN_CONTRACT_CODE,
      name: 'Contrato de Comodato',
      definition: LOAN_CONTRACT,
      layout: { orientation: 'portrait' },
      workflow_key: null,
      classification: 'internal',
      entity_type: 'ast_assignment',
    },
    fillMode: 'system',
    outputCode: null,
  },
];
