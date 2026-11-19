// Mensaje del día (B22B, decisión del dueño del 18/11/2026): un banco escrito y revisado en
// español de Colombia, con trato de usted, sin inteligencia artificial. Cada mensaje une una
// observación y una invitación; las dos son frases completas, así cualquier pareja tiene sentido.
// 40 × 40 = 1.600 mensajes distintos.

const OBSERVATIONS = [
  'Lo que hoy queda documentado, mañana no hay que explicarlo.',
  'Cada tarea cerrada a tiempo le ahorra una llamada a alguien.',
  'Un buen registro vale más que una buena memoria.',
  'Los procesos claros dejan tiempo para lo importante.',
  'La calidad se construye en los detalles de todos los días.',
  'Una aprobación oportuna mantiene el trabajo en movimiento.',
  'Los clientes notan cuando las cosas se hacen con orden.',
  'Lo que se mide se puede mejorar.',
  'Un pendiente resuelto temprano no se vuelve urgente.',
  'La información compartida evita trabajos repetidos.',
  'Cada versión vigente es un acuerdo cumplido.',
  'El orden de hoy es la tranquilidad de mañana.',
  'Un equipo informado decide mejor.',
  'Las pequeñas mejoras sostenidas hacen grandes diferencias.',
  'Responder a tiempo también es servicio al cliente.',
  'Un trámite bien llevado habla bien de toda la empresa.',
  'La tecnología rinde más cuando el proceso está claro.',
  'Cada dato bien registrado sostiene una buena decisión.',
  'Lo urgente pesa menos cuando lo importante está al día.',
  'La confianza de un cliente se gana entrega tras entrega.',
  'Un proyecto avanza al ritmo de sus acuerdos.',
  'Nadie conoce mejor un proceso que quien lo hace a diario.',
  'Las buenas preguntas ahorran malas sorpresas.',
  'Una tarea bien definida ya va por la mitad.',
  'El trabajo bien hecho se nota aunque nadie lo diga.',
  'Cada firma a tiempo acorta el camino de un proyecto.',
  'Los indicadores cuentan la historia de lo que hacemos.',
  'Un archivo en su lugar es un minuto ganado.',
  'La seguridad de la información empieza por cada persona.',
  'Escuchar al cliente es la mejor fuente de ideas.',
  'Los procesos existen para ayudar, no para estorbar.',
  'Un buen cierre de mes empieza el primer día.',
  'Cada mejora propuesta hace más fuerte al equipo.',
  'La claridad en los acuerdos evita discusiones después.',
  'Lo sencillo bien hecho suele ser lo más difícil.',
  'Cada día deja algo que se puede aprender.',
  'La puntualidad también es una forma de respeto.',
  'Un equipo que se ayuda llega más lejos.',
  'La innovación empieza por preguntarse cómo hacerlo mejor.',
  'Hoy es un buen día para dejar las cosas en orden.',
] as const;

const INVITATIONS = [
  'Revise primero lo que vence hoy.',
  'Empiece por la tarea que más destraba a otros.',
  'Tómese un momento para planear su jornada.',
  'Deje registrado lo que avance.',
  'Comparta con su equipo lo que aprendió.',
  'Celebre lo que ya está terminado.',
  'Pida ayuda si algo se atasca.',
  'Cierre lo pendiente antes de abrir algo nuevo.',
  'Dé una mirada a sus avisos.',
  'Anote la idea que lleva días pensando.',
  'Avance un paso, aunque sea pequeño.',
  'Revise que sus documentos estén vigentes.',
  'Responda ese mensaje que tiene pendiente.',
  'Organice su bandeja antes del mediodía.',
  'Dedique un rato a lo importante sin interrupciones.',
  'Confirme los acuerdos por escrito.',
  'Haga una pausa activa a media jornada.',
  'Agradezca a alguien su ayuda.',
  'Revise sus indicadores con calma.',
  'Deje listo lo que otros necesitan de usted.',
  'Termine el día con su bandeja al día.',
  'Proponga una mejora en su proceso.',
  'Mantenga sus datos al día.',
  'Verifique las fechas de entrega de la semana.',
  'Elija una tarea y llévela hasta el final.',
  'Pregunte cuando algo no esté claro.',
  'Dé prioridad a lo que espera un cliente.',
  'Repase lo que tiene por aprobar.',
  'Guarde cada archivo en su lugar.',
  'Cuide sus contraseñas y su información.',
  'Escuche con atención a quien le consulte.',
  'Revise el avance de sus proyectos.',
  'Divida lo grande en pasos pequeños.',
  'Reconozca el buen trabajo de su equipo.',
  'Lleve un registro de lo que mejoró hoy.',
  'Planee mañana antes de terminar la jornada.',
  'Sea amable con usted y con los demás.',
  'Busque la forma más sencilla de hacerlo.',
  'Comparta el contexto, no solo la tarea.',
  'Disfrute lo que hace bien.',
] as const;

/** Cantidad de mensajes distintos que puede formar el banco. */
export const MESSAGE_COUNT = OBSERVATIONS.length * INVITATIONS.length;

/** Mensaje número `index` del banco (se ajusta al rango). */
export function messageAt(index: number): string {
  const position = ((Math.trunc(index) % MESSAGE_COUNT) + MESSAGE_COUNT) % MESSAGE_COUNT;
  const observation = OBSERVATIONS[Math.floor(position / INVITATIONS.length)] ?? OBSERVATIONS[0];
  const invitation = INVITATIONS[position % INVITATIONS.length] ?? INVITATIONS[0];
  return `${observation} ${invitation}`;
}

/** Resumen numérico estable de un texto (FNV-1a de 32 bits). */
function hashOf(text: string): number {
  let hash = 0x811c9dc5;
  for (const char of text) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * Mensaje personal del día: el mismo durante todo el día para la misma persona y distinto para
 * cada persona y cada día. `day` es la fecha de Colombia (AAAA-MM-DD).
 */
export function personalMessage(userId: string, day: string): string {
  return messageAt(hashOf(`${userId}|${day}`));
}
