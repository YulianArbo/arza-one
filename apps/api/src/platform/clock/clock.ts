import { Global, Module } from '@nestjs/common';

/** Hora actual. Las reglas de vencimiento la piden aquí para que las pruebas puedan fijarla. */
export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');

export const systemClock: Clock = { now: () => new Date() };

/** Pone el reloj del sistema a disposición de toda la API. */
@Global()
@Module({ providers: [{ provide: CLOCK, useValue: systemClock }], exports: [CLOCK] })
export class ClockModule {}
