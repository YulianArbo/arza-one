# Carga inicial de datos (B45)

Esta guía explica cómo cargar en producción, **una sola vez**, los datos con que arranca ARZA
ONE: la estructura de la empresa, las personas que van a usar la plataforma, los clientes y
proveedores, y los documentos del SGC. Sigue el numeral 18.2 del manual y respalda los puntos 16,
17 y 22 del anexo E.

> **Regla de oro:** primero se revisa y después se carga. Ningún comando cambia nada si no se le
> agrega `--aplicar`. Con un solo problema en las plantillas, no se carga nada.

## Quién hace qué

| Paso | Qué se carga                      | Quién lo hace                                                         | Permisos que necesita la persona del `--correo`            |
| ---- | --------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1    | Áreas, cargos y usuarios          | Responsable técnico, con la cuenta del administrador de la plataforma | Rol ADMIN_PLATAFORMA                                       |
| 2    | Listado Maestro (RE-SGC-001)      | Calidad                                                               | Rol CALIDAD                                                |
| 3    | Tabla de retención (RE-SGC-005)   | Calidad                                                               | Rol CALIDAD                                                |
| 4    | Clientes y proveedores (empresas) | Comercial o Administrativo y Financiero                               | Rol COMERCIAL, ADMIN_FINANCIERO, SERVICIO o TALENTO_HUMANO |
| 5    | Revisión final                    | Responsable técnico                                                   | Ninguno: el comando solo lee                               |

El administrador de la plataforma **no** puede crear terceros: solo los consulta. Es la misma
separación de funciones de las pantallas. Por eso los terceros se cargan en una corrida aparte, con
la cuenta de alguien de Comercial o de Finanzas.

## Antes de empezar

1. El servidor de producción está listo y con la semilla de producción, sin datos de demostración
   (guía [Servidor de producción](../runbooks/servidor-de-produccion.md)).
2. Ya existe la cuenta del primer administrador (`pnpm iam:invitar` y `pnpm iam:asignar-rol`), con
   su segundo factor activo.
3. Las plantillas se llenan en Excel y se guardan como **CSV (delimitado por comas)** o **CSV UTF-8**.
   Separador punto y coma o coma; da igual. Los encabezados se reconocen sin importar tildes ni
   mayúsculas.
4. En la carpeta [plantillas](plantillas/) hay un ejemplo de cada archivo, con datos **inventados**.
   Cópielos a una carpeta de trabajo del servidor, reemplace los datos y conserve los encabezados.

## Las cuatro plantillas

Ponga en una misma carpeta las que vaya a cargar; la que no esté, no se carga.

### `areas.csv`: procesos y áreas

| Columna     | Obligatoria | Contenido                                                                 |
| ----------- | ----------- | ------------------------------------------------------------------------- |
| Código      | Sí          | Mayúsculas, números y guiones; máximo 20 (`COM-MER`)                      |
| Nombre      | Sí          | Nombre del proceso o área                                                 |
| Tipo        | Sí          | «Proceso» o «Área»                                                        |
| Depende de  | No          | Código del proceso que lo contiene (ya existente o de este mismo archivo) |
| Cargo líder | No          | Nombre del cargo que lo lidera (ya existente o de `cargos.csv`)           |

### `cargos.csv`: cargos del organigrama

| Columna        | Obligatoria | Contenido                                                              |
| -------------- | ----------- | ---------------------------------------------------------------------- |
| Cargo          | Sí          | Nombre del cargo, como aparecerá en Administración › Procesos y cargos |
| Proceso o área | Sí          | Código del proceso o área al que pertenece                             |
| Reporta a      | No          | Nombre del cargo del jefe inmediato                                    |

La semilla ya trae el organigrama DC-SGC-001 (Director General, Gerente Comercial, etc.). Si una
fila repite un proceso o un cargo que ya existe, el informe dice «ya existía» y no lo toca.

### `usuarios.csv`: personas internas

| Columna | Obligatoria | Contenido                                                                  |
| ------- | ----------- | -------------------------------------------------------------------------- |
| Correo  | Sí          | Correo de la empresa de la persona                                         |
| Nombre  | Sí          | Nombre completo                                                            |
| Cargo   | No          | Nombre del cargo que ocupa (activo)                                        |
| Roles   | No          | Códigos de rol separados por barra vertical o coma: `COMERCIAL \| CALIDAD` |

Cada persona recibe:

- la invitación por correo, con enlace de un solo uso que vence en 72 horas;
- el rol COLABORADOR y los roles de la plantilla;
- el segundo factor obligatorio: no entra sin configurarlo.

Lo que la carga **no** hace a propósito:

- **No asigna ADMIN_PLATAFORMA** (decisión 3 de B45). Ese rol se asigna a mano en
  Administración › Usuarios, persona por persona.
- No acepta roles del portal de clientes.

