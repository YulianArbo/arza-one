import type { FormDefinition } from '@arza/contracts';

import { date, long, section, text } from './form-builders.js';

/** Contrato de Comodato (B34): Activos lo llena con cada asignación de un activo. */
export const LOAN_CONTRACT_CODE = 'CT-ADM-001';

/**
 * CT-ADM-001 (B34): la plataforma lo llena al asignar un activo y el colaborador lo firma. Sus
 * campos y cláusulas son un borrador por validar contra el original y por revisión jurídica.
 */
export const LOAN_CONTRACT: FormDefinition = {
  sections: [
    section('partes', 'Partes', [
      text('comodante', 'Comodante (empresa)', true),
      text('comodante_nit', 'NIT del comodante', true),
      text('comodatario', 'Comodatario (colaborador)', true),
      text('comodatario_documento', 'Documento del comodatario', true),
    ]),
    section('activo', 'Activo entregado', [
      text('codigo', 'Código del activo', true),
      text('nombre', 'Nombre', true),
      text('categoria', 'Categoría', true),
      text('serie', 'Serie'),
      text('valor', 'Valor del activo', true),
      date('fecha_entrega', 'Fecha de entrega', true),
    ]),
    section('condiciones', 'Condiciones', [long('clausulas', 'Cláusulas', true)]),
  ],
};
