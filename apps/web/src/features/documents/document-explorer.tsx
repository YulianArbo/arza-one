'use client';

import type { Document, Folder } from '@arza/contracts';
import { Badge, EmptyState, TableCell, TableRow, buttonVariants } from '@arza/ui';
import { FileText } from 'lucide-react';
import Link from 'next/link';
import { useState, type JSX } from 'react';

import { Pager } from '../administration/pager';
import { QueryState } from '../administration/query-state';
import { SimpleTable } from '../administration/simple-table';
import { RecordDialog, TextInput } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import { NewCaseFileForm, NewFolderForm } from './folder-forms';
import { FolderTree } from './folder-tree';
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_TONES,
  documentPath,
  newDocumentPath,
} from './labels';
import { useDocuments, useFolders } from './queries';

// Explorador de expedientes (B18, numeral 16.7): el árbol de carpetas a la izquierda y los
// documentos de la carpeta elegida a la derecha, con búsqueda por código y título.

function DocumentRow({ document }: { readonly document: Document }): JSX.Element {
  return (
    <TableRow>
      <TableCell>
        <Link href={documentPath(document.id)} className="font-medium text-primary hover:underline">
          {document.code}
        </Link>
      </TableCell>
      <TableCell>
        <p>{document.title}</p>
        <p className="text-xs text-muted-foreground">
          {document.doc_type_label}
          {document.process === null ? '' : ` · ${document.process.name}`}
        </p>
      </TableCell>
      <TableCell>{document.current_version?.label ?? '—'}</TableCell>
      <TableCell>
        <Badge tone={DOCUMENT_STATUS_TONES[document.status]}>
          {DOCUMENT_STATUS_LABELS[document.status]}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

function DocumentTable(props: {
  readonly documents: readonly Document[];
  readonly canCreate: boolean;
  readonly folderId: string | null;
}): JSX.Element {
  if (props.documents.length === 0) {
    return (
      <EmptyState
        icon={<FileText />}
        title="No hay documentos aquí"
        description="Los documentos de esta carpeta aparecerán con su código, versión vigente y estado."
        action={
          props.canCreate ? (
            <Link href={newDocumentPath(props.folderId)} className={buttonVariants()}>
              Crear el primer documento
            </Link>
          ) : undefined
        }
      />
    );
  }
  return (
    <SimpleTable headers={['Código', 'Documento', 'Versión vigente', 'Estado']}>
      {props.documents.map((document) => (
        <DocumentRow key={document.id} document={document} />
      ))}
    </SimpleTable>
  );
}

function DocumentPanel({ folderId }: { readonly folderId: string | null }): JSX.Element {
  const [search, setSearch] = useState('');
  const [cursors, setCursors] = useState<readonly string[]>([]);
  const cursor = cursors.at(-1) ?? null;
  const documents = useDocuments(folderId, search.trim(), cursor);
  const canCreate = usePermissions().can('doc.document.create');
  return (
    <div className="flex flex-col gap-4">
      <TextInput
        id="documentos-buscar"
        label="Buscar por código o título"
        value={search}
        hint="Escriba al menos dos letras."
        onValue={(value) => {
          setSearch(value);
          setCursors([]);
        }}
      />
      <QueryState query={documents} loadingLabel="Cargando los documentos">
        {(page) => (
          <>
            <DocumentTable documents={page.data} canCreate={canCreate} folderId={folderId} />
            <Pager
              page={page}
              hasPrevious={cursors.length > 0}
              onPrevious={() => {
                setCursors(cursors.slice(0, -1));
              }}
              onNext={(next) => {
                setCursors([...cursors, next]);
              }}
            />
          </>
        )}
      </QueryState>
    </div>
  );
}

interface CreateProps {
  readonly folder: Folder | null;
  readonly onCreated: (id: string) => void;
}

/** Diálogo de una carpeta o un expediente nuevo dentro de la carpeta abierta. */
function CreateFolderDialog(props: CreateProps & { readonly caseFile: boolean }): JSX.Element {
  const parentId = props.folder?.id ?? null;
  const Form = props.caseFile ? NewCaseFileForm : NewFolderForm;
  return (
    <RecordDialog
      triggerLabel={props.caseFile ? 'Nuevo expediente' : 'Nueva carpeta'}
      variant="outline"
      title={props.caseFile ? 'Expediente de un tercero' : 'Nueva carpeta'}
      description={
        props.caseFile
          ? 'Cada cliente o proveedor tiene un solo expediente.'
          : `Se crea dentro de «${props.folder?.name ?? 'la raíz'}».`
      }
    >
      {(close) => (
        <Form
          parentId={parentId}
          onSaved={(id) => {
            close();
            props.onCreated(id);
          }}
        />
      )}
    </RecordDialog>
  );
}

function ExplorerActions(props: CreateProps): JSX.Element | null {
  const permissions = usePermissions();
  if (!permissions.can('doc.document.create')) return null;
  const caseFiles = permissions.can('party.read') && props.folder?.kind !== 'case_file';
  return (
    <div className="flex flex-wrap gap-2">
      <Link href={newDocumentPath(props.folder?.id ?? null)} className={buttonVariants()}>
        Nuevo documento
      </Link>
      <CreateFolderDialog {...props} caseFile={false} />
      {caseFiles ? <CreateFolderDialog {...props} caseFile /> : null}
    </div>
  );
}

/** Explorador de expedientes: carpetas, expedientes y sus documentos. */
export function DocumentExplorer(): JSX.Element {
  const folders = useFolders();
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <QueryState query={folders} loadingLabel="Cargando las carpetas">
      {(data) => {
        const folder = data.data.find((item) => item.id === selected) ?? null;
        return (
          <div className="flex flex-col gap-6">
            <ExplorerActions folder={folder} onCreated={setSelected} />
            <div className="grid gap-6 md:grid-cols-[18rem_1fr]">
              <FolderTree folders={data.data} selected={selected} onSelect={setSelected} />
              <section aria-label={folder?.name ?? 'Todos los documentos'}>
                <h2 className="mb-3 text-lg font-semibold">
                  {folder?.name ?? 'Todos los documentos'}
                </h2>
                <DocumentPanel key={selected ?? 'todos'} folderId={selected} />
              </section>
            </div>
          </div>
        );
      }}
    </QueryState>
  );
}
