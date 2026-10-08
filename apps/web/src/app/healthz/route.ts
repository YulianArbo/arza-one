// Verificación de salud de la web (numeral 10.3): la usan Docker y las pruebas de humo (B07).
// Responde sin consultar la API: dice si el servidor de la web está vivo.
export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}
