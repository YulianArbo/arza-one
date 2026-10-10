# Cierre del bloque B10: Roles, permisos y autorización

- Fecha: 09/10/2026
- Rama: `feat/b10-roles-permisos-y-autorizacion`
- Estado: en revisión. **Bloque crítico: requiere revisión externa** antes de integrarlo, además
  de la aprobación del Director General.

## Qué se construyó

Desde este bloque, ARZA ONE sabe **qué puede hacer cada persona**. Cada quien tiene uno o varios
roles (los 16 del numeral 15.2) y sus permisos se suman. El servidor revisa el permiso en cada
petición; la pantalla solo muestra lo que la persona puede hacer, pero quien decide es siempre el
servidor. Usted aprobó ocho decisiones antes de empezar (ver «Decisiones tomadas»).

| Pieza                            | Qué hace, en palabras sencillas                                                                                                                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catálogo de permisos             | Los 201 permisos del anexo G, cada uno con una descripción en español (por ejemplo «Bloquear y desbloquear usuarios»). Es el mismo para todas las empresas                                                             |
| 16 roles del sistema             | Se crean solos en cada empresa con los permisos que salen de la matriz del numeral 15.3. No se editan. La tabla completa de qué tiene cada rol está en [`permisos-por-rol.md`](../manual/datos/permisos-por-rol.md)    |
| Roles personalizados             | Para ajustes: se crean con nombre, para quién (internos o portal) y permisos elegidos, cada uno «para todo» o «solo lo propio» cuando se puede                                                                         |
| Asignar y retirar roles          | Con vencimiento opcional. **El auditor siempre vence, a los 90 días como máximo.** Retirar un rol surte efecto en la siguiente acción de esa persona                                                                   |
| Nadie se da permisos a sí mismo  | No puede asignarse ni retirarse roles, ni editar un rol que tiene, ni registrar una delegación a su favor. **La base de datos también lo impide**, por si algún día falla el programa                                  |
| Guarda de permisos               | Cada punto de la API declara el permiso que exige. **Una prueba recorre todos los puntos** y falla si alguno no lo declara o nombra uno que no existe. Sin el permiso responde «No tiene permiso para esta acción»     |
| «Solo lo propio»                 | Un colaborador puede delegar sus propias aprobaciones, pero no las de otros: si intenta ver o retirar una ajena, el servidor responde «no existe»                                                                      |
| Respuesta según el rol           | En la ficha de un usuario, los datos de seguridad (segundo factor, sesiones abiertas, bloqueo) solo los ve quien puede administrarlos                                                                                  |
| Pantallas                        | Administración › Usuarios, Roles y permisos, Delegaciones y Revisión de accesos, y «Sus roles» en Mi perfil                                                                                                            |
| Acciones sobre otras personas    | Invitar (eligiendo roles), reenviar la invitación, bloquear, desbloquear, reiniciar el segundo factor, cerrar sus sesiones y **cerrar todas las sesiones de la empresa** (para un incidente). Cierra pendientes de B09 |
| Delegaciones                     | Delegar aprobaciones hasta 60 días (por ejemplo, durante unas vacaciones). Solo aprobaciones que quien delega tiene hoy                                                                                                |
| Revisión de accesos              | Informe para la Dirección: usuarios, roles, último ingreso y cuentas activas sin uso en 60 días. Se puede imprimir o guardar en PDF. Cada consulta queda en la auditoría                                               |
| Alerta de cada cambio            | Todo cambio de permisos deja registro de auditoría, evento de seguridad y una alerta para el responsable técnico (la entrega B16). La persona recibe el correo «Cambiaron sus roles en ARZA ONE»                       |
| Comando del primer administrador | `pnpm iam:asignar-rol`: como nadie se asigna roles a sí mismo, el primer administrador de una empresa lo asigna el sistema                                                                                             |

**Tablas nuevas:** `iam_permissions`, `iam_roles`, `iam_role_permissions`, `iam_user_roles` e
`iam_delegations`, con empresa y protección por fila (salvo el catálogo, que es común) y sin
permiso de borrar. Diccionario en [`iam.md`](../manual/datos/iam.md). **Migración:** una
(`20261011000000_iam_roles_permissions_and_delegations`).

**Puntos de la API:** veintiuno nuevos (lista en [`apps/api/README.md`](../../apps/api/README.md)).
Los de B08 y B09 pasan a declarar «mi propia cuenta» en vez de «con sesión».

