# Cierre del ajuste a B15: el cargo de cada persona

- Fecha: 15/10/2026
- Rama: `feat/iam-cargo-de-usuario`
- Estado: en revisión. Es un ajuste pendiente de B15 ([B15-cierre.md](B15-cierre.md)), no un bloque
  nuevo.

## Qué se construyó

Las aprobaciones «del jefe inmediato» de los flujos (B15) buscan el **cargo** de la persona en el
organigrama, el cargo al que reporta y quién lo ocupa. Hasta ahora no había forma de decir qué cargo
ocupa cada persona, así que esas aprobaciones quedaban «Sin responsable». Ahora sí la hay.

| Pieza                   | Qué hace, en palabras sencillas                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tarjeta **Cargo**       | En **Administración › Usuarios › (una persona)** aparece su cargo actual, o «Sin cargo». Quien puede cambiarlo ve el selector **Cargo** y el botón «Guardar el cargo» |
| Solo cargos activos     | El selector ofrece los cargos activos del organigrama y «Sin cargo». Si la persona tenía un cargo que después se inactivó, se muestra como «(cargo inactivo)»         |
| Nunca sobre uno mismo   | Usted aprobó que nadie cambie su propio cargo: quien lo hiciera escogería quién le aprueba. En su propia ficha el cargo se ve, pero no se cambia                      |
| Solo personas internas  | Las cuentas del portal de clientes no tienen cargo, así que la tarjeta no aparece en su ficha                                                                         |
| Auditoría               | Cada cambio queda en el **Historial** de la ficha como «Cambió el cargo de una persona», con el cargo anterior y el nuevo                                             |
| Cambios al mismo tiempo | Si dos administradores editan la misma ficha, el segundo ve «Otra persona cambió este registro…» y recarga, en lugar de pisar el cambio del primero                   |

**Permiso:** «Cambiar los datos de un usuario» (`iam.user.update`), que ya estaba en el anexo G y
según la matriz tiene el rol **Administrador de plataforma**. Para ver la lista de cargos hace falta
además «Ver sedes, procesos, cargos y centros de costo» (`core.org.read`), que ese rol también
tiene. No se crearon permisos ni se cambiaron roles.

**Punto de la API:** `PATCH /v1/users/{id}` con `{ "position_id": "<cargo>" }` (o `null` para
quitarlo) y la versión de la ficha en la cabecera `If-Match`. La ficha `GET /v1/users/{id}` trae
ahora `position` (cargo, nombre y si está activo) y `version`. Usamos PATCH porque el manual
(capítulo 14) reserva ese método para modificar un registro y pide la versión.

**Sin tablas nuevas:** la columna `iam_users.position_id` ya existía desde B12.

## Una decisión técnica que no cambia nada para usted

El módulo de organización (que guarda los cargos) ya consultaba al de usuarios: no deja borrar un
cargo que alguien ocupa, y muestra quién creó cada parámetro. Ahora usuarios también necesita
consultar a organización, para comprobar que el cargo existe y está activo. Si cada uno llamara
directamente al otro, quedarían en círculo, y la verificación de fronteras del proyecto lo prohíbe.

La solución: usuarios **define la pregunta** («¿cómo se llama este cargo y está activo?») y
organización **la responde**. Así la dependencia sigue yendo en un solo sentido. En el código, la
pregunta es `POSITION_DIRECTORY` (en el índice de iam) y la respuesta la presta el núcleo
(`PositionDirectoryModule`). Ningún módulo lee las tablas del otro.

## Cómo se probó

| Prueba                            | Qué demuestra                                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Asignar, cambiar y quitar         | Cada cambio se guarda, se ve en la ficha y deja su evento de auditoría con el cargo anterior y el nuevo         |
| Guardar el mismo cargo            | No deja un evento repetido                                                                                      |
| Cargo inactivo o inexistente      | La API lo rechaza con un mensaje claro y no guarda nada                                                         |
| Sobre la propia cuenta            | Rechazado (403)                                                                                                 |
| Cuenta del portal                 | Rechazado: no ocupa cargos                                                                                      |
| Versión vieja o sin versión       | Rechazado (409 y 400): no se pisa el cambio de otra persona                                                     |
| **Permiso denegado**              | Dirección (que ve la ficha) y Comercial reciben 403                                                             |
| **Aislamiento entre empresas**    | No se puede usar un cargo ni un usuario de otra empresa: «no existe»                                            |
| **De punta a punta con el motor** | Con los cargos asignados por la API, la aprobación «del jefe» le llega a quien ocupa el cargo superior          |
| Pantalla                          | El selector solo ofrece cargos activos, envía la versión, muestra «Guardamos el cargo.» y los errores de la API |
| Accesibilidad                     | La ficha con la tarjeta Cargo no tiene violaciones WCAG 2.2 AA, en modo claro y oscuro                          |

