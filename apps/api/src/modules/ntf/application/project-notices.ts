import { z } from 'zod';

import type { Handler, Notice } from './notice-types.js';

// Avisos de Proyectos (B26): el líder se entera de que tiene un proyecto nuevo a cargo y de lo que
// decidió la Dirección sobre su inicio; quien entra a un equipo, de que ya ve el proyecto. Nadie
// recibe aviso de lo que hizo él mismo.

const projectEventSchema = z.object({
  project_id: z.uuid(),
  code: z.string(),
  manager_id: z.uuid(),
});

const memberEventSchema = z.object({
  project_id: z.uuid(),
  code: z.string(),
  user_id: z.uuid(),
});

/** Novedades para el líder del proyecto, por evento. */
const LEADER_UPDATES: Readonly<Record<string, string>> = {
  'project.created': 'usted es el líder de este proyecto nuevo',
  'project.authorization.granted': 'la Dirección autorizó su inicio y ya está en ejecución',
  'project.authorization.denied': 'la Dirección no autorizó su inicio; revise el comentario',
};

function notice(userId: string, code: string, novedad: string, projectId: string): Notice {
  return {
    userId,
    kind: 'prj_project_update',
    values: { proyecto: code, novedad },
    link: `/app/proyectos/${projectId}`,
  };
}

const onLeaderUpdate: Handler = (_tx, event) => {
  const payload = projectEventSchema.parse(event.payload);
  const text = LEADER_UPDATES[event.eventType];
  if (text === undefined || payload.manager_id === event.actorId) return Promise.resolve([]);
  return Promise.resolve([notice(payload.manager_id, payload.code, text, payload.project_id)]);
};

const onMemberAdded: Handler = (_tx, event) => {
  const payload = memberEventSchema.parse(event.payload);
  if (payload.user_id === event.actorId) return Promise.resolve([]);
  const text = 'usted entró al equipo y ya puede ver el proyecto y su tablero';
  return Promise.resolve([notice(payload.user_id, payload.code, text, payload.project_id)]);
};

export const PROJECT_HANDLERS: Readonly<Record<string, Handler>> = {
  ...Object.fromEntries(Object.keys(LEADER_UPDATES).map((type) => [type, onLeaderUpdate])),
  'project.member.added': onMemberAdded,
};
