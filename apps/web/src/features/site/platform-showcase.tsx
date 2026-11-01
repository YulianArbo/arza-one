'use client';

import { cn } from '@arza/ui';
import { useState, type JSX } from 'react';

import { PLATFORM_MODULES } from './site-content';
import { SectionHeading } from './site-sections';

// Sección «ARZA ONE» de la vitrina (B22A): los módulos que ya funcionan, uno a la vez.

type ModuleKey = (typeof PLATFORM_MODULES)[number]['key'];

function ModuleChoices(props: {
  readonly selected: ModuleKey;
  readonly onSelect: (key: ModuleKey) => void;
}): JSX.Element {
  return (
    <div role="group" aria-label="Módulos de la plataforma" className="flex flex-col gap-1">
      {PLATFORM_MODULES.map((module) => {
        const on = module.key === props.selected;
        return (
          <button
            key={module.key}
            type="button"
            aria-pressed={on}
            onClick={() => {
              props.onSelect(module.key);
            }}
            className={cn(
              'min-h-11 border-l-2 px-3 text-left text-sm transition-colors',
              on
                ? 'border-action bg-card font-medium'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {module.name}
          </button>
        );
      })}
    </div>
  );
}

export function PlatformShowcase(): JSX.Element {
  const [selected, setSelected] = useState<ModuleKey>('documentos');
  const current = PLATFORM_MODULES.find((module) => module.key === selected) ?? PLATFORM_MODULES[0];
  return (
    <section aria-labelledby="plataforma-titulo" id="plataforma" className="border-y bg-muted/40">
      <div className="mx-auto grid w-full max-w-6xl scroll-mt-20 gap-8 px-4 py-16 lg:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col gap-6">
          <SectionHeading
            id="plataforma-titulo"
            eyebrow="02 — ARZA ONE"
            title="Una plataforma para toda la empresa"
          >
            <p className="text-muted-foreground">
              Documentos, terceros, oportunidades, flujos de aprobación, privacidad y auditoría, con
              permisos por rol y trazabilidad completa.
            </p>
          </SectionHeading>
          <ModuleChoices selected={selected} onSelect={setSelected} />
        </div>
        <div
          aria-live="polite"
          className="flex flex-col gap-3 self-start rounded-xl border bg-card p-6 shadow-sm"
        >
          <span className="text-xs text-muted-foreground">{current.name}</span>
          <h3 className="text-xl font-semibold">{current.title}</h3>
          <p className="text-muted-foreground">{current.text}</p>
        </div>
      </div>
    </section>
  );
}
