'use client';

import {
  Avatar,
  BarChart,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DonutChart,
  ErrorSummary,
  FunnelBars,
  LineChart,
  StatCard,
  type BarItem,
  type DonutItem,
  type FunnelStep,
  type LineSeries,
  type StatCardProps,
} from '@arza/ui';
import type { JSX } from 'react';

// Muestras del sistema de diseño (B22A). Las cifras son de ejemplo: no vienen de la API.
const MONTHS = ['May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct'];
const millions = (value: number): string => `$ ${String(value)} M`;
const STATS: readonly StatCardProps[] = [
  {
    label: 'Tareas pendientes',
    value: '5',
    change: { text: '−2', favorable: true },
    note: '2 vencen hoy',
    trend: [9, 8, 8, 7, 6, 5],
  },
  {
    label: 'Embudo abierto',
    value: '$ 240,5 M',
    change: { text: '+12 %', favorable: true },
    trend: [150, 162, 170, 190, 214, 240],
    tone: 'success',
  },
  {
    label: 'Documentos por leer',
    value: '3',
    change: { text: '+1', favorable: false },
    trend: [1, 2, 1, 2, 2, 3],
    tone: 'warning',
  },
  { label: 'Lectura del SGC', value: '86 %', note: 'Meta: 90 %' },
];
const SERIES: readonly LineSeries[] = [
  { key: 'nuevas', label: 'Nuevas', values: [62, 80, 74, 96, 132, 168], tone: 'action' },
  { key: 'ganadas', label: 'Ganadas', values: [12, 22, 18, 24, 30, 36], tone: 'success' },
];
const BARS: readonly BarItem[] = [
  { label: 'Docs', value: 14 },
  { label: 'Comer.', value: 9 },
  { label: 'Flujos', value: 6, tone: 'success' },
  { label: 'Terc.', value: 4, tone: 'warning' },
];
const STATES: readonly DonutItem[] = [
  { label: 'Vigentes', value: 171, tone: 'success' },
  { label: 'En revisión', value: 28, tone: 'warning' },
  { label: 'Borradores', value: 37, tone: 'action' },
  { label: 'Obsoletos', value: 17, tone: 'muted' },
];
const STAGES: readonly FunnelStep[] = [
  { label: 'Calificación', value: 48, display: '$ 48,0 M' },
  { label: 'Propuesta', value: 64, display: '$ 64,0 M' },
  { label: 'Negociación', value: 92.5, display: '$ 92,5 M' },
  { label: 'Ganada', value: 36, display: '$ 36,0 M' },
];
const PROBLEM = [
  {
    fieldId: 'example-code',
    message: 'Corrija el código: debe tener el formato PREFIJO-AAAA-NNNN',
  },
];

/** Indicadores, gráficas e identidad de la nueva apariencia. */
export function ChartSection(): JSX.Element {
  return (
    <Card aria-labelledby="charts-title">
      <CardHeader>
        <CardTitle id="charts-title">Indicadores y gráficas</CardTitle>
        <CardDescription>
          Datos de ejemplo. Pase el cursor por las gráficas; cada una ofrece su tabla de datos.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {STATS.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>
        <LineChart
          title="Oportunidades por mes (ejemplo)"
          labels={MONTHS}
          format={millions}
          series={SERIES}
        />
        <div className="grid gap-4 lg:grid-cols-3">
          <BarChart title="Tareas por módulo (ejemplo)" items={BARS} />
          <DonutChart
            title="Documentos por estado (ejemplo)"
            summary={{ value: '68 %', label: 'vigentes' }}
            items={STATES}
          />
          <FunnelBars title="Embudo comercial (ejemplo)" steps={STAGES} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Avatar name="Ana Pérez" size="sm" />
          <Avatar name="Ana Pérez" />
          <Avatar name="Demo Uno S.A.S." size="lg" />
        </div>
        <ErrorSummary focusOnShow={false} problems={PROBLEM} />
      </CardContent>
    </Card>
  );
}
