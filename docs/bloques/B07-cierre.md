# Cierre del bloque B07: Servidor de pruebas y despliegue automático

- Fecha: 08/10/2026
- Rama: `feat/b07-servidor-de-pruebas-y-desplieg`
- Estado: en revisión. **Bloque crítico: requiere revisión externa** antes de integrarlo (ver
  «Qué debe revisar» en el pull request), además de la aprobación del Director General.

## Qué se construyó

Usted aprobó el camino 3: construir todo ahora, aunque todavía no hay servidor ni dominio, y
dejarlo **probado con un ensayo dentro de GitHub**. Cuando contrate el servidor, lo prepara con un
comando y carga tres datos en GitHub, sin que haya que cambiar código.

| Pieza                             | Qué hace, en palabras sencillas                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Guion de preparación del servidor | [`infra/server/provision.sh`](../../infra/server/provision.sh), numeral 10.2. Se ejecuta una vez en un Ubuntu 24.04 nuevo y deja: <br>• su usuario con sudo y un usuario `deploy` solo para despliegues; <br>• SSH solo con llave, sin root y sin contraseñas; <br>• fail2ban y cortafuegos con solo 80, 443 y SSH; <br>• actualizaciones de seguridad automáticas, reloj por NTP y Docker. <br>Las contraseñas del ambiente se crean **dentro del servidor** y no salen de él |
| Revisión del servidor             | [`infra/server/verify.sh`](../../infra/server/verify.sh): 14 controles, cada uno con `[ok]` o `[FALLA]`. Se puede repetir cuando quiera                                                                                                                                                                                                                                                                                                                                        |
| Docker Compose de pruebas         | [`infra/compose/staging.yml`](../../infra/compose/staging.yml). Todas las piezas, más **Caddy**, la "puerta de entrada": obtiene solo el certificado del candado, pide la contraseña adicional y le dice a Google que no indexe. Solo Caddy da a internet; lo demás vive en una red interna **sin salida a internet**                                                                                                                                                          |
| Despliegue automático             | [`.github/workflows/despliegue-pruebas.yml`](../../.github/workflows/despliegue-pruebas.yml). Cuando la integración continua queda en verde en `main`, construye las imágenes, las guarda en el registro privado de GitHub y las despliega en el servidor. Mientras no haya servidor, solo deja el aviso «servidor de pruebas sin configurar»                                                                                                                                  |
| Pasos del despliegue y reversión  | [`infra/scripts/deploy/`](../../infra/scripts/deploy). Copia la base, migra, enciende y hace las pruebas de humo **desde fuera, por internet**. Si algo falla después de encender, **vuelve sola a la versión anterior**. Cada despliegue queda en una bitácora                                                                                                                                                                                                                |
| Pruebas de humo                   | 6 comprobaciones por internet y 1 dentro de la base: <br>• sin contraseña se niega la entrada y se pide al navegador; <br>• no indexable; <br>• HTTP lleva a HTTPS; <br>• web viva; <br>• API con base de datos, colas y archivos; <br>• versión correcta; <br>• **aislamiento entre empresas en la base desplegada**                                                                                                                                                          |
| Imagen de migraciones             | Nueva imagen pequeña que solo aplica las migraciones (la de la API no trae esa herramienta). Trivy la analiza en cada cambio                                                                                                                                                                                                                                                                                                                                                   |
| Ruta `/healthz` de la web         | La exige el numeral 10.3 para saber si la web está viva. No existía                                                                                                                                                                                                                                                                                                                                                                                                            |
| Ensayo de despliegue (tarea 11)   | En cada cambio, la máquina de GitHub hace de servidor: publica la versión buena, revisa los puertos y luego publica una **versión dañada a propósito**, que debe revertirse sola                                                                                                                                                                                                                                                                                               |
| Ensayo del servidor (tarea 12)    | En cada cambio, la máquina de GitHub (un Ubuntu 24.04) se prepara con `provision.sh` y se comprueba desde fuera: el administrador entra, `deploy` no tiene sudo, root no entra aunque tenga llave, no se ofrecen contraseñas, solo 80/443/SSH                                                                                                                                                                                                                                  |
| Guías de operación                | [Proveedores de servidor y dominio](../runbooks/proveedores-de-servidor-y-dominio.md) (la que me pidió aparte), [Servidor de pruebas](../runbooks/servidor-de-pruebas.md) y [Despliegue y reversión](../runbooks/despliegue-y-reversion.md)                                                                                                                                                                                                                                    |

