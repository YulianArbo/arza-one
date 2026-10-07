// Direcciones de las pruebas en navegador. En la dirección de la API no escucha nada:
// cada prueba simula sus respuestas, así que una petición sin simular falla de inmediato.
export const E2E_PORT = 3100;
export const E2E_WEB_URL = `http://localhost:${String(E2E_PORT)}`;
export const E2E_API_URL = 'http://127.0.0.1:4999';
