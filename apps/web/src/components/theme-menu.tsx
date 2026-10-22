'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@arza/ui';
import { Monitor, Moon, Sun } from 'lucide-react';
import type { JSX } from 'react';

import { parseTheme, THEME_LABELS, THEMES, type Theme } from '../lib/theme/theme';
import { useTheme } from '../lib/theme/theme-provider';

const THEME_ICONS: Record<Theme, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };

/** Selector de modo claro, oscuro o según el sistema (16.2). */
export function ThemeMenu({ className }: { readonly className?: string }): JSX.Element {
  const { theme, setTheme } = useTheme();
  const Icon = THEME_ICONS[theme];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={className}
          aria-label={`Apariencia: ${THEME_LABELS[theme]}`}
        >
          <Icon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Apariencia</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            setTheme(parseTheme(value));
          }}
        >
          {THEMES.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {THEME_LABELS[option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
