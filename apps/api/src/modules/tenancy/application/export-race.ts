// Dos pasadas del worker sobre la misma exportación (B48, B49): la que pierde deshace su
// transacción en lugar de cerrarla sin evento de auditoría.

/**
 * Otra pasada ganó la exportación. Al esperar la fila que la otra tenía tomada, PostgreSQL le da
 * número a esta transacción aunque no cambie nada; deshacerla evita una escritura sin auditoría.
 */
export class LostToOtherPass extends Error {}

/** Corre la transacción; si otra pasada ganó, la deshace y devuelve «lost». */
export async function unlessLost<T>(run: () => Promise<T>, lost: T): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof LostToOtherPass) return lost;
    throw error;
  }
}