Códigos de rol: DIRECCION, CALIDAD, COMERCIAL, LIDER_TECNICO, EQUIPO_PROYECTO, SERVICIO,
ADMIN_FINANCIERO, CONTADOR, TALENTO_HUMANO, SST, OFICIAL_DATOS, AUDITOR y los roles personalizados
internos que haya creado.

### `terceros.csv`: clientes y proveedores que son empresas

| Columna          | Obligatoria | Contenido                                                  |
| ---------------- | ----------- | ---------------------------------------------------------- |
| NIT              | Sí          | Solo números, sin puntos ni dígito de verificación         |
| DV               | Sí          | Dígito de verificación; la carga comprueba que corresponda |
| Razón social     | Sí          |                                                            |
| Nombre comercial | No          |                                                            |
| Papel            | Sí          | «Cliente», «Proveedor» o los dos separados por coma        |
| Correo           | No          | Correo de la empresa (no de una persona)                   |
| Teléfono         | No          | Solo números, con indicativo si es del exterior            |
| Ciudad           | No          |                                                            |
| Dirección        | No          |                                                            |

Solo empresas (decisión 1 de B45). Las personas naturales y los colaboradores se registran por
pantalla, porque llevan su autorización de tratamiento de datos y datos sensibles. El conocimiento
del tercero (FT-FIN-007) se diligencia después, en la ficha de cada uno.

## Paso a paso

Los comandos se escriben en la carpeta del proyecto en el servidor. Reemplace `<correo>` y la
carpeta por los suyos.

**1. Revisar áreas, cargos y usuarios** (no cambia nada):

```powershell
pnpm puesta:cargar --correo <correo del administrador> --carpeta <carpeta>
```

El comando muestra cuántos registros crearía, cuántos ya existían y cuáles filas tienen problemas,
con el número de fila de Excel. También guarda `informe-carga-inicial-<fecha>.csv` en la misma
carpeta. Corrija las plantillas y repita hasta que diga «Revisión sin problemas».

**2. Cargar áreas, cargos y usuarios:**

```powershell
pnpm puesta:cargar --correo <correo del administrador> --carpeta <carpeta> --aplicar
```

Si se interrumpe, vuelva a correrlo: continúa sin duplicar nada. El worker envía las invitaciones.

**3. Cargar el Listado Maestro y la tabla de retención** (Calidad), con los comandos de B19 y B21
descritos en [doc.md](../manual/datos/doc.md):

```powershell
pnpm doc:importar-listado --correo <correo de Calidad> --listado <RE-SGC-001.csv> --archivos <carpeta de archivos>
```

```powershell
pnpm doc:importar-retencion --correo <correo de Calidad> --tabla <RE-SGC-005.csv>
```

Cada uno revisa primero y carga con `--aplicar`. El informe del Listado Maestro debe terminar en
«SIN DIFERENCIAS» (punto 16 del anexo E).

**4. Cargar los terceros** (con una carpeta que solo tenga `terceros.csv`):

```powershell
pnpm puesta:cargar --correo <correo de Comercial o Finanzas> --carpeta <carpeta de terceros>
```

Si la revisión sale limpia, repita con `--aplicar`.

**5. Revisión de puesta en marcha** (solo lee):

```powershell
pnpm puesta:revisar
```

Responde «CUMPLE» o «NO CUMPLE» en cada punto que la plataforma comprueba sola:

- no quedan empresas ni cuentas de prueba;
- todas las cuentas internas activas tienen segundo factor;
- el Listado Maestro está cargado;
- todo documento tiene regla de retención;
- los textos legales están publicados con el concepto jurídico.

Guarda `revision-puesta-en-marcha-<fecha>.csv`, que va como evidencia en la
[lista de verificación](FT-TEC-007-lista-de-verificacion.md).

## Después de cargar

- En Administración › Revisión de accesos, revise que cada persona tenga solo los roles que necesita
  y que todas tengan el segundo factor «Activo». Descargue el CSV: es el «Informe de accesos» del
  punto 17.
- Guarde los informes de carga en la carpeta de evidencias de la puesta en marcha. **No** los suba
  al repositorio: llevan datos reales.
- Borre las plantillas con datos reales del servidor cuando ya no hagan falta.

## Qué queda en la auditoría

Cada alta deja el mismo evento que haría la pantalla, a nombre de la persona del `--correo` y
marcado con `source: import`:

| Qué se creó    | Evento de auditoría                                                       |
| -------------- | ------------------------------------------------------------------------- |
| Proceso o área | `core.org_unit.create` (y `core.org_unit.update` al fijar su cargo líder) |
| Cargo          | `core.position.create`                                                    |
| Persona        | `iam.user.invite` y `iam.role.assign`                                     |
| Tercero        | `party.create`                                                            |

Se consultan en Auditoría › Consulta de eventos.
