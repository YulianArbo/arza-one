'use client';

import type { PublicAnnouncement } from '@arza/contracts';
import { cn } from '@arza/ui';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import Image from 'next/image';
import { useState, type JSX, type KeyboardEvent } from 'react';

import { useImageUrl } from '../media/media-queries';
import { publicImagePath, usePublicAnnouncements, type AccessTab } from './public-announcements';

// Comunicados en la pantalla de acceso (B36A, decisiones del dueño): uno a la vez, con flechas y
// puntos para pasar de uno a otro, también con las flechas del teclado. Nada cambia solo.

export type CarouselTone = 'dark' | 'light';

const TONES: Readonly<Record<CarouselTone, { box: string; muted: string; control: string }>> = {
  dark: {
    box: 'bg-brand-panel-raised/80 text-brand-panel-foreground ring-1 ring-brand-panel-muted/20',
    muted: 'text-brand-panel-muted',
    control: 'border-brand-panel-muted/40 hover:bg-brand-panel-muted/15',
  },
  light: {
    box: 'border bg-card text-card-foreground',
    muted: 'text-muted-foreground',
    control: 'border-border hover:bg-muted',
  },
};

function Slide(props: {
  readonly item: PublicAnnouncement;
  readonly tone: CarouselTone;
}): JSX.Element {
  const { item, tone } = props;
  const image = useImageUrl(item.has_image ? publicImagePath(item.id) : null);
  return (
    <div className="flex flex-col gap-2">
      {image === null ? null : (
        <Image
          src={image}
          alt=""
          width={640}
          height={360}
          unoptimized
          className="max-h-40 w-full rounded-lg object-cover"
        />
      )}
      <h2 className="font-heading text-lg font-semibold">{item.title}</h2>
      <p className={cn('text-sm whitespace-pre-line', TONES[tone].muted)}>{item.body}</p>
      {item.link_url === null ? null : (
        <a
          href={item.link_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 self-start text-sm font-medium underline underline-offset-4"
        >
          Ver más
          <ExternalLink aria-hidden="true" className="size-3.5" />
          <span className="sr-only">(se abre en otra pestaña)</span>
        </a>
      )}
    </div>
  );
}

interface ControlProps {
  readonly count: number;
  readonly index: number;
  readonly tone: CarouselTone;
  readonly go: (index: number) => void;
}

/** Con el foco en cualquier control, las flechas del teclado pasan de comunicado. */
function arrowKeys(props: ControlProps) {
  return (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'ArrowLeft') props.go(props.index - 1);
    if (event.key === 'ArrowRight') props.go(props.index + 1);
  };
}

function Arrow(props: ControlProps & { readonly step: -1 | 1 }): JSX.Element {
  const label = props.step < 0 ? 'Comunicado anterior' : 'Comunicado siguiente';
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-full border',
        TONES[props.tone].control,
      )}
      onKeyDown={arrowKeys(props)}
      onClick={() => {
        props.go(props.index + props.step);
      }}
    >
      {props.step < 0 ? (
        <ChevronLeft aria-hidden="true" className="size-4" />
      ) : (
        <ChevronRight aria-hidden="true" className="size-4" />
      )}
    </button>
  );
}

function Dots(props: ControlProps): JSX.Element {
  const { count, index, go } = props;
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: count }, (_, dot) => (
        <button
          key={dot}
          type="button"
          aria-label={`Ver el comunicado ${String(dot + 1)} de ${String(count)}`}
          aria-current={dot === index ? 'true' : undefined}
          className="flex size-6 items-center justify-center"
          onKeyDown={arrowKeys(props)}
          onClick={() => {
            go(dot);
          }}
        >
          <span
            className={cn('size-2 rounded-full bg-current', dot === index ? '' : 'opacity-35')}
          />
        </button>
      ))}
    </div>
  );
}

function Controls(props: ControlProps): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <Arrow {...props} step={-1} />
      <Dots {...props} />
      <Arrow {...props} step={1} />
    </div>
  );
}

function Carousel(props: {
  readonly items: readonly PublicAnnouncement[];
  readonly tone: CarouselTone;
}): JSX.Element | null {
  const { items, tone } = props;
  const [index, setIndex] = useState(0);
  const count = items.length;
  const go = (next: number): void => {
    setIndex(((next % count) + count) % count);
  };
  const current = items[Math.min(index, count - 1)];
  if (current === undefined) return null;
  return (
    <section
      aria-roledescription="carrusel"
      aria-label="Comunicados"
      className={cn('flex flex-col gap-3 rounded-xl p-4', TONES[tone].box)}
    >
      <p className={cn('text-xs', TONES[tone].muted)} aria-live="polite">
        {count > 1 ? `Comunicado ${String(index + 1)} de ${String(count)}` : 'Comunicado'}
      </p>
      <Slide key={current.id} item={current} tone={tone} />
      {count > 1 ? <Controls count={count} index={index} tone={tone} go={go} /> : null}
    </section>
  );
}

/** Los comunicados vigentes de la pestaña; sin comunicados (o sin respuesta), no muestra nada. */
export function AnnouncementCarousel(props: {
  readonly tab: AccessTab;
  readonly tone: CarouselTone;
  readonly className?: string;
}): JSX.Element | null {
  const { data } = usePublicAnnouncements(props.tab);
  if (data === undefined || data.data.length === 0) return null;
  return (
    <div className={props.className}>
      <Carousel key={props.tab} items={data.data} tone={props.tone} />
    </div>
  );
}
