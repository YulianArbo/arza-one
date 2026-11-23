import { Button } from '@arza/ui';
import {
  FileSearch,
  LogIn,
  Mail,
  MapPin,
  MessageCircle,
  MessagesSquare,
  Phone,
  SquareUser,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { COMPANY } from './site-content';
import { ContactForm, QuoteForm } from './site-forms';
import { SectionHeading, SoonBadge } from './site-sections';

// Atención en la vitrina (B22A): cotización y contacto (B41), verificar documento (B25), PQRSF
// (B29) y acceso a la plataforma. Lo que no funciona todavía lo dice.

export function QuoteSection(): JSX.Element {
  return (
    <section
      aria-labelledby="cotizar-titulo"
      id="cotizar"
      className="mx-auto grid w-full max-w-6xl scroll-mt-20 gap-8 px-4 py-16 lg:grid-cols-2"
    >
      <SectionHeading id="cotizar-titulo" eyebrow="05 — Cotización" title="Cotice su proyecto">
        <p className="text-muted-foreground">
          Cuéntenos qué necesita. Un consultor revisa su solicitud y le responde con alcance, plazo
          y valor.
        </p>
      </SectionHeading>
      <div className="rounded-xl border bg-card p-6">
        <QuoteForm />
      </div>
    </section>
  );
}

function DeskCard(props: {
  readonly id: string;
  readonly icon: LucideIcon;
  readonly title: string;
  readonly text: string;
  /** La página que ya funciona; sin ella, la tarjeta dice «Disponible pronto». */
  readonly href?: string;
  readonly action?: string;
}): JSX.Element {
  const Icon = props.icon;
  return (
    <article
      id={props.id}
      aria-labelledby={`${props.id}-titulo`}
      className="flex scroll-mt-20 flex-col gap-3 rounded-xl border bg-card p-6"
    >
      <Icon aria-hidden="true" className="size-5 text-primary" />
      <h2 id={`${props.id}-titulo`} className="text-lg font-semibold">
        {props.title}
      </h2>
      <p className="text-sm text-muted-foreground">{props.text}</p>
      {props.href === undefined ? (
        <SoonBadge />
      ) : (
        <Button asChild variant="outline" className="self-start">
          <Link href={props.href}>{props.action}</Link>
        </Button>
      )}
    </article>
  );
}

export function DeskSection(): JSX.Element {
  return (
    <section
      aria-label="Verificación y PQRSF"
      className="mx-auto grid w-full max-w-6xl gap-4 px-4 pb-16 md:grid-cols-2"
    >
      <DeskCard
        id="verificar"
        icon={FileSearch}
        title="Verificar un documento"
        text="Compruebe que un documento firmado electrónicamente en ARZA ONE es el original, con su código o con el archivo."
        href="/verificar"
        action="Verificar un documento"
      />
      <DeskCard
        id="pqrsf"
        icon={MessagesSquare}
        title="Peticiones, quejas, reclamos, sugerencias y felicitaciones"
        text="Radique su solicitud o consulte su estado con el número de radicado."
        href="/pqrsf"
        action="Radicar o consultar una PQRSF"
      />
    </section>
  );
}

const CONTACTS: readonly {
  readonly label: string;
  readonly value: string;
  readonly icon: LucideIcon;
}[] = [
  { label: 'Teléfono', value: COMPANY.phone, icon: Phone },
  { label: 'WhatsApp', value: COMPANY.whatsapp, icon: MessageCircle },
  { label: 'Correo', value: COMPANY.email, icon: Mail },
  { label: 'Oficina', value: COMPANY.address, icon: MapPin },
];

export function ContactSection(): JSX.Element {
  return (
    <section aria-labelledby="contacto-titulo" id="contacto" className="border-t bg-muted/40">
      <div className="mx-auto flex w-full max-w-6xl scroll-mt-20 flex-col gap-8 px-4 py-16">
        <SectionHeading
          id="contacto-titulo"
          eyebrow="06 — Contacto"
          title="Hablemos de su proyecto"
        >
          <p className="text-muted-foreground">Atención: {COMPANY.hours}</p>
        </SectionHeading>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CONTACTS.map((contact) => (
            <li key={contact.label} className="flex flex-col gap-2 rounded-xl border bg-card p-5">
              <contact.icon aria-hidden="true" className="size-5 text-primary" />
              <span className="text-sm text-muted-foreground">{contact.label}</span>
              <span className="font-medium break-words">{contact.value}</span>
            </li>
          ))}
        </ul>
        <div className="max-w-3xl rounded-xl border bg-card p-6">
          <h3 className="mb-4 text-lg font-semibold">Escríbanos</h3>
          <ContactForm />
        </div>
      </div>
    </section>
  );
}

export function AccessBand(): JSX.Element {
  return (
    <section
      aria-labelledby="clientes-titulo"
      className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-16 lg:grid-cols-[1.4fr_1fr]"
    >
      <div className="flex flex-col gap-4 rounded-xl border-2 border-primary bg-card p-8">
        <h2 id="clientes-titulo" className="text-2xl font-semibold">
          ¿Ya trabaja con nosotros?
        </h2>
        <p className="text-muted-foreground">
          Ingrese para seguir sus proyectos, firmar documentos y pedir soporte.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/iniciar-sesion">
              <LogIn aria-hidden="true" />
              Iniciar sesión
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/iniciar-sesion">
              <SquareUser aria-hidden="true" />
              Portal de clientes
            </Link>
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-8">
        <h2 className="text-lg font-semibold">Boletín mensual</h2>
        <p className="text-sm text-muted-foreground">
          Novedades, eventos y ofertas. Podrá darse de baja cuando quiera.
        </p>
        <SoonBadge />
      </div>
    </section>
  );
}
