'use client';

import type { Folder } from '@arza/contracts';
import { cn } from '@arza/ui';
import { Folder as FolderIcon, FolderOpen, Library } from 'lucide-react';
import type { JSX } from 'react';

// Árbol de carpetas y expedientes del explorador (B18). Cada carpeta es un botón: con el teclado se
// recorre con Tab y se abre con Intro, y la elegida se anuncia con aria-current.

interface FolderTreeProps {
  readonly folders: readonly Folder[];
  readonly selected: string | null;
  readonly onSelect: (id: string | null) => void;
}

function childrenOf(folders: readonly Folder[], parentId: string | null): Folder[] {
  return folders.filter((folder) => folder.parent_id === parentId);
}

function itemClass(active: boolean): string {
  return cn(
    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
    active ? 'bg-accent font-medium text-accent-foreground' : 'hover:bg-muted',
  );
}

function Branch(props: FolderTreeProps & { readonly parentId: string | null }): JSX.Element | null {
  const items = childrenOf(props.folders, props.parentId);
  if (items.length === 0) return null;
  return (
    <ul
      className={props.parentId === null ? 'flex flex-col gap-0.5' : 'ml-4 flex flex-col gap-0.5'}
    >
      {items.map((folder) => {
        const active = folder.id === props.selected;
        const Icon = folder.kind === 'case_file' ? FolderOpen : FolderIcon;
        return (
          <li key={folder.id}>
            <button
              type="button"
              className={itemClass(active)}
              aria-current={active ? 'true' : undefined}
              onClick={() => {
                props.onSelect(folder.id);
              }}
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              <span className="flex-1">{folder.name}</span>
              {folder.document_count > 0 ? (
                <span className="text-xs text-muted-foreground">{folder.document_count}</span>
              ) : null}
            </button>
            <Branch {...props} parentId={folder.id} />
          </li>
        );
      })}
    </ul>
  );
}

export function FolderTree(props: FolderTreeProps): JSX.Element {
  return (
    <nav aria-label="Carpetas y expedientes" className="flex flex-col gap-1">
      <button
        type="button"
        className={itemClass(props.selected === null)}
        aria-current={props.selected === null ? 'true' : undefined}
        onClick={() => {
          props.onSelect(null);
        }}
      >
        <Library aria-hidden className="size-4" />
        Todos los documentos
      </button>
      <Branch {...props} parentId={null} />
    </nav>
  );
}
