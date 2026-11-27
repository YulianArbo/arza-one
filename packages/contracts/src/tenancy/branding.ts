import { z } from 'zod';

// Marca propia de cada empresa (B48, decisión 11): nombre para mostrar, color principal y logo,
// en la barra de la aplicación y del portal. El color debe leerse sobre blanco (WCAG AA, 4,5:1).

export const MIN_BRAND_CONTRAST = 4.5;

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

function channel(value: number): number {
  const ratio = value / 255;
  return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

/** Contraste del color con el blanco, de 1 a 21. */
export function contrastWithWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

export const brandColorSchema = z
  .string()
  .trim()
  .regex(HEX_COLOR, 'Escriba el color como #RRGGBB, por ejemplo #1F4E79')
  .refine((hex) => contrastWithWhite(hex) >= MIN_BRAND_CONTRAST, {
    message: 'Ese color no se lee bien sobre fondo blanco. Elija uno más oscuro.',
  })
  .transform((hex) => hex.toUpperCase());

export const tenantBrandingSchema = z.object({
  display_name: z.string().describe('Nombre que se muestra: el de la marca o la razón social'),
  primary_color: z.string().nullable().describe('Color principal #RRGGBB; null: el de ARZA ONE'),
  has_logo: z.boolean(),
  version: z.number().int().positive(),
});

export const updateTenantBrandingSchema = z.strictObject({
  display_name: z.string().trim().min(2).max(60).nullable().describe('null: la razón social'),
  primary_color: brandColorSchema.nullable(),
});

export type TenantBranding = z.infer<typeof tenantBrandingSchema>;
export type UpdateTenantBrandingRequest = z.infer<typeof updateTenantBrandingSchema>;
