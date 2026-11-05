'use client';

import {
  isWorkItem,
  type ProjectDetail,
  type ProjectItem,
  type ProjectSprint,
} from '@arza/contracts';
import { Badge, EmptyState, SelectField, SimpleTable, TableCell, TableRow } from '@arza/ui';
import { ListTodo } from 'lucide-react';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { RecordDialog } from '../organization/record-dialog';
import { ItemForm } from './item-form';
import {
  ITEM_PRIORITIES,
  ITEM_STATUSES,
  ITEM_STATUS_TONES,
  ITEM_TYPES,
  ITEM_TYPE_TONES,
  itemLabel,
} from './labels';
import { useProjectAction, useProjectItems } from './queries';

// Lista de pendientes (B26, ficha 17.8): épicas, historias, tareas y defectos del proyecto, con su
// código. Desde aquí se crean y editan, y se llevan a una iteración planeada o en curso. Sin
// criterios de aceptación un ítem no entra a una iteración: la lista lo marca.

interface Props {
  readonly project: ProjectDetail;
}

function useItemSave(project: ProjectDetail, item: ProjectItem | null, onDone: () => void) {
  const api = useApiClient();
  return useProjectAction<object>(async (body, csrfToken) => {
    if (item === null) {
      await api.post(`/v1/projects/${project.id}/items`, { body, csrfToken });
    } else {
      await api.put(`/v1/projects/${project.id}/items/${item.id}`, {
        body,
        version: item.version,
        csrfToken,
      });
    }
  }, onDone);
}

function SaveItem(
  props: Props & {
    readonly item: ProjectItem | null;
    readonly items: readonly ProjectItem[];
    readonly onDone: () => void;
  },
): JSX.Element {
  const save = useItemSave(props.project, props.item, props.onDone);
  const parents = props.items.filter((item) => item.id !== props.item?.id);
  return <ItemForm project={props.project} item={props.item} parents={parents} action={save} />;
}

/** Iteraciones donde puede entrar un ítem: las planeadas y la que está en curso. */
function openSprints(project: ProjectDetail): ProjectSprint[] {
  return project.sprints.filter((sprint) => sprint.status !== 'closed');
}

function PlanSelect(props: Props & { readonly item: ProjectItem }): JSX.Element {
  const api = useApiClient();
  const { item } = props;
  const plan = useProjectAction<string | null>((sprintId, csrfToken) =>
    api.post(`/v1/projects/${props.project.id}/items/${item.id}/actions/plan`, {
      body: { sprint_id: sprintId },
      version: item.version,
      csrfToken,
    }),
  );
  const options = [
    { value: '', label: 'Pendientes (sin iteración)' },
    ...openSprints(props.project).map((sprint) => ({ value: sprint.id, label: sprint.name })),
  ];
  return (
    <>
      <SelectField
        id={`iteracion-${item.id}`}
        label="Iteración"
        aria-label={`Iteración de ${itemLabel(item)}`}
        options={options}
        value={item.sprint_id ?? ''}
        disabled={plan.pending}
        onChange={(event) => {
          plan.execute(event.target.value === '' ? null : event.target.value);
        }}
      />
      {plan.error === null ? null : <FormError error={plan.error} />}
      {plan.dialog}
    </>
  );
}

function sprintName(project: ProjectDetail, sprintId: string | null): string {
  if (sprintId === null) return 'Pendientes';
  return project.sprints.find((sprint) => sprint.id === sprintId)?.name ?? 'Iteración';
}

function ItemTitle({ item }: { readonly item: ProjectItem }): JSX.Element {
  return (
    <>
      <span className="font-medium">{itemLabel(item)}</span>
      <p className="text-xs text-muted-foreground">
        {item.code}
        {item.parent === null ? '' : ` · en ${itemLabel(item.parent)}`}
      </p>
      {isWorkItem(item.type) && item.acceptance_criteria === null ? (
        <Badge tone="warning">Sin criterios de aceptación</Badge>
      ) : null}
    </>
  );
}

function EditItem(
  props: Props & { readonly item: ProjectItem; readonly items: readonly ProjectItem[] },
): JSX.Element {
  const label = itemLabel(props.item);
  return (
    <RecordDialog
      triggerLabel="Editar"
      triggerAriaLabel={`Editar ${label}`}
      variant="outline"
      title={`Editar ${label}`}
      description="Un ítem en una iteración debe conservar sus criterios de aceptación."
    >
      {(close) => (
        <SaveItem project={props.project} item={props.item} items={props.items} onDone={close} />
      )}
    </RecordDialog>
  );
}

function ItemRow(
  props: Props & { readonly item: ProjectItem; readonly items: readonly ProjectItem[] },
): JSX.Element {
  const { item, project } = props;
  const editable = project.can.manage_items && item.status !== 'done';
  return (
    <TableRow>
      <TableCell>
        <ItemTitle item={item} />
      </TableCell>
      <TableCell>
        <Badge tone={ITEM_TYPE_TONES[item.type]}>{ITEM_TYPES[item.type]}</Badge>
      </TableCell>
      <TableCell>
        <Badge tone={ITEM_STATUS_TONES[item.status]}>{ITEM_STATUSES[item.status]}</Badge>
      </TableCell>
      <TableCell>{ITEM_PRIORITIES[item.priority]}</TableCell>
      <TableCell>{item.assignee?.name ?? 'Sin asignar'}</TableCell>
      <TableCell>
        {editable && isWorkItem(item.type) ? (
          <PlanSelect project={project} item={item} />
        ) : (
          sprintName(project, item.sprint_id)
        )}
      </TableCell>
      <TableCell>{editable ? <EditItem {...props} /> : null}</TableCell>
    </TableRow>
  );
}

function ItemsTable(props: Props & { readonly items: readonly ProjectItem[] }): JSX.Element {
  if (props.items.length === 0) {
    return (
      <EmptyState
        icon={<ListTodo />}
        title="La lista de pendientes está vacía"
        description="Cree las épicas y las historias del proyecto, con sus criterios de aceptación."
      />
    );
  }
  return (
    <SimpleTable
      caption="Lista de pendientes"
      scrollLabel="Lista de pendientes; desplácese a los lados para ver todas las columnas"
      headers={['Ítem', 'Tipo', 'Estado', 'Prioridad', 'A cargo de', 'Iteración', 'Acción']}
    >
      {props.items.map((item) => (
        <ItemRow key={item.id} project={props.project} item={item} items={props.items} />
      ))}
    </SimpleTable>
  );
}

export function BacklogPanel({ project }: Props): JSX.Element {
  const items = useProjectItems(project.id, {});
  return (
    <QueryState query={items} loadingLabel="Cargando la lista de pendientes">
      {(data) => (
        <div className="flex flex-col gap-4">
          {project.can.manage_items ? (
            <div>
              <RecordDialog
                triggerLabel="Nuevo ítem"
                variant="outline"
                title="Nuevo ítem"
                description="Épica, historia, tarea o defecto, con su código del proyecto."
              >
                {(close) => (
                  <SaveItem project={project} item={null} items={data.data} onDone={close} />
                )}
              </RecordDialog>
            </div>
          ) : null}
          <ItemsTable project={project} items={data.data} />
        </div>
      )}
    </QueryState>
  );
}
