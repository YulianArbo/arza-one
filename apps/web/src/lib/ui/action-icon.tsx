import {
  Ban,
  Check,
  Download,
  FilePlus,
  FileText,
  Link2,
  Lock,
  LogIn,
  PenLine,
  Pencil,
  Plus,
  Save,
  Send,
  Trash2,
  Undo2,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react';
import { createElement, type JSX } from 'react';

// Ícono de cada acción según su función (B22B, guía de los bocetos): se deduce del primer verbo
// del texto del botón, así todos los botones comunes lo llevan sin tocar cada pantalla. Solo
// decora: el nombre accesible sigue siendo el texto.

const ICONS: Readonly<Record<string, LucideIcon>> = {
  guardar: Save,
  registrar: Plus,
  crear: Plus,
  nuevo: Plus,
  nueva: Plus,
  agregar: Plus,
  añadir: Plus,
  invitar: Plus,
  enviar: Send,
  radicar: Send,
  aprobar: Check,
  confirmar: Check,
  validar: Check,
  verificar: Check,
  marcar: Check,
  rechazar: X,
  descartar: X,
  anular: Ban,
  revocar: Ban,
  retirar: Ban,
  eliminar: Trash2,
  quitar: Trash2,
  borrar: Trash2,
  descargar: Download,
  exportar: Download,
  subir: Upload,
  cargar: Upload,
  editar: Pencil,
  cambiar: Pencil,
  programar: Pencil,
  firmar: PenLine,
  cerrar: Lock,
  devolver: Undo2,
  generar: FileText,
  preparar: FileText,
  solicitar: FilePlus,
  vincular: Link2,
  iniciar: LogIn,
};

/** Ícono que corresponde al primer verbo de la acción; sin verbo conocido, ninguno. */
export function iconForAction(label: string): LucideIcon | null {
  const verb = label.trim().split(/\s+/u)[0]?.toLocaleLowerCase('es-CO') ?? '';
  return ICONS[verb] ?? null;
}

/** El ícono de la acción, oculto para el lector de pantalla. */
export function ActionIcon({ label }: { readonly label: string }): JSX.Element | null {
  const icon = iconForAction(label);
  // Los íconos son componentes fijos del catálogo: se crean con createElement, sin declarar uno
  // nuevo en cada render.
  return icon ? createElement(icon, { 'aria-hidden': true }) : null;
}
