'use client';

import { useToast } from '@arza/ui';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, type JSX } from 'react';

import { clearDraft, fillVisible, readDraft, type DraftField } from './form-draft';
import { useSession } from './session-provider';

// Recuperación del borrador guardado al vencer la sesión (B22B F4d); ver form-draft.ts.

const NOTICE =
  'Guardamos lo que estaba escribiendo cuando venció la sesión. Abra de nuevo el formulario y lo encontrará.';

/** Devuelve el borrador a sus campos cuando aparecen; salir de la pantalla lo descarta. */
export function FormDraftRestore(): JSX.Element | null {
  useDraftRestore(useSession().session.user.id);
  return null;
}

function useDraftRestore(userId: string): void {
  const pathname = usePathname();
  const { notify } = useToast();
  const noticed = useRef(false);
  useEffect(() => {
    const draft = readDraft();
    if (draft === null) return;
    if (draft.userId !== userId || draft.path !== pathname) {
      clearDraft();
      return;
    }
    if (!noticed.current) notify(NOTICE);
    noticed.current = true;
    let pending: readonly DraftField[] = draft.fields;
    let busy = false;
    const restore = async (): Promise<void> => {
      if (busy) return;
      busy = true;
      pending = await fillVisible(pending);
      busy = false;
      if (pending.length === 0) {
        clearDraft();
        observer.disconnect();
      }
    };
    const observer = new MutationObserver(() => void restore());
    observer.observe(document.body, { childList: true, subtree: true });
    void restore();
    return () => {
      observer.disconnect();
    };
  }, [userId, pathname, notify]);
}