**Biblioteca nueva (aprobada):** `@casl/ability` 7.0 (MIT, actualizada en julio de 2026), la que
nombran el manual y la ADR-009.

**Variables nuevas:** ninguna.

### Problemas reales que se encontraron y se corrigieron

1. **La invitación ofrecía el rol Auditor, que no podía funcionar** (lo encontró el recorrido en el
   navegador real). El auditor siempre necesita fecha de vencimiento y la invitación no la pide, así
   que la invitación habría fallado. Ahora no se ofrece al invitar; se asigna desde la ficha, con
   su fecha, y la ventana lo explica.
2. **«solicítelo a el administrador»**: el aviso de «Sin permiso» (de B04) tenía ese error de
   redacción. Se vio por primera vez ahora, porque antes nadie llegaba a ese aviso. Ya dice
   «solicítelo al administrador» y la prueba compara la frase exacta.
3. **Los totales del informe de revisión de accesos estaban mal armados para un lector de
   pantalla** (lo detectó la revisión automática de accesibilidad en el navegador). Corregido; la
   revisión pasa en modo claro y oscuro.
4. **Cargar los 16 roles de una empresa tardaba más de 5 segundos** cuando varias empresas se
   cargaban a la vez (en las pruebas) y la base de datos cortaba la operación. Ahora cada rol se
   carga por separado, y si dos cargas coinciden, la segunda no repite lo que hizo la primera.
5. **Un colaborador no podía elegir a quién delegar**, porque no tiene permiso de ver la lista de
   usuarios (y no debe verla). Ahora escribe el correo de quien recibe; el correo solo se busca
   dentro de su empresa.
6. **La prueba de arranque de la API falló dos veces en la corrida completa.** Antes de darla por
   la lentitud conocida de este equipo, medí el arranque: B10 arranca igual que B09 (unos 4
   segundos con el equipo tranquilo); la falla aparece solo con el equipo muy cargado, como desde
   B03. No se modificó la prueba.

## Cómo se probó

- **Recorrido real completo en el navegador**, con base de datos, worker y bandeja de correo
  locales (en una copia aparte del proyecto, con datos ficticios, que después apagué y borré):
  semilla con 201 permisos y 48 roles (16 por cada una de las 3 empresas) → invitar a Ana con el
  comando → activar, entrar y configurar el segundo factor → como Colaboradora no ve Comercial y
  **al escribir la dirección de Usuarios ve «No tiene acceso» y la API responde 403** →
  `pnpm iam:asignar-rol` la vuelve administradora y llega «Cambiaron sus roles en ARZA ONE» → su
  propia ficha no deja cambiar nada → invita a Luis con Comercial desde la pantalla → Auditor sin
  fecha es rechazado con el mensaje claro → asigna Servicio y **Luis tiene el rol en su siguiente
  petición** → bloquear: **la sesión de Luis deja de servir y no puede entrar**; desbloquear: vuelve
  a entrar → Luis delega a Ana su aprobación de cotizaciones, y una que no tiene es rechazada → Ana
  ve la delegación, el informe de revisión de accesos y crea el rol «Apoyo comercial» con «solo lo
  propio» → en la base quedaron los registros de auditoría y las alertas de cada cambio.
- `pnpm check` en este equipo, en verde (ver «Resultado de `pnpm check`» más abajo).
- **Prueba de que cada punto declara su permiso:** `test/access.test.ts` recorre las 41 rutas de la
  API.

| Criterio de aceptación                                                         | Cómo se demuestra                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cada punto de la API declara su permiso; una prueba falla si alguno no lo hace | `test/access.test.ts`: falla si una ruta no declara nada, si nombra un permiso que no está en el catálogo o si usa «mi propia cuenta» fuera de `/v1/me` y `/v1/auth`. Se comprobó que la prueba detecta una ruta sin declarar (ruta de ensayo)                                                                                                                                                          |
| Nadie puede asignarse permisos a sí mismo                                      | `role-assignment.int.test.ts`: asignarse o retirarse un rol responde 403 y **la base rechaza la fila aunque se intente escribir directamente**; `roles-admin.int.test.ts`: editar un rol que uno tiene responde 403; `delegations.int.test.ts` y `access-database.int.test.ts`: nadie registra una delegación a su favor. En la web, la propia ficha no ofrece cambios. Comprobado en el navegador real |
| La interfaz oculta lo que el usuario no puede hacer y la API lo deniega igual  | `access-control.int.test.ts`: los 20 puntos nuevos con permiso responden 403 a quien no tiene roles. En el navegador (`administration.spec.ts`): sin roles el menú no muestra Administración, y al escribir la dirección se ve «Sin permiso» sin datos. Comprobado en el navegador real                                                                                                                 |
| `pnpm check` en verde                                                          | Ver abajo y el pull request                                                                                                                                                                                                                                                                                                                                                                             |
| Permiso denegado, aislamiento y auditoría                                      | Ver la sección siguiente                                                                                                                                                                                                                                                                                                                                                                                |
| Documentación y cierre                                                         | Este documento, [`iam.md`](../manual/datos/iam.md), [`permisos-por-rol.md`](../manual/datos/permisos-por-rol.md), las guías de [`apps/api`](../../apps/api/README.md), [`apps/web`](../../apps/web/README.md) y del [servidor de pruebas](../runbooks/servidor-de-pruebas.md), y el OpenAPI regenerado                                                                                                  |

