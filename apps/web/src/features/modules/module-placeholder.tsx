import { EmptyState, ForbiddenState } from '@arza/ui';
import { Construction } from 'lucide-react';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { canSee, type NavigationItem } from '../../components/app-shell/navigation';

export interface ModulePlaceholderProps {
  item: NavigationItem;
  granted: ReadonlySet<string>;
}

/** Pantalla de un módulo aún no construido. Sin permiso, no revela nada del módulo (16.5). */
export function ModulePlaceholder({ item, granted }: ModulePlaceholderProps): JSX.Element {
  if (!canSee(item, granted)) {
    return <ForbiddenState />;
  }
  return (
    <>
      <PageHeader title={item.label} />
      <EmptyState
        title="Este módulo está en construcción"
        description={`Se construye en el bloque ${item.block ?? ''} del plan de construcción. Cuando esté listo, aquí verá su información.`}
        icon={<Construction />}
      />
    </>
  );
}