**Tablas nuevas:** ninguna. **Migraciones:** ninguna. **Puntos de la API nuevos:** ninguno (solo
`/healthz` en la web). **Bibliotecas nuevas:** ninguna en el código. En el servidor se usan Caddy
(Apache 2.0), fail2ban y ufw (programas de Ubuntu). La imagen de migraciones usa Prisma, que el
proyecto ya tenía.

### Problemas reales que los ensayos encontraron y se corrigieron

1. **Caddy no enviaba la cabecera "no indexar" cuando negaba la entrada** (respuesta 401). La
   prueba de humo lo detectó en el primer ensayo. Ahora toda respuesta de error lleva las cabeceras
   del ambiente de pruebas.
2. **En Ubuntu 24.04, la revisión de SSH fallaba** porque falta una carpeta que se crea con la
   primera conexión. El ensayo en la máquina de GitHub lo detectó antes de tocar un servidor real.
3. **Un error en cómo el despliegue enviaba datos al servidor.** El primer ensayo lo detectó.
4. **La reversión volvía a encender la versión dañada** en el ensayo. Docker Compose daba prioridad
   a una variable heredada de GitHub sobre el archivo de la versión. Por SSH esa variable no llega
   al servidor real, pero el ensayo ahora se comporta igual que el servidor y la reversión quedó
   demostrada.