Resultado de las verificaciones (`pnpm check`, 15/10/2026):

- Fronteras entre módulos, analizador, tipos, código sin usar y secretos: en verde.
- Pruebas: 501 de integración de la API, 134 de navegador (con accesibilidad) y todas las
  unitarias, en verde.
- **Dos avisos que no vienen de este cambio:**
  - **Formato:** `prettier --check .` se queja de unas carpetas locales de herramientas que no
    son del proyecto ni están en git (`apps/api/.agents`, `.claude/worktrees`…), igual que en B15.
    Los archivos del repositorio sí están bien formateados.
  - **Prueba de arranque:** `test/startup.test.ts` se agotó una vez con todas las pruebas en
    paralelo, y sola pasa. Es la misma inestabilidad por carga del puerto 4917 que se vio en B15.

## Cómo probarlo usted

Necesita las tres cuentas de demostración de los cierres anteriores: **Ana**, **Finanzas Uno** y
**Finanzas Dos**. Como nadie cambia su propio cargo, para que Ana tenga uno se lo pondrá otra
persona con el rol de administrador.

1. Cargue lo nuevo (con `pnpm infra:up` encendido):

   ```bash
   git switch feat/iam-cargo-de-usuario
   ```

   Si `pnpm dev` estaba encendido, deténgalo con Ctrl + C y vuelva a escribir `pnpm dev`. No hay
   migraciones ni datos semilla nuevos.

2. Entre con **Ana** en http://localhost:3000 y abra **Administración › Usuarios › Ana**. Verá la
   tarjeta **Cargo** con «Sin cargo», pero sin selector: es su propia ficha.
3. Abra la ficha de **Finanzas Dos**. En **Cargo**, elija **Director General** y pulse **«Guardar el
   cargo»**. Aparece «Guardamos el cargo.» y, abajo, en el **Historial**, «Cambió el cargo de una
   persona».
4. Abra la ficha de **Finanzas Uno** y, en **Roles vigentes**, asígnele temporalmente el rol
   **Administrador de plataforma** (le pedirá confirmar que es usted).
5. Salga y entre con **Finanzas Uno**. Abra la ficha de **Ana** y póngale el cargo **Gerente
   Comercial** (que reporta al Director General). Salga.
6. Entre de nuevo con **Ana**. En **Administración › Flujos**, inicie un trámite de prueba
   («Compra de sillas», monto `1000000`) y envíelo a revisión desde **Mis tareas**.
7. Salga y entre con **Finanzas Dos**: en **Mis tareas** está la aprobación del jefe, ahora **a su
   nombre** (ya no «Sin responsable»).
8. Para terminar, con Ana, retírele a Finanzas Uno el rol **Administrador de plataforma**.

## Decisiones

- Nadie cambia su propio cargo (aprobada por usted).
- El cierre va en este archivo, enlazado desde el de B15 (aprobada por usted).
- El punto es `PATCH /v1/users/{id}` (no `PUT …/position`, como decía el plan), porque el manual
  solo usa PATCH para modificar y exige la versión del registro.
- Cambiar el cargo no pide confirmar la identidad, a diferencia de asignar roles: no da permisos,
  solo cambia quién aprueba. Queda en la auditoría.

## Pendientes

- **Iniciar sesión cambia la versión de la ficha** (la base sube la versión con cada cambio de la
  fila, y entrar guarda la fecha del último ingreso). Si la persona entra justo mientras usted edita
  su cargo, verá «Otra persona cambió este registro» y tendrá que recargar. Es raro y no pierde
  datos.
- **Cargo vacante:** si el cargo del jefe no tiene a nadie, la aprobación sigue quedando «Sin
  responsable», como definió B15.
