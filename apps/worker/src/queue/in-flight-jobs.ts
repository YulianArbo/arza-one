/**
 * Trabajos en curso, desde que empiezan hasta que BullMQ los registra como terminados o fallidos.
 * Al apagarse, el worker espera a que terminen antes de cerrar las colas: así un despliegue no
 * corta un correo a medio enviar (ADR-014: los trabajos son idempotentes, pero mejor no
 * repetirlos sin necesidad).
 */
export class InFlightJobs {
  private readonly running = new Set<string>();
  private waiters: (() => void)[] = [];

  start(jobId: string | undefined): void {
    if (jobId !== undefined) this.running.add(jobId);
  }

  finish(jobId: string | undefined): void {
    if (jobId !== undefined) this.running.delete(jobId);
    if (this.running.size > 0) return;
    for (const wake of this.waiters) wake();
    this.waiters = [];
  }

  get size(): number {
    return this.running.size;
  }

  /** Espera a que terminen, como máximo `timeoutMs`. Devuelve true si terminaron todos. */
  async settle(timeoutMs: number): Promise<boolean> {
    if (this.running.size === 0) return true;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<false>((resolve) => {
      timer = setTimeout(() => {
        resolve(false);
      }, timeoutMs);
    });
    const done = new Promise<true>((resolve) => {
      this.waiters.push(() => {
        resolve(true);
      });
    });
    try {
      return await Promise.race([done, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