### Permiso denegado, aislamiento entre empresas y auditoría

- **Permiso denegado:** cada punto nuevo responde 403 sin el permiso; el auditor lee pero no
  asigna ni invita; un colaborador no ve el informe, no registra delegaciones de otros ni retira las
  ajenas (404); las acciones de alto riesgo piden confirmar la identidad pasados 30 minutos; en la
  base, `app_user` no puede borrar en ninguna de las cinco tablas nuevas, y la base rechaza
  condiciones distintas de «solo lo propio» y delegaciones de más de 60 días.
- **Aislamiento entre empresas:** un administrador no ve ni actúa sobre usuarios, roles ni
  delegaciones de otra empresa (404) y los permisos de una empresa no valen en otra; sin empresa no
  se ve ningún rol; el correo de alguien de otra empresa no sirve para delegarle; el informe de
  una empresa no incluye a la otra.
- **Auditoría:** cada asignación, retiro, rol creado o editado, delegación, invitación, bloqueo,
  desbloqueo, reinicio del segundo factor, cierre de sesiones y consulta del informe deja su
  registro, y cada cambio de permisos además su evento de seguridad y su alerta. Las pruebas lo
  comprueban; la lista está en [`iam.md`](../manual/datos/iam.md).

### Resultado de `pnpm check`

En verde en una sola corrida completa, en este equipo: formato, análisis, tipos, fronteras entre
módulos y código sin uso; **182 pruebas unitarias de la API**, 155 de la web, 39 de los contratos,
34 del worker y las de los demás paquetes; **256 pruebas con base de datos real de la API** y 13
del worker; compilación; **81 pruebas en el navegador** (19 nuevas de administración, con
accesibilidad WCAG 2.2 AA en modo claro y oscuro); sin secretos. Cobertura: API 97,6 % de líneas en
pruebas unitarias y 98,5 % en pruebas con base de datos real; web 97,9 % de líneas y 89,2 % de
ramas. En dos corridas anteriores falló la prueba de arranque de B02 por la carga del equipo (ver
«Problemas reales», punto 6) y una vez el OpenAPI, que olvidé regenerar tras un cambio de contrato;
ninguna prueba se modificó para pasar.

## Cómo lo prueba usted, paso a paso

Necesita Docker Desktop abierto y el celular con su aplicación de autenticación (la de B09). Va a
usar **dos personas ficticias**: Ana, que será la administradora, y Luis, un colaborador.

### 1. Preparar su equipo

```bash
git switch feat/b10-roles-permisos-y-autorizacion
```

```bash
pnpm install
```

### 2. Encender todo

```bash
pnpm infra:up
```

```bash
pnpm dev
```

Espere a que la terminal se calme (un minuto o dos). `pnpm infra:up` corre la semilla, que crea los
permisos y los 16 roles en cada empresa de prueba.

### 3. Crear a Ana y darle el rol de administradora

En **otra** terminal:

```bash
pnpm iam:invitar --empresa demo-uno --correo ana@demo-uno.test --nombre "Ana Pérez"
```

