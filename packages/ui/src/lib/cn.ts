import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Une clases de Tailwind; si dos chocan (p-2 y p-4), gana la última. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
