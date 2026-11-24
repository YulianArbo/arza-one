/* global __ENV -- variable que k6 entrega con los valores del ambiente. */
// Pruebas de carga del numeral 21.1 (B43): 50 usuarios simultáneos durante varios minutos sobre
// una copia con datos voluminosos. Metas: percentil 95 por debajo de 500 ms en consultas y de 1 s
// en escrituras. k6 marca la prueba como fallida si no se cumplen (umbrales al final).
//
// Variables: API_URL (dirección de la API), SESSION_COOKIE y CSRF_TOKEN (sesión de análisis),
// ORIGIN (origen de la web), VOLUME (terceros que se crean antes de medir) y DURATION.
import { check, sleep } from 'k6';
import http from 'k6/http';

const API = __ENV.API_URL ?? 'http://api:4000';
const VOLUME = Number(__ENV.VOLUME ?? '2000');
const NIT_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

export const options = {
  setupTimeout: '10m',
  scenarios: {
    consultas: {
      executor: 'constant-vus',
      vus: 40,
      duration: __ENV.DURATION ?? '5m',
      exec: 'consultas',
    },
    escrituras: {
      executor: 'constant-vus',
      vus: 10,
      duration: __ENV.DURATION ?? '5m',
      exec: 'escrituras',
    },
  },
  thresholds: {
    'http_req_duration{tipo:consulta}': ['p(95)<500'],
    'http_req_duration{tipo:escritura}': ['p(95)<1000'],
    // Ninguna respuesta de error: una carga que falla rápido no cumple la meta.
    'http_req_failed{tipo:consulta}': ['rate<0.01'],
    'http_req_failed{tipo:escritura}': ['rate<0.01'],
  },
};

/** Las rutas que más se consultan en el día a día (bandejas, listas y fichas). */
const CONSULTAS = [
  '/v1/me',
  '/v1/me/notifications',
  '/v1/tasks/mine',
  '/v1/parties?limit=100',
  '/v1/parties?q=carga&limit=50',
  '/v1/crm/leads',
  '/v1/documents',
  '/v1/projects',
  '/v1/contracts',
  '/v1/tickets',
];

// 409: el NIT al azar ya existía. Es una respuesta esperada, no una falla de rendimiento.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 409));

function headers(extra) {
  return {
    cookie: __ENV.SESSION_COOKIE,
    'x-csrf-token': __ENV.CSRF_TOKEN,
    origin: __ENV.ORIGIN ?? 'http://web:3000',
    ...extra,
  };
}

function nitCheckDigit(nit) {
  const digits = Array.from(nit, Number).reverse();
  const sum = digits.reduce((total, digit, index) => total + digit * NIT_WEIGHTS[index], 0);
  const remainder = sum % 11;
  return remainder > 1 ? 11 - remainder : remainder;
}

function newOrganization() {
  const nit = String(800_000_000 + Math.floor(Math.random() * 99_999_999));
  return {
    kind: 'organization',
    legal_name: `Empresa de carga ${nit} S.A.S.`,
    id_type: 'NIT',
    id_number: nit,
    check_digit: nitCheckDigit(nit),
    city: 'Bogotá',
    roles: ['customer'],
  };
}

function createOrganization(tags) {
  const response = http.post(`${API}/v1/parties`, JSON.stringify(newOrganization()), {
    headers: headers({
      'content-type': 'application/json',
      'idempotency-key': crypto.randomUUID(),
    }),
    tags,
  });
  check(response, { 'tercero creado': (r) => r.status === 201 || r.status === 409 });
}

/** Datos voluminosos antes de medir: VOLUME terceros, sin contar en las metas. */
export function setup() {
  const session = http.get(`${API}/v1/auth/session`, { headers: headers({}) });
  if (session.status !== 200)
    throw new Error(`La sesión de análisis no sirve (${session.status}).`);
  for (let created = 0; created < VOLUME; created += 1) {
    createOrganization({ tipo: 'preparacion' });
  }
}

export function consultas() {
  const path = CONSULTAS[Math.floor(Math.random() * CONSULTAS.length)];
  const response = http.get(`${API}${path}`, {
    headers: headers({}),
    tags: { tipo: 'consulta', name: path },
  });
  check(response, { 'consulta respondida': (r) => r.status === 200 });
  // Una persona lee la pantalla antes de la siguiente acción: un segundo de pausa.
  sleep(1);
}

export function escrituras() {
  createOrganization({ tipo: 'escritura', name: 'POST /v1/parties' });
  sleep(1);
}