Abra la bandeja de prueba (http://localhost:8025 o el número de su `MAILPIT_UI_PORT`), abra
«Invitación a ARZA ONE», active la cuenta, inicie sesión y configure el segundo factor como en B09.

Entre a la aplicación: el menú muestra los módulos de un colaborador (Documentos, Servicio, Calidad…)
pero **no Comercial**, y Administración solo con «Delegaciones», porque Ana solo tiene el rol
Colaborador (lo reciben todas las personas internas al ser invitadas). Ahora dele el rol de administradora:

```bash
pnpm iam:asignar-rol --correo ana@demo-uno.test --rol ADMIN_PLATAFORMA
```

Recargue la página: en **Administración** aparecen ahora Usuarios, Roles y permisos y Revisión de
accesos. En la bandeja de prueba llegó
«Cambiaron sus roles en ARZA ONE». En **Mi perfil** › «Sus roles» verá Administrador de plataforma
y Colaborador.

### 4. Invitar a Luis desde la pantalla (criterio 3: la interfaz oculta lo que no se puede)

1. Administración › **Usuarios** › «Invitar a una persona». Escriba `luis@demo-uno.test`, marque
   el rol **Comercial** y envíe (el rol Auditor no aparece aquí: se asigna desde la ficha, con fecha). Luis aparece en la lista como «Invitado».
2. Active la cuenta de Luis con el correo que llegó **en otra ventana privada** del navegador (para
   no cerrar la sesión de Ana) y configure su segundo factor.
3. Como Luis, mire el menú: ve Comercial; en Administración **solo ve Delegaciones** (no Usuarios ni
   Roles).
4. Siempre como Luis, escriba en la barra de direcciones
   `http://localhost:3000/app/administracion/usuarios`: ve **«No tiene acceso a esta sección»**, sin
   ningún dato. Aunque la pantalla no se mostrara, el servidor le negaría la lista igual.

### 5. Nadie se asigna permisos a sí mismo (criterio 2)

1. Como Ana, abra **su propia ficha** en Usuarios: dice «Esta es su propia cuenta: sus roles los
   cambia otro administrador» y **no aparecen** «Asignar» ni «Retirar».
2. Abra la ficha de Luis: ahí sí puede asignarle, por ejemplo, **Servicio al cliente**. Si pasaron
   más de 30 minutos desde que Ana entró, aparece «Confirme que es usted»: escriba su contraseña y
   el código del celular.
3. Pruebe el rol **Auditor** sin fecha de vencimiento: la pantalla dice que el auditor siempre
   vence, a los 90 días como máximo. Póngale una fecha cercana y funciona.
4. Como Luis, recargue: el menú ya muestra Servicio. Retírele el rol desde la ficha («Retirar»):
   en la siguiente acción de Luis el menú ya no lo muestra.

### 6. Roles y delegaciones

1. Administración › **Roles y permisos**: están los 16 del sistema. Abra «Comercial»: los permisos
   se ven por módulo y **no se pueden editar**.
2. «Crear un rol personalizado»: nombre «Apoyo comercial», marque «Ver prospectos» y «Ver tiquetes»
   con «Solo lo propio». Créelo; luego edítelo y guarde.
3. Como Luis, abra Administración › **Delegaciones** (la ve porque todo colaborador puede delegar
   lo suyo). Escriba el correo de Ana, unas fechas, el motivo y marque «Aprobar cotizaciones»
   (Luis la tiene por Comercial). Delegue. Ana la ve en su lista de delegaciones.

### 7. Acciones de seguridad y revisión de accesos

1. En la ficha de Luis: «Bloquear la cuenta». En la ventana de Luis, recargue: **le pide iniciar
   sesión y no puede entrar**. Vuelva a la ficha y «Desbloquear la cuenta».
2. Administración › **Revisión de accesos**: verá a Ana y a Luis con sus roles y su último ingreso,
   los totales y «Imprimir o guardar en PDF».

### 8. Al terminar

Detenga `pnpm dev` con Ctrl + C:

```bash
pnpm infra:down
```

## Pendientes

- **Revisión externa** del bloque (es crítico), antes de integrarlo.
- **Revise la tabla de permisos por rol** ([`permisos-por-rol.md`](../manual/datos/permisos-por-rol.md)).
  La deduje con las reglas que usted aprobó; algunos casos dependen del criterio y conviene que
  usted los confirme. Por ejemplo: Dirección no ve salarios; el Contador ve las cuentas bancarias
  de terceros; Calidad puede reasignar tareas de todos. Cualquier cambio es una línea en
  `packages/contracts/src/iam/role-matrix.ts`.
- **Calidad e Innovación no tienen permisos de «leer»** en el anexo G (solo de crear, gestionar y
  aprobar), así que la letra **L** de la matriz no les da nada en esos módulos: el Auditor y la
  Dirección no pueden consultarlos solo por leer. Lo deben resolver B38 y el bloque de innovación
  agregando esos permisos al catálogo y a la matriz (el anexo G dice que agregar un permiso exige
  actualizar la matriz).
- **«Solo lo propio» de cada módulo:** B10 deja el mecanismo y lo usa en las delegaciones. Cada
  módulo que llegue debe armar en sus registros la lista de personas relacionadas
  (`involved_user_ids`) para que «solo lo propio» funcione; por ejemplo, el criterio de la ficha
  17.2 «EQUIPO_PROYECTO recibe 404 al consultar un proyecto ajeno» se cumple en el bloque de
  proyectos (B26).
- **Las delegaciones se registran, pero todavía no hay aprobaciones que delegar:** el motor de
  flujos y tareas (B15) las usará para que la persona que recibe apruebe en nombre de quien delega.
- **Exportar el informe de revisión de accesos a hoja de cálculo** con registro de la exportación
  (B11). Hoy se ve en pantalla y se imprime o guarda en PDF desde el navegador.
- **Tablero de cumplimiento** (B46): el numeral 15.2 pide mostrar allí los casos en que una misma
  persona solicita y aprueba.
- **Usuarios del cliente desde el portal** (bloque del portal): el administrador del cliente
  gestionará a sus usuarios con `portal.user.manage`.
- **Inactivar al retirarse un colaborador** (Talento humano, B35): hoy se puede bloquear a mano.
- **Editar los datos de una persona** (`iam.user.update`) y retirar roles personalizados que ya no
  se usan: no los pedía el bloque; quedan para cuando se necesiten.
- **Servidor de pruebas:** después del primer despliegue con B10 hay que dar el rol de
  administrador a la primera persona. El comando está en la
  [guía del servidor](../runbooks/servidor-de-pruebas.md#variables-nuevas-de-cada-bloque); no lo
  pude probar porque el servidor todavía no existe.
- **Condición de carrera en `pnpm check`** (de B09): sigue anotada; no apareció en este bloque.

## Decisiones tomadas

Aprobadas por usted antes de empezar:

1. **Biblioteca `@casl/ability` 7.0** (MIT).
2. **Matriz por reglas:** L da leer; C, leer y operar; A, aprobar; C y A juntas, además
   configurar el módulo; P, lo mismo limitado a lo propio. Los datos sensibles (salarios, historia
   laboral, conceptos de aptitud, cuentas bancarias, exportar auditoría) solo a los roles que nombra
   el numeral 15.2.
3. **El catálogo de permisos no lleva empresa**; los roles, asignaciones y delegaciones sí.
4. **Asignar un rol surte efecto de inmediato**, sin segundo paso de aprobación.
5. **Toda persona interna recibe COLABORADOR** al ser invitada.
6. **El auditor siempre vence, a los 90 días como máximo.**
7. **Delegaciones de hasta 60 días**, de las aprobaciones propias; el administrador puede
   registrarlas para otros, nunca a su favor.
8. **CLIENTE_ADMIN vuelve obligatorio el segundo factor.**

Tomadas durante la construcción (técnicas, sin cambiar lo que usted ve, salvo donde se dice):

9. **Los permisos se calculan en cada petición**, sin guardarlos en memoria: quitar un rol surte
   efecto de inmediato a cambio de una consulta más por petición.
10. **La guarda de permisos va después de la protección antifalsificación y antes de pedir
    confirmar la identidad:** quien no tiene el permiso recibe «sin permiso» de una vez, en vez de
    que se le pida la contraseña para luego negarle.
11. **Nadie edita un rol que tiene**, porque sería otra forma de darse permisos.
12. **«Solo lo propio» se guarda como una sola condición fija** (`{"scope": "own"}`); la base
    rechaza cualquier otra, así nadie puede escribir reglas raras en un rol.
13. **Quien no ve la lista de usuarios delega escribiendo el correo** de quien recibe, para no
    mostrar a todo colaborador la lista completa de personas (cambia lo que usted ve).
14. **Acciones que piden confirmar la identidad:** desbloquear, reiniciar el segundo factor de
    otro, cerrar sesiones, asignar y retirar roles, crear y editar roles y crear delegaciones.
    Bloquear no la pide, para que en un incidente se pueda actuar rápido.
15. **El informe de revisión de accesos queda en la auditoría cada vez que se consulta**, porque
    reúne datos de todas las cuentas.
16. **Delegaciones vive en Administración**, así que todo colaborador ve Administración con esa
    sola sección (cambia lo que usted ve; si prefiere, se puede mover a Mi perfil).

## Commits

Ver la lista en el pull request.
