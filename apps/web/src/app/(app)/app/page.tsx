import { EmptyState } from '@arza/ui';
import { Bell, CalendarClock, ListTodo, Star } from 'lucide-react';
import type { JSX, ReactNode } from 'react';

import { PageHeader } from '../../../components/app-shell/page-header';

interface DashboardSection {
  title: string;
  description: string;
  icon: ReactNode;
}

// Tablero de inicio según el rol (16.3). Cada sección se llena con su módulo.
const SECTIONS: DashboardSection[] = [
  {
    title: 'Mis tareas',
    description: 'Aquí verá las tareas y aprobaciones que le asignen los flujos de trabajo.',
    icon: <ListTodo />,
  },
  {
    title: 'Vencimientos próximos',
    description: 'Aquí verá los contratos, documentos y tareas que están por vencer.',
    icon: <CalendarClock />,
  },
  {
    title: 'Avisos',
    description: 'Aquí verá los avisos importantes de la plataforma y de sus procesos.',
    icon: <Bell />,
  },
  {
    title: 'Accesos frecuentes',
    description: 'Aquí verá los atajos a las pantallas que más usa.',
    icon: <Star />,
  },
];

export default function HomePage(): JSX.Element {
  return (
    <>
      <PageHeader title="Inicio" description="Su resumen del día." />
      <div className="grid gap-4 lg:grid-cols-2">
        {SECTIONS.map((section) => (
          <EmptyState
            key={section.title}
            title={section.title}
            description={section.description}
            icon={section.icon}
          />
        ))}
      </div>
    </>
  );
}
