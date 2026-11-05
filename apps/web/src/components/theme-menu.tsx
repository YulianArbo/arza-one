'use client';

import { cn } from '@arza/ui';
import { Monitor, Moon, Sun } from 'lucide-react';
import type { JSX } from 'react';

import { THEME_LABELS, THEMES, type Theme } from '../lib/theme/theme';
import { useTheme } from '../lib/theme/theme-provider';

const THEME_ICONS: Record<Theme, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };

/** Selector de modo claro, oscuro o según el sistema, siempre a la vista (B22A). */
export function ThemeMenu({ className }: { readonly className?: string }): JSX.Element {
  const { theme, setTheme } = useTheme();
  return (
    <div
      role="group"
      aria-label="Apariencia"
      className={cn('inline-flex shrink-0 rounded-full border bg-card p-0.5', className)}
    >
      {THEMES.map((option) => {
        const Icon = THEME_ICONS[option];
        const pressed = theme === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={pressed}
            aria-label={THEME_LABELS[option]}
            title={THEME_LABELS[option]}
            onClick={() => {
              setTheme(option);
            }}
            className={cn(
              'inline-flex size-7 items-center justify-center rounded-full transition-colors',
              pressed
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon aria-hidden="true" className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
