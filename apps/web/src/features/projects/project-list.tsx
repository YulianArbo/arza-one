'use client';

import { projectStatusSchema, type ProjectOptions, type ProjectSummary } from '@arza/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  FormField,
  Pager,
  SelectField,
  SimpleTable,
  TableCell,
  TableRow,
  buttonVariants,
  useCursorTrail,
} from '@arza/ui';
import { FolderKanban } from 'lucide-react';
import Link from 'next/link';
import { useState, type JSX, type SubmitEvent } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { formatPesos, optionsOf } from '../crm/labels';
import { usePermissions } from '../session/permissions';
import { PROJECT_PATHS, PROJECT_STATUSES, PROJECT_STATUS_TONES } from './labels';
import { useProjectOptions, useProjects } from './queries';

// Proyectos (B26, numeral 16.4, patrón de listado): los más recientes primero, con su estado, su
// avance y su líder. El Equipo de proyecto ve solo aquellos donde es miembro. Quien crea proyectos
// ve además los contratos vigentes que todavía no tienen proyecto.

const STATUS_OPTIONS = optionsOf(projectStatusSchema.options, PROJECT_STATUSES, 'Todos');

interface Filters {
  readonly q: string;
  readonly status: string;
}

const NO_FILTERS: Filters = { q: '', status: '' };

function ProjectRow({ project }: { readonly project: ProjectSummary }): JSX.Element {
  return (
    <TableRow>
      <TableCell>
        <Link
          href={PROJECT_PATHS.project(project.id)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {project.code}
        </Link>
        <p className="text-xs text-muted-foreground">{project.name}</p>
      </TableCell>
      <TableCell>{project.party.name}</TableCell>
      <TableCell>{project.manager?.name ?? '—'}</TableCell>
      <TableCell>
        {formatDate(project.starts_on)} – {formatDate(project.ends_on)}
      </TableCell>
      <TableCell className="tabular-nums">{String(project.progress.percent)} %</TableCell>
      <TableCell>
        <Badge tone={PROJECT_STATUS_TONES[project.status]}>
          {PROJECT_STATUSES[project.status]}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

function SearchForm({ onApply }: { readonly onApply: (filters: Filters) => void }): JSX.Element {
  const [values, setValues] = useState(NO_FILTERS);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onApply(values);
  };
  return (
    <form
      onSubmit={submit}
      role="search"
      className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
    >
      <FormField
        id="buscar-proyecto"
        label="Buscar por código, nombre o cliente"
        value={values.q}
        onChange={(event) => {
          setValues({ ...values, q: event.target.value });
        }}
      />
      <SelectField
        id="estado-proyecto"
        label="Estado"
        options={STATUS_OPTIONS}
        value={values.status}
        onChange={(event) => {
          setValues({ ...values, status: event.target.value });
        }}
      />
      <Button type="submit" variant="outline">
        Buscar
      </Button>
    </form>
  );
}

function Results(props: { readonly filters: Filters }): JSX.Element {
  const trail = useCursorTrail();
  const page = useProjects({ ...props.filters, cursor: trail.cursor, limit: '25' });
  const filtered = props.filters.q !== '' || props.filters.status !== '';
  return (
    <QueryState query={page} loadingLabel="Cargando los proyectos">
      {(data) =>
        data.data.length === 0 ? (
          <EmptyState
            icon={<FolderKanban />}
            title={filtered ? 'No hay proyectos con esos filtros' : 'Todavía no hay proyectos'}
            description={
              filtered
                ? 'Cambie la búsqueda o el estado.'
                : 'Aquí aparecen los proyectos donde usted participa o que puede consultar.'
            }
          />
        ) : (
          <>
            <SimpleTable
              caption="Proyectos"
              scrollLabel="Proyectos; desplácese a los lados para ver todas las columnas"
              headers={['Proyecto', 'Cliente', 'Líder', 'Fechas', 'Avance', 'Estado']}
            >
              {data.data.map((project) => (
                <ProjectRow key={project.id} project={project} />
              ))}
            </SimpleTable>
            <Pager page={data} {...trail.pager} />
          </>
        )
      }
    </QueryState>
  );
}

/** Contratos vigentes sin proyecto: cada uno se vuelve proyecto con un clic. */
function PendingContracts({ options }: { readonly options: ProjectOptions }): JSX.Element | null {
  if (options.contracts.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contratos vigentes sin proyecto</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2 text-sm">
          {options.contracts.map((contract) => (
            <li key={contract.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <span className="font-medium">{contract.code}</span> · {contract.title} ·{' '}
                {contract.party.name} · {formatPesos(contract.value)}
              </span>
              <Link
                href={PROJECT_PATHS.fromContract(contract.id)}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
                aria-label={`Crear el proyecto del contrato ${contract.code}`}
              >
                Crear el proyecto
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function ProjectList(): JSX.Element {
  const { can } = usePermissions();
  const canCreate = can('project.create');
  const options = useProjectOptions(canCreate);
  const [filters, setFilters] = useState(NO_FILTERS);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Proyectos"
        description="Proyectos de software: equipo, hitos, tablero, horas, entregables y su control."
        action={
          <div className="flex flex-wrap gap-2">
            {can('project.time.log') ? (
              <Link href={PROJECT_PATHS.myHours} className={buttonVariants({ variant: 'outline' })}>
                Mis horas
              </Link>
            ) : null}
            {canCreate ? (
              <Link href={PROJECT_PATHS.create} className={buttonVariants()}>
                Nuevo proyecto
              </Link>
            ) : null}
          </div>
        }
      />
      {options.data === undefined ? null : <PendingContracts options={options.data} />}
      <SearchForm onApply={setFilters} />
      {/* Con otros filtros, la lista vuelve a la primera página. */}
      <Results key={`${filters.q}|${filters.status}`} filters={filters} />
    </div>
  );
}
