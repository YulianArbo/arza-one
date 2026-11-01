import { Badge, Button } from '@arza/ui';
import { Cloud, Code2, Database, Lightbulb, Wrench, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { JSX, ReactNode } from 'react';

import { SERVICES } from './site-content';

// Secciones de la vitrina (B22A). Lo que depende de otros bloques muestra su diseño con el aviso
// «Disponible pronto» y no simula funcionar (decisión 4 del bloque).

export function SoonBadge(): JSX.Element {
  return (
    <Badge tone="info" className="w-fit">
      Disponible pronto
    </Badge>
  );
}

export function SectionHeading(props: {
  readonly id: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly children?: ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium tracking-wide text-primary uppercase">
        {props.eyebrow}
      </span>
      <h2 id={props.id} className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {props.title}
      </h2>
      {props.children}
    </div>
  );
}

export function Hero(): JSX.Element {
  return (
    <section aria-labelledby="portada" className="relative overflow-hidden border-b">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-16 sm:py-24 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-6 animate-enter">
          <h1 id="portada" className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Innovando el presente,
            <br />
            <span className="text-muted-foreground">construyendo el futuro.</span>
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Software a la medida, plataformas SaaS e infraestructura en la nube para empresas
            colombianas, con ingeniería documentada y acompañamiento de principio a fin.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/#cotizar">Solicitar cotización</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/#servicios">Ver servicios</Link>
            </Button>
          </div>
        </div>
        <VideoSlot />
      </div>
    </section>
  );
}

/** Lugar del video institucional; el video lo entrega la empresa. */
function VideoSlot(): JSX.Element {
  return (
    <figure className="flex aspect-video flex-col items-center justify-center gap-3 rounded-xl border bg-card p-6 text-center animate-enter">
      <SoonBadge />
      <figcaption className="text-sm text-muted-foreground">
        Video institucional de ARZA TECH
      </figcaption>
    </figure>
  );
}

const SERVICE_ICONS: readonly LucideIcon[] = [Code2, Lightbulb, Cloud, Database, Wrench];

export function ServicesSection(): JSX.Element {
  return (
    <section
      aria-labelledby="servicios-titulo"
      id="servicios"
      className="mx-auto flex w-full max-w-6xl scroll-mt-20 flex-col gap-8 px-4 py-16"
    >
      <SectionHeading
        id="servicios-titulo"
        eyebrow="01 — Servicios"
        title="Servicios para cada etapa de su negocio"
      />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SERVICES.map((service, index) => {
          const Icon = SERVICE_ICONS[index] ?? Code2;
          return (
            <li
              key={service.title}
              className="flex flex-col gap-3 rounded-xl border bg-card p-5 hover-invert"
            >
              <Icon aria-hidden="true" className="size-5 text-primary" />
              <h3 className="font-medium">{service.title}</h3>
              <p className="text-sm text-muted-foreground">{service.text}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Sección cuyo contenido llega con otro bloque: su encabezado y el aviso, sin datos simulados. */
export function SoonSection(props: {
  readonly id: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly text: string;
}): JSX.Element {
  return (
    <section
      aria-labelledby={`${props.id}-titulo`}
      id={props.id}
      className="mx-auto flex w-full max-w-6xl scroll-mt-20 flex-col gap-6 px-4 py-16"
    >
      <SectionHeading id={`${props.id}-titulo`} eyebrow={props.eyebrow} title={props.title} />
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
        <SoonBadge />
        <p className="text-sm text-muted-foreground">{props.text}</p>
      </div>
    </section>
  );
}
