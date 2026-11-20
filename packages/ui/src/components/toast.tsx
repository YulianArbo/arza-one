import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type JSX,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

// Aviso breve de éxito (numeral 16.5, B22B): confirmación no intrusiva que se cierra sola. La zona
// es una región viva «polite», así el lector de pantalla lo anuncia sin interrumpir.

const subscribe = (): (() => void) => () => undefined;

/** Tiempo que el aviso queda a la vista. */
const VISIBLE_MS = 5000;

interface Toast {
  readonly id: number;
  readonly message: string;
}

interface ToastApi {
  /** Muestra un aviso breve. Sin proveedor no hace nada: la pantalla igual refleja el cambio. */
  readonly notify: (message: string) => void;
}

const ToastContext = createContext<ToastApi>({ notify: () => undefined });

/** Avisos de la pantalla actual. */
export function useToast(): ToastApi {
  return useContext(ToastContext);
}

function CheckIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5 shrink-0 text-success"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ToastItem({
  toast,
  onClose,
}: {
  readonly toast: Toast;
  readonly onClose: (id: number) => void;
}): JSX.Element {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      onClose(toast.id);
    }, VISIBLE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [toast.id, onClose]);
  return (
    <li className="flex items-start gap-3 rounded-xl border bg-popover p-4 text-sm text-popover-foreground shadow-lg animate-enter">
      <CheckIcon />
      <p className="flex-1">{toast.message}</p>
      <button
        type="button"
        onClick={() => {
          onClose(toast.id);
        }}
        className="rounded-md px-1 text-muted-foreground hover:text-foreground"
        aria-label="Cerrar aviso"
      >
        ×
      </button>
    </li>
  );
}

/** Proveedor de avisos: lo pone la aplicación una vez, alrededor de todas las pantallas. */
export function ToastProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const next = useRef(0);
  const notify = useCallback((message: string) => {
    next.current += 1;
    const toast = { id: next.current, message };
    setToasts((current) => [...current.slice(-2), toast]);
  }, []);
  const close = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const api = useMemo(() => ({ notify }), [notify]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastRegion toasts={toasts} onClose={close} />
    </ToastContext.Provider>
  );
}

/**
 * Zona de los avisos, en el cuerpo de la página y fuera del contenido de cada pantalla. Se crea al
 * cargar en el navegador, antes del primer aviso, para que el lector de pantalla lo anuncie.
 */
function ToastRegion({
  toasts,
  onClose,
}: {
  readonly toasts: readonly Toast[];
  readonly onClose: (id: number) => void;
}): JSX.Element | null {
  // true en el navegador y false al generar la página en el servidor, sin estado extra.
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  if (!mounted) return null;
  return createPortal(
    <div aria-live="polite" className="fixed right-4 bottom-4 z-50 w-[min(24rem,calc(100%-2rem))]">
      {toasts.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onClose={onClose} />
          ))}
        </ul>
      ) : null}
    </div>,
    document.body,
  );
}
