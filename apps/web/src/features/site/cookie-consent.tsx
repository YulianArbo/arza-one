'use client';

import {
  COOKIE_CATEGORIES,
  COOKIE_CONSENT_COOKIE,
  COOKIE_CONSENT_DAYS,
  cookieChoiceExpired,
  cookieConsentResponseSchema,
  decodeCookieChoice,
  encodeCookieChoice,
  publicLegalTextSchema,
  type CookieCategory,
  type StoredCookieChoice,
} from '@arza/contracts';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@arza/ui';
import { Cookie } from 'lucide-react';
import Link from 'next/link';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from 'react';

import type { ApiClient } from '../../lib/api/api-client';
import { useApiClient } from '../../lib/api/api-provider';
import { useTheme } from '../../lib/theme/theme-provider';

// Aviso y centro de preferencias de cookies del sitio público (B41, numeral 20.4). Aparece en la
// primera visita sin bloquear la lectura, con tres botones del mismo tamaño y jerarquía; las
// categorías no necesarias vienen desmarcadas y nada no necesario se instala antes de elegir. La
// elección se guarda en una cookie necesaria y se registra en la API con la versión de la política;
// se vuelve a pedir a los doce meses o cuando cambia la política.

interface CookieConsentState {
  readonly openPreferences: () => void;
}

const CookieConsentContext = createContext<CookieConsentState | null>(null);

function readChoice(): StoredCookieChoice | null {
  const entry = document.cookie
    .split('; ')
    .find((item) => item.startsWith(`${COOKIE_CONSENT_COOKIE}=`));
  return decodeCookieChoice(entry?.slice(COOKIE_CONSENT_COOKIE.length + 1));
}

