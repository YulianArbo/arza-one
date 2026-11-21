// Tabla de valores de los estándares mínimos del SG-SST (Resolución 0312 de 2019, artículo 27):
// 60 estándares agrupados por el ciclo PHVA, con su peso en centésimas de punto (el total es 100).
// Por validar con el profesional de SST con licencia y contra RE-SST-003 (B37, decisión 4).

export type StandardCycle = 'plan' | 'do' | 'check' | 'act';

export interface StandardDefinition {
  readonly code: string;
  readonly cycle: StandardCycle;
  readonly label: string;
  /** Peso en centésimas de punto: 50 = 0,5 puntos. */
  readonly weight: number;
}

export const STANDARD_CYCLES: Readonly<Record<StandardCycle, string>> = {
  plan: 'I. Planear',
  do: 'II. Hacer',
  check: 'III. Verificar',
  act: 'IV. Actuar',
};

type Row = readonly [string, number, string];

function rows(cycle: StandardCycle, entries: readonly Row[]): StandardDefinition[] {
  return entries.map(([code, weight, label]) => ({ code, cycle, label, weight }));
}

const PLAN: readonly Row[] = [
  ['1.1.1', 50, 'Responsable del SG-SST'],
  ['1.1.2', 50, 'Responsabilidades en el SG-SST'],
  ['1.1.3', 50, 'Asignación de recursos para el SG-SST'],
  ['1.1.4', 50, 'Afiliación al Sistema General de Riesgos Laborales'],
  ['1.1.5', 50, 'Pago de pensión de trabajadores de alto riesgo'],
  ['1.1.6', 50, 'Conformación del COPASST'],
  ['1.1.7', 50, 'Capacitación del COPASST'],
  ['1.1.8', 50, 'Conformación del Comité de Convivencia'],
  ['1.2.1', 200, 'Programa de capacitación en promoción y prevención'],
  ['1.2.2', 200, 'Inducción y reinducción en el SG-SST'],
  ['1.2.3', 200, 'Responsables del SG-SST con el curso virtual de 50 horas'],
  ['2.1.1', 100, 'Política del SG-SST firmada, fechada y comunicada al COPASST'],
  ['2.2.1', 100, 'Objetivos definidos, claros, medibles, con metas, documentados y revisados'],
  ['2.3.1', 100, 'Evaluación inicial e identificación de prioridades'],
  ['2.4.1', 200, 'Plan de trabajo anual con objetivos, metas, responsables, recursos y cronograma'],
  ['2.5.1', 200, 'Archivo o retención documental del SG-SST'],
  ['2.6.1', 100, 'Rendición de cuentas sobre el desempeño'],
  ['2.7.1', 200, 'Matriz legal'],
  ['2.8.1', 100, 'Mecanismos de comunicación y autorreporte en SG-SST'],
  ['2.9.1', 100, 'Identificación y evaluación para la adquisición de productos y servicios'],
  ['2.10.1', 200, 'Evaluación y selección de proveedores y contratistas'],
  ['2.11.1', 100, 'Evaluación del impacto de cambios internos y externos en el SG-SST'],
];

const DO: readonly Row[] = [
  ['3.1.1', 100, 'Descripción sociodemográfica y diagnóstico de condiciones de salud'],
  ['3.1.2', 100, 'Actividades de promoción y prevención en salud'],
  ['3.1.3', 100, 'Información al médico de los perfiles de cargo'],
  ['3.1.4', 100, 'Evaluaciones médicas ocupacionales: peligros, periodicidad y comunicación'],
  ['3.1.5', 100, 'Custodia de las historias clínicas'],
  ['3.1.6', 100, 'Restricciones y recomendaciones médico-laborales'],
  ['3.1.7', 100, 'Estilos de vida y entornos saludables'],
  ['3.1.8', 100, 'Agua potable, servicios sanitarios y disposición de basuras'],
  ['3.1.9', 100, 'Eliminación adecuada de residuos sólidos, líquidos o gaseosos'],
  ['3.2.1', 200, 'Reporte de accidentes y enfermedades laborales a la ARL, EPS y Ministerio'],
  ['3.2.2', 200, 'Investigación de incidentes, accidentes y enfermedades laborales'],
  ['3.2.3', 100, 'Registro y análisis estadístico de accidentes y enfermedades laborales'],
  ['3.3.1', 100, 'Medición de la frecuencia de la accidentalidad'],
  ['3.3.2', 100, 'Medición de la severidad de la accidentalidad'],
  ['3.3.3', 100, 'Medición de la mortalidad por accidentes de trabajo'],
  ['3.3.4', 100, 'Medición de la prevalencia de la enfermedad laboral'],
  ['3.3.5', 100, 'Medición de la incidencia de la enfermedad laboral'],
  ['3.3.6', 100, 'Medición del ausentismo por causa médica'],
  ['4.1.1', 400, 'Metodología para identificar peligros y evaluar y valorar los riesgos'],
  ['4.1.2', 400, 'Identificación de peligros con participación de todos los niveles'],
  [
    '4.1.3',
    300,
    'Identificación de sustancias catalogadas como carcinógenas o con toxicidad aguda',
  ],
  ['4.1.4', 400, 'Mediciones ambientales de agentes químicos, físicos y biológicos'],
  ['4.2.1', 250, 'Medidas de prevención y control frente a los peligros identificados'],
  ['4.2.2', 250, 'Verificación de la aplicación de las medidas de prevención y control'],
  ['4.2.3', 250, 'Procedimientos, instructivos, fichas y protocolos'],
  ['4.2.4', 250, 'Inspecciones a instalaciones, maquinaria o equipos con el COPASST'],
  ['4.2.5', 250, 'Mantenimiento periódico de instalaciones, equipos, máquinas y herramientas'],
  ['4.2.6', 250, 'Entrega de elementos de protección personal y capacitación en su uso'],
  ['5.1.1', 500, 'Plan de prevención, preparación y respuesta ante emergencias'],
  ['5.1.2', 500, 'Brigada de prevención conformada, capacitada y dotada'],
];

const CHECK: readonly Row[] = [
  ['6.1.1', 125, 'Definición de indicadores de estructura, proceso y resultado'],
  ['6.1.2', 125, 'Auditoría anual del SG-SST'],
  ['6.1.3', 125, 'Revisión anual de la alta dirección y comunicación de los resultados'],
  ['6.1.4', 125, 'Planificación de la auditoría con el COPASST'],
];

const ACT: readonly Row[] = [
  ['7.1.1', 250, 'Acciones preventivas y correctivas con base en los resultados del SG-SST'],
  ['7.1.2', 250, 'Acciones de mejora conforme a la revisión de la alta dirección'],
  ['7.1.3', 250, 'Acciones de mejora con base en investigaciones de accidentes y enfermedades'],
  ['7.1.4', 250, 'Plan de mejoramiento con las medidas solicitadas por autoridades y la ARL'],
];

export const MINIMUM_STANDARDS: readonly StandardDefinition[] = [
  ...rows('plan', PLAN),
  ...rows('do', DO),
  ...rows('check', CHECK),
  ...rows('act', ACT),
];