5. **ShellCheck encontró dos errores en los guiones de bash**: un salto de línea mal escrito y un
   apóstrofo («Let's») que rompía un mensaje.

## Cómo se probó

- `pnpm check` en verde en este equipo: formato, análisis, tipos, fronteras, código sin uso,
  **310 pruebas unitarias** (61 nuevas del despliegue y 2 de la web), **58 pruebas con piezas
  reales**, compilación, **34 pruebas en navegador** (una nueva de `/healthz`) y secretos.
- `pnpm check` llegó a las pruebas tres veces en este equipo. Dos de esas veces fallaron **por
  tiempo** pruebas de la API que arrancan el programa completo:
  - en la primera, cuatro, porque coincidió con otras tareas pesadas;
  - en la segunda, solo `apps/api/test/startup.test.ts`, de B02.

  Sola, esa prueba pasó 3 de 3 veces, y en GitHub siempre pasa. Es la misma lentitud de este equipo
  anotada desde B04. Este bloque no toca la API y **ninguna prueba se modificó**.

- Cobertura de los guiones de despliegue: 99 % de líneas.
- **Integración continua en GitHub, con las 12 tareas en verde**, incluidos los dos ensayos.
- La imagen de migraciones se probó también aquí contra un PostgreSQL desechable: aplicó las
  migraciones.

| Criterio de aceptación                                           | Cómo se demuestra                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integrar a `main` publica la versión en pruebas sin intervención | El flujo «Despliegue a pruebas» arranca solo cuando la integración continua de `main` queda en verde. La tarea 11 recorre en cada cambio **el mismo programa de despliegue** contra la máquina de GitHub. **Falta el servidor real**: se confirmará con el primer despliegue (pendiente de usted)         |
| Solo los puertos 80, 443 y SSH están abiertos                    | Cortafuegos de `provision.sh` y solo Caddy publica puertos. Lo comprueban la tarea 12 (máquina preparada, revisada desde su dirección de red), la tarea 11 (servicios encendidos: solo 80 y 443) y **cada despliegue real**, desde fuera. Igual que el anterior, falta confirmarlo en el servidor real    |
| Una versión que falla las pruebas de humo se revierte sola       | Tarea 11: la versión dañada se enciende, falla la prueba de humo de la API y el ensayo comprueba que el enlace volvió a la versión buena, que la bitácora dice «rolled_back», que hubo copia de la base y que la buena responde. Además, las pruebas unitarias cubren cada camino de reversión y de falla |
| `pnpm check` en verde                                            | Ver arriba                                                                                                                                                                                                                                                                                                |
| Permiso denegado, aislamiento y auditoría                        | Ver la sección siguiente                                                                                                                                                                                                                                                                                  |
| Documentación y cierre escritos                                  | Este documento, las tres guías nuevas, [`integracion-continua.md`](../runbooks/integracion-continua.md), [`infra/scripts/README.md`](../../infra/scripts/README.md) y [`apps/api/README.md`](../../apps/api/README.md)                                                                                    |

### Permiso denegado, aislamiento entre empresas y auditoría

- **Permiso denegado:**
  - sin la contraseña adicional, el sitio y la bandeja de correo responden 401 (prueba de humo en
    cada despliegue);
  - root no entra por SSH aunque tenga una llave válida;
  - `deploy` no tiene sudo;
  - el servidor no acepta contraseñas, solo llaves;
  - un servidor desconocido se rechaza (GitHub exige su huella);
  - los puertos internos no responden;
  - el flujo de GitHub tiene permisos mínimos.
- **Aislamiento entre empresas:** la prueba de humo entra a la base desplegada con el mismo
  usuario de la API (`app_user`) y comprueba que:
  - no es superusuario ni salta la seguridad por fila;
  - sin empresa no ve ninguna;
  - con Demo Uno no ve a Demo Dos.

  Si falla, la versión se revierte. Las pruebas de aislamiento de B03 y B06 siguen corriendo en
  cada cambio.

- **Auditoría:** como aprobó en el plan, la tabla de auditoría llega en B11 y este bloque no escribe
  datos del negocio. Los despliegues quedan registrados en el historial del ambiente «pruebas» de
  GitHub (fecha, commit y quién lo originó) y en la bitácora del servidor
  (`/srv/arza-one/deployments.log`). Las pruebas unitarias comprueban que cada resultado (publicado,
  revertido o fallido) queda en la bitácora.

## Cómo lo prueba usted, paso a paso

Todavía no hay servidor, así que lo que puede ver hoy está en GitHub y en su equipo.

### 1. Los ensayos en GitHub

1. Abra el pull request del bloque. Al final de la página debe decir **«All checks have passed»**.
2. Haga clic en **«11. Ensayo de despliegue y reversión automática»** y luego en el paso «Publicar
   una versión buena y revertir una dañada». Verá, en orden:
   - «Versión … publicada en pruebas.»;
   - «Puertos abiertos: 80, 443…» y «Solo los permitidos»;
   - «La versión bad… NO pasó las pruebas y se volvió sola a …»;
   - al final, «Ensayo superado».
3. Haga clic en **«12. Preparación y endurecimiento del servidor»** y luego en el paso «Preparar
   este equipo como servidor y comprobarlo». Al final verá la lista de controles con `[ok]` y
   «Ensayo superado: el servidor quedó endurecido según el numeral 10.2».

### 2. La nueva ruta de la web en su equipo

```bash
git switch feat/b07-servidor-de-pruebas-y-desplieg
```

```bash
pnpm install
```

```bash
pnpm infra:up
```

```bash
pnpm dev
```

Abra http://localhost:3000/healthz: debe decir `{"status":"ok"}`. La pantalla
http://localhost:3000/app/estado-del-sistema debe seguir diciendo «Todo funciona».

### 3. Cuando integre el bloque a `main`

En GitHub, **Actions → Despliegue a pruebas**: aparece una ejecución con el aviso **«El servidor de
pruebas aún no está configurado…»**. Es lo correcto: no hace nada hasta que exista el servidor.

### 4. Cuando tenga servidor y dominio

Siga [servidor-de-pruebas.md](../runbooks/servidor-de-pruebas.md) de principio a fin. Al terminar,
abra `https://pruebas.su-dominio`: el navegador pide usuario y contraseña. Con ellos, debe ver la
página de inicio con el candado y, en `/app/estado-del-sistema`, «Todo funciona».

## Pendientes

| Pendiente                                                                                                                                                                | Responsable                 | Cuándo                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | ------------------------- |
| Contratar el servidor (mínimo 8 GB de memoria) y el dominio, o usar Oracle y DuckDNS gratis ([guía](../runbooks/proveedores-de-servidor-y-dominio.md))                   | Director General            | Cuando decida             |
| Preparar el servidor y conectar GitHub ([guía](../runbooks/servidor-de-pruebas.md)). Con el primer despliegue real quedan demostrados en el servidor los criterios 1 y 2 | Director General            | Después del anterior      |
| **Revisión externa** del bloque (bloque crítico). En el pull request está la lista de qué revisar                                                                        | Director General (contrata) | Antes de integrar         |
| Pasar el análisis semanal de OWASP ZAP al servidor de pruebas. No se cambió porque no hay servidor con qué comprobarlo; hoy sigue analizando la copia temporal           | Claude Code                 | Cuando exista el servidor |
| Despliegue a producción con aprobación y versión etiquetada, copias pgBackRest y restic, monitoreo y alertas                                                             | Claude Code                 | B44                       |
| Pendientes de B05 que siguen abiertos: protección de `main` (GitHub Pro), instalar Renovate y la excepción de `braces` (vence el 06/11/2026)                             | Director General            | Ver cierre de B05         |

## Decisiones tomadas

Aprobadas por usted en el plan:

1. Construir todo sin servidor y probarlo con el ensayo en GitHub (camino 3).
2. Registro privado de GitHub (GHCR) para las imágenes.
3. Usuario y contraseña adicionales para todo el ambiente de pruebas.
4. Correo de pruebas a Mailpit: ningún correo sale a buzones reales.
5. Auditoría por el historial de despliegues hasta B11.

Tomadas durante el trabajo (**revíselas en el pull request**):

6. **La API vive en `https://pruebas.[dominio]/api` y no en `api.pruebas.[dominio]`** como decía
   el plan. Con la contraseña adicional, el navegador solo la envía a la misma dirección. En otra
   dirección, la web no podría hablar con la API. Para eso el cliente de la web ahora respeta el
   prefijo `/api`. En producción (sin contraseña adicional) se puede usar `api.[dominio]` del
   numeral 10.4.
7. **El despliegue se dirige desde GitHub y no desde el servidor.** El servidor solo necesita
   Docker, y toda la lógica se prueba sin servidor. Si GitHub perdiera la conexión a mitad, la
   versión anterior sigue encendida hasta el cambio de enlace, que es instantáneo.
8. **Pruebas de humo de aislamiento con las empresas ficticias.** Para eso, el ambiente de pruebas
   carga Demo Uno y Demo Dos en cada despliegue. Son datos ficticios, como exige el numeral 10.1.
9. **El usuario `deploy` está en el grupo de Docker.** Eso equivale a administrar los contenedores.
   Se compensa así:
   - solo entra con su llave;
   - no tiene terminal ni sudo;
   - es distinto de su usuario administrador.
10. **Las imágenes no se analizan otra vez con Trivy al desplegar.** El mismo commit ya pasó Trivy
    en la integración continua, que es la condición para desplegar.
11. **Se conservan** 10 copias de la base, 5 versiones y las imágenes de los últimos 30 días.
12. **Sin HTTP/3:** el cortafuegos solo abre TCP en 80 y 443, como pide el numeral 10.2.
13. **Servidor mínimo de 8 GB**, y no de 4 GB como dije en el plan: al sumar los límites de memoria
    del numeral 10.3 pasa de 6 GB.
14. **Servidores ARM (Oracle):** se activan con la variable `STAGING_PLATFORM`, sin cambiar código.
15. **La tarea 7 de la integración continua compara con `main` cuando se lanza a mano.** Antes
    fallaba porque no tenía con qué comparar.
16. **El worker tiene 30 segundos para terminar sus trabajos al apagarse.** Era un pendiente de B06.
    El otro pendiente de B06, la contraseña de Valkey en pruebas, también quedó resuelto.

## Commits

```text
7a5d01a feat(web): add healthz route and keep the api path prefix
4865279 build(api): add a migrations image for deployments
0685c0f feat(infra): add staging compose with caddy and automatic tls
61060d4 feat(infra): deploy to staging with smoke tests and automatic rollback
dcd4d09 feat(infra): add server provisioning and hardening scripts
5fe0046 ci(infra): rehearse deploy, rollback and server hardening on every change
943d361 fix(infra): send deploy input as bytes and report the failing provision step
a0fbacf fix(infra): keep noindex on caddy errors and prepare the sshd runtime dir
3a1fc60 docs(infra): add staging server, deploy and rollback runbooks
64dacf7 fix(infra): keep deploy variables out of the rehearsal server shell
7127492 ci: compare migrations with main when the workflow runs by hand
```

Más el commit de este cierre.
