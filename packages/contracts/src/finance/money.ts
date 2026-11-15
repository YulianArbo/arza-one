import { z } from 'zod';

// Valores en pesos de Finanzas (M10): texto con punto decimal y hasta dos decimales, para no perder
// exactitud en el camino. La API los guarda como numeric(18,2) y calcula con decimal.js.

export const positiveMoneySchema = z
  .string()
  .trim()
  .regex(
    /^(?=.*[1-9])\d{1,16}(\.\d{1,2})?$/u,
    'Escriba un valor mayor que cero, con hasta dos decimales.',
  );

export const moneySchema = z
  .string()
  .trim()
  .regex(/^\d{1,16}(\.\d{1,2})?$/u, 'Escriba el valor en pesos, con hasta dos decimales.');

/** Valor que puede ser negativo, como una partida de conciliación que resta. */
export const signedMoneySchema = z
  .string()
  .trim()
  .regex(/^-?\d{1,16}(\.\d{1,2})?$/u, 'Escriba el valor en pesos, con hasta dos decimales.');

/** Mes contable, como «2026-10». */
export const periodSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/u, 'Escriba el mes como AAAA-MM, por ejemplo 2026-10.');
