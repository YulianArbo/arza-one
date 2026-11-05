import { cva, type VariantProps } from 'class-variance-authority';
import type { JSX } from 'react';

import { cn } from '../lib/cn.js';

const avatarVariants = cva(
  'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-action font-semibold text-action-foreground',
  {
    variants: {
      size: {
        sm: 'size-7 text-[11px]',
        md: 'size-9 text-xs',
        lg: 'size-22 text-2xl',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

export interface AvatarProps extends VariantProps<typeof avatarVariants> {
  /** Nombre de la persona o de la empresa; da las iniciales y el texto alternativo. */
  readonly name: string;
  /** Foto o logo. Sin él se muestran las iniciales. */
  readonly src?: string | null | undefined;
  readonly className?: string;
}

/** Hasta dos iniciales: «Ana Pérez» → «AP», «Demo Uno S.A.S.» → «DU». */
function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => /^\p{L}/u.test(word));
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

/** Foto o logo en un círculo; si no hay imagen, las iniciales (B22A). */
export function Avatar({ name, src, size, className }: AvatarProps): JSX.Element {
  return (
    <span className={cn(avatarVariants({ size }), className)}>
      {src ? (
        <img src={src} alt={name} className="size-full object-cover" />
      ) : (
        <span role="img" aria-label={name}>
          {initials(name)}
        </span>
      )}
    </span>
  );
}
