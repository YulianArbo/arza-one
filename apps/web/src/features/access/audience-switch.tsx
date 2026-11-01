'use client';

import { cn } from '@arza/ui';
import { Building2, Users } from 'lucide-react';
import type { JSX } from 'react';

export type Audience = 'empresa' | 'clientes';

/** Explicación del inicio de sesión para cada tipo de acceso. */
export const AUDIENCE_DESCRIPTIONS: Record<Audience, string> = {
  empresa: 'Entre a ARZA ONE con el correo y la contraseña de su cuenta.',
  clientes: 'Consulte sus proyectos, firmas y facturas con la cuenta de su empresa.',
};

const OPTIONS = [
  { value: 'empresa', label: 'Plataforma empresarial', Icon: Building2 },
  { value: 'clientes', label: 'Portal de clientes', Icon: Users },
] as const;

interface AudienceSwitchProps {
  readonly value: Audience;
  readonly onChange: (value: Audience) => void;
}

/**
 * Selector de tipo de acceso (B22A). Las dos opciones usan el mismo ingreso: la plataforma lleva a
 * cada persona a su portal según su cuenta. Solo cambia la explicación de la pantalla.
 */
export function AudienceSwitch({ value, onChange }: AudienceSwitchProps): JSX.Element {
  return (
    <div
      role="group"
      aria-label="Tipo de acceso"
      className="grid grid-cols-2 gap-1 rounded-xl border bg-muted p-1"
    >
      {OPTIONS.map(({ value: option, label, Icon }) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => {
            onChange(option);
          }}
          className={cn(
            'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg text-[13px] transition-colors',
            value === option
              ? 'bg-card font-medium text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon aria-hidden="true" className="size-4" />
          {label}
        </button>
      ))}
    </div>
  );
}
