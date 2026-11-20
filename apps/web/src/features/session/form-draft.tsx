'use client';

import { useToast } from '@arza/ui';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, type JSX } from 'react';

import { useSession } from './session-provider';

// Borrador al vencer la sesión (numeral 16.5, B22B F4d, aprobado el 20/11/2026): lo escrito en los
// formularios abiertos se guarda solo en esta pestaña (sessionStorage) y vuelve a los campos cuando
// la persona, tras iniciar sesión, abre de nuevo el formulario. Nunca se guardan contraseñas,
// códigos ni datos bancarios.

const STORAGE_KEY = 'arza.form-draft';
const TEXT_TYPES = new Set(['text', 'email', 'tel', 'url', 'number', 'date', 'datetime-local']);
const SENSITIVE =
  /contrase|password|clave|c[oó]digo|code|token|otp|secret|banc|cuenta|tarjeta|card|cvv|iban/iu;

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

interface DraftField {
  readonly id: string;
  readonly value: string;
}

interface Draft {
  readonly userId: string;
  readonly path: string;
  readonly fields: readonly DraftField[];
}

function isControl(element: Element | null): element is Control {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  );
}

/** Solo campos de un formulario, con identificador estable y que no sean sensibles. */
function isSavable(control: Control): boolean {
  if (control.closest('form') === null || control.disabled) return false;
  if (control.id === '' || control.id.includes(':') || control.id.includes('«')) return false;
  if (control instanceof HTMLInputElement && !TEXT_TYPES.has(control.type)) return false;
  const label = control.labels?.[0]?.textContent ?? '';
  return !SENSITIVE.test(`${control.id} ${control.name} ${control.autocomplete} ${label}`);
}

/** Guarda lo escrito en esta pestaña; si no hay nada escrito, no guarda nada. */
export function saveFormDraft(userId: string, path: string): void {
  const controls = [...document.querySelectorAll('input, textarea, select')]
    .filter(isControl)
    .filter((control) => isSavable(control) && control.value !== '');
  // Una lista desplegable con su valor inicial no es algo que la persona haya escrito.
  if (controls.every((control) => control instanceof HTMLSelectElement)) return;
  const fields = controls.map((control) => ({ id: control.id, value: control.value }));
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ userId, path, fields }));
  } catch {
    // Sin almacenamiento (navegación privada), simplemente no hay borrador.
  }
}

function readDraft(): Draft | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw === null ? null : (JSON.parse(raw) as Draft);
  } catch {
    return null;
  }
}

function clearDraft(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nada que limpiar.
  }
}

/** Escribe el valor como si lo tecleara la persona, para que React lo tome. */
function fill(control: Control, value: string): void {
  // El valor se pone con el método nativo; si no, React no ve el cambio.
  Reflect.set(Object.getPrototypeOf(control) as object, 'value', value, control);
  const kind = control instanceof HTMLSelectElement ? 'change' : 'input';
  control.dispatchEvent(new Event(kind, { bubbles: true }));
}

/** Una lista desplegable recibe sus opciones después de abrir: se espera a que llegue la del borrador. */
function hasOption(control: Control, value: string): boolean {
  if (!(control instanceof HTMLSelectElement)) return true;
  return [...control.options].some((option) => option.value === value);
}

/** Llena, uno por uno, los campos guardados que ya están en pantalla; devuelve los que faltan. */
async function fillVisible(fields: readonly DraftField[]): Promise<DraftField[]> {
  const missing: DraftField[] = [];
  for (const field of fields) {
    const control = document.getElementById(field.id);
    if (!isControl(control) || !hasOption(control, field.value)) {
      missing.push(field);
      continue;
    }
    fill(control, field.value);
    // Cada campo se confirma antes del siguiente: los formularios guardan sus valores juntos.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return missing;
}

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
