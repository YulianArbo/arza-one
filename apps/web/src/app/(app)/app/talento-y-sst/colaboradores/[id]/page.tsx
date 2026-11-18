import type { Metadata } from 'next';
import type { JSX } from 'react';

import { EmployeePanel } from '../../../../../../features/hr/employee-panel';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Ficha laboral' };

export default async function Page({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['hr.employee.read']}>
      <EmployeePanel id={id} />
    </RequirePermission>
  );
}
