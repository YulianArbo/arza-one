'use client';

import type { JSX } from 'react';

import { HrHome } from '../hr/hr-home';
import { usePermissions } from '../session/permissions';
import { SstHome } from './sst-home';

// Portada del módulo «Talento y SST»: quien gestiona personas ve Talento humano; quien solo lee
// SST (Calidad, Auditor) va directo a Seguridad y salud en el trabajo (B37).

const HR_ENTRY = ['hr.employee.read', 'hr.vacancy.manage', 'hr.candidate.manage'];

export function TalentLanding(): JSX.Element | null {
  const { ready, can } = usePermissions();
  if (!ready) return null;
  return HR_ENTRY.some(can) ? <HrHome /> : <SstHome />;
}
