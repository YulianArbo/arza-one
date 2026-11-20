'use client';

import type { JSX } from 'react';

import { ShortcutGroups, type ShortcutGroup } from '../../components/app-shell/shortcut-groups';
import { OUTPUT_TEMPLATES_PATH } from '../forms/labels';
import { NTF_PATHS } from '../notifications/labels';
import { WF_PATHS } from '../workflows/labels';
import { ADMIN_PATHS } from './labels';

// Entrada de Administración (B22B, boceto 19): los accesos en tres grupos. Cada persona ve solo
// las secciones que su rol le permite (numeral 16.3); los permisos están en la lista de
// submódulos del menú.

const GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'Identidad y acceso',
    hrefs: [
      ADMIN_PATHS.users,
      ADMIN_PATHS.roles,
      ADMIN_PATHS.delegations,
      ADMIN_PATHS.accessReview,
    ],
  },
  {
    title: 'Organización',
    hrefs: [
      ADMIN_PATHS.company,
      ADMIN_PATHS.structure,
      ADMIN_PATHS.costCenters,
      ADMIN_PATHS.holidays,
    ],
  },
  {
    title: 'Configuración',
    hrefs: [
      ADMIN_PATHS.catalogs,
      ADMIN_PATHS.parameters,
      ADMIN_PATHS.sequences,
      WF_PATHS.definitions,
      NTF_PATHS.templates,
      OUTPUT_TEMPLATES_PATH,
    ],
  },
];

/** Entrada de Administración: solo las secciones que la persona puede usar. */
export function AdminHome(): JSX.Element | null {
  return (
    <ShortcutGroups slug="administracion" groups={GROUPS} label="Secciones de administración" />
  );
}
