// Fragmentos del texto de un documento para la búsqueda del asistente (B47, decisión 3): se envían
// al modelo solo los pasajes que coinciden con la pregunta, no el documento entero (minimización).

/** Tamaño máximo de un fragmento, en caracteres. */
export const CHUNK_SIZE = 1500;

/** Fragmentos máximos por versión: lo que sigue no se indexa. */
export const MAX_CHUNKS = 400;

function paragraphsOf(text: string): string[] {
  return text
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.replace(/\s+/gu, ' ').trim())
    .filter((paragraph) => paragraph.length > 0);
}

/** Un párrafo más largo que un fragmento se parte por palabras. */
function piecesOf(paragraph: string): string[] {
  if (paragraph.length <= CHUNK_SIZE) return [paragraph];
  const pieces: string[] = [];
  let current = '';
  for (const word of paragraph.split(' ')) {
    const next = current === '' ? word : `${current} ${word}`;
    if (next.length > CHUNK_SIZE && current !== '') {
      pieces.push(current);
      current = word.slice(0, CHUNK_SIZE);
    } else {
      current = next.slice(0, CHUNK_SIZE);
    }
  }
  return current === '' ? pieces : [...pieces, current];
}

/** Parte el texto en fragmentos de hasta CHUNK_SIZE caracteres, juntando párrafos cortos. */
export function chunksOf(text: string): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const piece of paragraphsOf(text).flatMap(piecesOf)) {
    const next = current === '' ? piece : `${current}\n${piece}`;
    if (next.length > CHUNK_SIZE) {
      chunks.push(current);
      current = piece;
    } else {
      current = next;
    }
    if (chunks.length >= MAX_CHUNKS) return chunks;
  }
  return current === '' ? chunks : [...chunks, current].slice(0, MAX_CHUNKS);
}