function writeChoice(choice: StoredCookieChoice): void {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  const maxAge = String(COOKIE_CONSENT_DAYS * 86_400);
  const value = encodeURIComponent(encodeCookieChoice(choice));
  document.cookie = `${COOKIE_CONSENT_COOKIE}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

/** La versión publicada de la política de cookies; null si no hay una publicada. */
async function policyVersion(api: ApiClient): Promise<number | null> {
  try {
    const policy = await api.get('/v1/public/legal/cookie_policy', {
      schema: publicLegalTextSchema,
    });
    return policy.version_number;
  } catch {
    return null;
  }
}

/** Guarda la elección y la registra; si la API no responde, la elección igual se respeta. */
function useDecide(version: number | null, onDone: (choice: StoredCookieChoice) => void) {
  const api = useApiClient();
  return useCallback(
    (preferences: boolean) => {
      const choice: StoredCookieChoice = {
        visitorId: readChoice()?.visitorId ?? crypto.randomUUID(),
        policyVersion: version ?? 0,
        preferences,
        decidedAt: new Date().toISOString(),
      };
      writeChoice(choice);
      onDone(choice);
      if (version === null) return;
      const body = {
        visitor_id: choice.visitorId,
        policy_version: version,
        choice: { preferences },
      };
      api
        .post('/v1/public/cookie-consent', { body, schema: cookieConsentResponseSchema })
        .catch(() => undefined);
    },
    [api, version, onDone],
  );
}

const OPTIONAL: readonly CookieCategory[] = ['preferences', 'analytics', 'advertising'];

function CategoryRow(props: {
  readonly category: CookieCategory;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}): JSX.Element {
  const info = COOKIE_CATEGORIES[props.category];
  const id = `cookies-${props.category}`;
  return (
    <li className="flex items-start gap-3 rounded-lg border p-3">
      <Checkbox
        id={id}
        className="mt-1"
        checked={props.checked}
        disabled={!info.optional || !info.used}
        aria-describedby={`${id}-texto`}
        onChange={(event) => {
          props.onChange(event.target.checked);
        }}
      />
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="text-sm font-medium">
          {info.label}
          {info.optional ? null : ' (siempre activas)'}
        </label>
        <p id={`${id}-texto`} className="text-sm text-muted-foreground">
          {info.text}
        </p>
      </div>
    </li>
  );
}

/** Las casillas del centro de preferencias; se monta de nuevo cada vez que se abre. */
function PreferencesBody(props: {
  readonly initial: boolean;
  readonly onSave: (preferences: boolean) => void;
}): JSX.Element {
  const [preferences, setPreferences] = useState(props.initial);
  return (
    <>
      <ul className="flex flex-col gap-2">
        <CategoryRow category="necessary" checked onChange={() => undefined} />
        {OPTIONAL.map((category) => (
          <CategoryRow
            key={category}
            category={category}
            checked={category === 'preferences' && preferences}
            onChange={setPreferences}
          />
        ))}
      </ul>
      <DialogFooter>
        <Button
          type="button"
          onClick={() => {
            props.onSave(preferences);
          }}
        >
          Guardar mis preferencias
        </Button>
      </DialogFooter>
    </>
  );
}

function PreferencesDialog(props: {
  readonly open: boolean;
  readonly initial: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSave: (preferences: boolean) => void;
}): JSX.Element {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Preferencias de cookies</DialogTitle>
          <DialogDescription>
            Elija qué cookies acepta. Puede cambiar su decisión cuando quiera desde el pie de
            página. Lea la{' '}
            <Link href="/legal/cookies" className="text-primary underline underline-offset-4">
              política de cookies
            </Link>
            .
          </DialogDescription>
        </DialogHeader>
        {props.open ? <PreferencesBody initial={props.initial} onSave={props.onSave} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Banner(props: {
  readonly onAccept: () => void;
  readonly onReject: () => void;
  readonly onConfigure: () => void;
}): JSX.Element {
  const buttons = [
    { label: 'Aceptar todas', onClick: props.onAccept },
    { label: 'Rechazar las no necesarias', onClick: props.onReject },
    { label: 'Configurar', onClick: props.onConfigure },
  ];
  return (
    <section
      aria-labelledby="aviso-cookies-titulo"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-card p-4 animate-enter"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-1 flex-col gap-1">
          <h2 id="aviso-cookies-titulo" className="flex items-center gap-2 font-semibold">
            <Cookie aria-hidden="true" className="size-4" />
            Usamos cookies
          </h2>
          <p className="text-sm text-muted-foreground">
            Las necesarias hacen funcionar el sitio. Con su permiso, también recordamos si prefiere
            el modo claro u oscuro. No usamos analítica ni publicidad.{' '}
            <Link href="/legal/cookies" className="text-primary underline underline-offset-4">
              Política de cookies
            </Link>
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 lg:w-[36rem]">
          {buttons.map((button) => (
            <Button key={button.label} type="button" variant="outline" onClick={button.onClick}>
              {button.label}
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Lo que pide y recuerda el aviso: la elección guardada y si hay que preguntar. */
function useConsentState() {
  const api = useApiClient();
  const { setRemember } = useTheme();
  const [version, setVersion] = useState<number | null | undefined>(undefined);
  // La elección solo se lee en el navegador; el aviso no se pinta hasta conocer la política, así
  // que la primera pintura es igual en el servidor y en el navegador.
  const [choice, setChoice] = useState<StoredCookieChoice | null>(() =>
    typeof document === 'undefined' ? null : readChoice(),
  );
  const [dialog, setDialog] = useState(false);
  useEffect(() => {
    setRemember(readChoice()?.preferences ?? false);
    void policyVersion(api).then(setVersion);
    // Al salir del sitio público, la aplicación y el portal vuelven a recordar el modo.
    return () => {
      setRemember(true);
    };
  }, [api, setRemember]);
  const onDone = useCallback(
    (next: StoredCookieChoice) => {
      setChoice(next);
      setRemember(next.preferences);
      setDialog(false);
    },
    [setRemember],
  );
  const decide = useDecide(version ?? null, onDone);
  const ask = version !== undefined && cookieChoiceExpired(choice, version, new Date());
  return { choice, ask, decide, dialog, setDialog };
}

export function CookieConsentProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const { choice, ask, decide, dialog, setDialog } = useConsentState();
  const value = useMemo(
    () => ({
      openPreferences: () => {
        setDialog(true);
      },
    }),
    [setDialog],
  );
  return (
    <CookieConsentContext value={value}>
      {children}
      {ask && !dialog ? (
        <Banner
          onAccept={() => {
            decide(true);
          }}
          onReject={() => {
            decide(false);
          }}
          onConfigure={() => {
            setDialog(true);
          }}
        />
      ) : null}
      <PreferencesDialog
        open={dialog}
        initial={choice?.preferences ?? false}
        onOpenChange={setDialog}
        onSave={decide}
      />
    </CookieConsentContext>
  );
}

/** Enlace del pie de página para cambiar la decisión en cualquier momento. */
export function CookiePreferencesLink(): JSX.Element | null {
  const state = use(CookieConsentContext);
  if (state === null) return null;
  return (
    <button
      type="button"
      onClick={state.openPreferences}
      className="flex items-center gap-1.5 text-left text-muted-foreground hover:text-foreground"
    >
      <Cookie aria-hidden="true" className="size-4 shrink-0" />
      Preferencias de cookies
    </button>
  );
}
