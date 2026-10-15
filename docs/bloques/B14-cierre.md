# Cierre del bloque B14: Archivos

- Fecha: 15/10/2026
- Rama: `feat/b14-archivos`
- Estado: en revisión. **Es un bloque crítico:** además de su aprobación, necesita la revisión
  externa que pide el plan de construcción.

## Qué se construyó

Desde este bloque, ARZA ONE puede **recibir, guardar y entregar archivos de forma segura**. Es el
cimiento que después usarán documentos, contratos, hojas de vida y el certificado bancario de los
terceros. Usted aprobó el plan con las cuatro opciones recomendadas; las decisiones están al final.

| Pieza                     | Qué hace, en palabras sencillas                                                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lista blanca              | Solo se aceptan PDF, imágenes PNG y JPEG, Word (.docx) y Excel (.xlsx), de hasta 20 MB. La pantalla lo revisa antes de enviar, y la API y la base de datos lo vuelven a revisar |
| Carga por enlace temporal | Para subir, la plataforma entrega un enlace de **un solo uso** que vence en 15 minutos. El archivo queda **«En análisis»**                                                      |
| Antivirus                 | El trabajador de segundo plano pasa cada archivo por **ClamAV**. Un archivo con virus queda **«Rechazado»**, se borra del almacenamiento y deja una alerta de seguridad         |
| Tipo real                 | Se revisa el **contenido**, no solo el nombre: un programa renombrado como «factura.pdf» se rechaza                                                                             |
| Huella SHA-256            | Cada archivo aceptado recibe su «huella digital»: un código que cambia si alguien altera aunque sea un byte. La base de datos **no deja cambiarla** después                     |
| Descarga por 5 minutos    | Quien tiene permiso pide un enlace que **vence a los cinco minutos**. El archivo siempre llega «como descarga», nunca se abre dentro de la página                               |
| Registro de accesos       | Pedir el enlace y descargar quedan en la **Auditoría**: quién, qué archivo y cuándo. La llave del enlace nunca se guarda                                                        |
| Pantalla «Archivos»       | Nueva sección en el menú, con el **componente de carga**, la lista con el estado de cada archivo y su huella, y el **componente de vista previa** para PDF e imágenes           |

**Tabla nueva:** `doc_files`, separada por empresa con la seguridad por fila. Diccionario en
[`doc.md`](../manual/datos/doc.md). El almacén (Garage) **sigue escondido** dentro del servidor: los
archivos pasan por la API, como usted eligió.

## Cómo se probó

| Prueba                  | Qué demuestra                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Virus de ensayo (EICAR) | Con **ClamAV de verdad**, el archivo de ensayo disfrazado de PDF queda «Rechazado: virus», se borra y deja la alerta                                                      |
| Vencimiento             | El enlace de descarga funciona al minuto 4 y **falla al minuto 5**; el de subida falla pasados 15 minutos                                                                 |
| Un solo uso             | El enlace de subida no sirve dos veces; si el envío falla (tipo o tamaño distinto) se puede reintentar con el mismo                                                       |
| Tipo real               | Un ejecutable renombrado como PDF queda «Rechazado: el contenido no es del tipo que indica su nombre»                                                                     |
| Huella                  | La huella guardada es la del contenido, y la base de datos rechaza cambiarla                                                                                              |
| Descarga                | El contenido descargado es idéntico al subido y llega como adjunto                                                                                                        |
| Worker completo         | El trabajador real recibe el trabajo de la cola, analiza un PDF y lo deja disponible con su huella                                                                        |
| Pantallas               | 13 pruebas de pantalla (carga, rechazo en pantalla, vista previa, descarga, errores) y la página en un navegador real, sin fallas de accesibilidad en modo claro y oscuro |

### Permiso denegado, aislamiento entre empresas y auditoría

- **Permiso denegado:** un usuario sin rol y un usuario del portal **no obtienen el enlace** de
  descarga ni el de subida. Dirección y Colaborador pueden leer pero no subir. Quien solo ve «lo
  propio» (Colaborador) no ve ni descarga archivos de otros.
- **Aislamiento:** la empresa B no ve, no lista y no obtiene enlaces de los archivos de la empresa
  A; cada empresa guarda sus archivos en su propia carpeta del almacén.
- **Auditoría:** las tres rutas nuevas que escriben están en el recorrido de B11, que exige un evento
  por cada una; otra prueba revisa los cinco eventos de un archivo y que la llave del enlace no
  quede guardada. La pantalla de Auditoría los muestra en español.

### Resultado de `pnpm check`

En verde el 15/10/2026, paso por paso (ver la nota 1):

| Paso                    | Resultado                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------- |
| Formato                 | Sin problemas en los 902 archivos del proyecto                                        |
| Estilo y tipos          | Sin problemas                                                                         |
| Fronteras entre módulos | Sin problemas: el worker usa archivos solo por el índice del módulo `doc`             |
| Código sin usar (knip)  | Sin problemas                                                                         |
| Pruebas unitarias       | API 241, web 241, contratos 68, worker 36, interfaz 19, configuración 24, guiones 140 |
| Pruebas de integración  | API 442 en 46 archivos (20 nuevas de archivos), worker 16 (1 nueva)                   |
| Cobertura               | Por encima de lo que exige el capítulo 21 (ramas de la web: 85,8 %, mínimo 85 %)      |
| Pruebas en navegador    | 127, incluidas 4 nuevas de archivos en modo claro y oscuro                            |
| Búsqueda de secretos    | Ninguno                                                                               |
| Migraciones             | Desde cero en la prueba de integración, sin diferencias con el modelo                 |

**Cosas que debe saber de esta verificación:**

1. **Carpetas ajenas al proyecto.** El paso de formato (`pnpm format:check`) revisa todas las
   carpetas, y en su equipo hay tres que no son del proyecto ni están en git:
   `apps/api/.agents`, `apps/api/.claude` y `apps/api/.windsurf` (instrucciones de Prisma de alguna
   herramienta), más `.claude/worktrees/strange-lichterman-4900f3`, una copia de trabajo de una
   sesión anterior cuya rama ya se fusionó. **No las toqué.** Por ellas, `pnpm check` se detiene en
   el primer paso. Revisé el formato de los 902 archivos del proyecto con la misma configuración
   (todo bien) y corrí los demás pasos uno por uno. Si usted no las necesita, puede borrarlas; en
   GitHub no existen, así que allá no afectan.
   ESLint también revisaba esas carpetas; lo corrí con la misma regla del proyecto excluyendo solo
   esas cuatro.
2. **Memoria del equipo.** A mitad del trabajo Docker Desktop se cayó por falta de memoria (0,5 GB
   libres de 7,3). Lo reinicié, **apagué su entorno local con `pnpm infra:down`** (los datos se
   conservan) y **detuve su `pnpm dev`**, que seguía encendido sin el entorno. En el paso 1 de
   abajo los vuelve a encender. Aun así, las pruebas unitarias y las de integración solo pasaron
   corriendo **un paquete a la vez** (`turbo --concurrency=1`): con todo en paralelo la base de
   datos «no alcanzaba a abrir transacciones» y la prueba de arranque de la API (la misma de B11 y
   B13) se pasaba de tiempo. Son las mismas pruebas, sin ningún cambio; en GitHub hay más memoria.
3. **Un arreglo que salió de las pruebas.** Tras reiniciar Docker, el antivirus dejó de responder
   desde fuera de su contenedor. La causa: el programa avisaba «terminé de enviar» antes de recibir
   la respuesta, y la red de Docker cortaba ahí. Lo corregí en el código del antivirus, no solo en
   la prueba, porque al worker real le podía pasar igual (commit `8d62fdb`).
4. ESLint siguió necesitando `NODE_OPTIONS=--max-old-space-size=4096`, como en B13.

## Cómo lo prueba usted, paso a paso

### 1. Encender todo

En una terminal, en la carpeta del proyecto:

```bash
git switch feat/b14-archivos
```

```bash
pnpm infra:up
```

```bash
pnpm db:migrate
```

```bash
pnpm dev
```

El antivirus tarda varios minutos en estar listo la primera vez (carga su base de firmas). Mientras
no esté listo, los archivos se quedan «En análisis»: es lo esperado, nunca se aceptan sin revisar.
Puede ver si ya está listo con `pnpm infra:status` (ClamAV debe decir «healthy»).

### 2. Darse permiso para subir

Subir archivos lo pueden hacer los roles con «crear» en documentos (Calidad, Comercial, Líder
técnico, Servicio, Finanzas, Talento humano, SST y Oficial de datos). Ana (ADMIN_PLATAFORMA) solo
puede ver. Asígnele a Ana el rol de Calidad:

```bash
pnpm iam:asignar-rol --correo ana@demo-uno.test --rol CALIDAD
```

### 3. Subir un archivo bueno

1. Entre en http://localhost:3000 con Ana. En el menú aparece **Archivos**.
2. Pulse «Elija un archivo» (o arrastre uno encima) y elija un PDF cualquiera suyo de prueba (no use
   documentos reales). Pulse **«Subir archivo»**.
3. Aparece «Recibido» y el archivo sale en la lista como **«En análisis»**. En unos segundos cambia
   solo a **«Disponible»** y muestra su huella (64 letras y números).
4. Pulse **«Vista previa»**: se abre el PDF dentro de una ventana. Pulse **«Descargar»**: el navegador
   lo descarga.

### 4. El archivo de ensayo con virus (criterio del bloque)

El «archivo de ensayo EICAR» es una línea de texto que **todos los antivirus reconocen como virus de
prueba, sin ser dañina**. Su propio antivirus de Windows también la detectará y puede borrarla:
es normal.

1. Abra el Bloc de notas y pegue exactamente esta línea:
   `X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*`
2. Guárdela como `prueba.pdf` (en «Tipo», elija «Todos los archivos»). Si Windows la borra al
   guardarla, desactive un momento la «protección en tiempo real» o pruebe en otra carpeta.
3. Súbala en **Archivos**. Pasa de «En análisis» a **«Rechazado»** con el motivo **«El antivirus
   encontró un virus»**, y no ofrece descargarla.
4. Con una cuenta que vea la auditoría (por ejemplo, Ana), en **Auditoría › Seguridad** aparece la
   alerta del virus.

### 5. El enlace vence a los cinco minutos (criterio del bloque)

1. En **Archivos**, pulse «Descargar» en un archivo disponible. Abra la lista de descargas del
   navegador (Ctrl + J), haga clic derecho sobre esa descarga y elija «Copiar dirección del
   vínculo».
2. Pegue esa dirección en una pestaña nueva antes de cinco minutos: descarga el archivo otra vez.
3. Espere **cinco minutos** y péguela otra vez: responde «El enlace no es válido, ya se usó o
   venció».

### 6. Quien no tiene permiso no obtiene el enlace (criterio del bloque)

1. Invite a una persona y no le asigne ningún rol adicional, o use un usuario del portal.
2. Esa persona no ve **Archivos** en el menú; si escribe `/app/archivos`, ve «No tiene acceso a esta
   sección». La API tampoco le entrega enlaces.
3. Una persona con solo el rol **Colaborador** ve la sección, pero no los archivos de Ana.

### 7. La auditoría

Con Ana, en **Auditoría**, verá «Pidió subir un archivo», «Subió un archivo», «Analizó un archivo
con el antivirus», «Pidió el enlace de descarga de un archivo» y «Descargó un archivo».

## Pendientes

- **Revisión externa:** este bloque es crítico. Lo más útil de revisar está en «Qué revisar» del
  pull request.
- **`doc_access_log`, carpetas, documentos y versiones:** llegan con el bloque de documentos, como
  acordamos. Hoy el registro de accesos es la auditoría.
- **Verificar la huella al descargar** (criterio de la ficha 17.4: «alterar un archivo hace fallar
  la verificación»): la huella ya se guarda y no se puede cambiar; la comprobación al descargar va
  con los documentos versionados.
- **Certificado bancario en Terceros:** ya se puede conectar; quedó para no mezclar bloques.
- **Antivirus en el ambiente de pruebas (servidor):** ClamAV está en el perfil opcional
  «antivirus». Si no se enciende allá, los archivos se quedan «En análisis» (nunca se aceptan sin
  revisar). Encenderlo es una decisión de operación por la memoria del servidor.
- **Lista de archivos sin páginas:** muestra los 200 más recientes. Se pagina cuando lleguen los
  expedientes.

## Decisiones tomadas

1. **Los archivos pasan por la API** (opción A): Garage sigue sin dirección pública. Los enlaces
   son de la API; su llave es larga (256 bits) y solo su huella se guarda, en Valkey, que la borra
   sola al vencer.
2. **Permisos existentes:** subir = «Crear documentos», descargar = «Ver documentos»; «lo propio»
   son los archivos que la persona subió.
3. **Lista blanca:** PDF, PNG, JPEG, .docx y .xlsx, hasta 20 MB. Sin formatos con macros.
4. **Registro de accesos en la auditoría** inmutable de B11; `doc_access_log` con los documentos.
5. **Primero el antivirus, después el tipo:** un virus disfrazado de otro tipo queda registrado como
   virus, con su alerta de seguridad, y no solo como «tipo incorrecto».
6. **Si el antivirus no responde, el archivo espera** (se reintenta unos dos minutos y medio y luego
   queda «En análisis»): nunca se acepta sin revisar.
7. **El enlace de subida se gasta solo si todo salió bien:** si el envío falla, la persona reintenta
   con el mismo enlace dentro de sus 15 minutos.
8. **Vista previa desde la memoria del navegador:** la web trae el archivo y lo muestra, sin abrir la
   API dentro de la página. Para eso la política de seguridad de la web permite mostrar contenido
   `blob:` en un marco (cambio de una línea).
9. **Pruebas con ClamAV real cargado solo con la firma de ensayo**, para que arranque en segundos.
   El archivo de ensayo se arma en memoria durante la prueba: así el antivirus de su equipo no borra
   archivos del repositorio.
10. **Cliente de ClamAV propio** (unas 30 líneas con lo que trae Node), sin agregar dependencias.

## Commits

| Commit    | Qué hizo                                                                              |
| --------- | ------------------------------------------------------------------------------------- |
| `40c353a` | Tabla `doc_files` con sus reglas y los contratos de archivos                          |
| `9aa1e1b` | API: subida, análisis y descarga por enlaces temporales, con sus pruebas              |
| `4a343c7` | Worker: análisis con ClamAV y configuración del ambiente de pruebas                   |
| `b6b8e93` | Pantalla Archivos con los componentes de carga y vista previa                         |
| `0eeebfe` | Diccionario de datos, README y OpenAPI                                                |
| `ee6b328` | Funciones que solo usa su archivo quedan privadas; el índice `doc` es entrada pública |
| `474c56c` | Las dos rutas de enlaces temporales quedan permitidas como públicas, y solo ellas     |
| `8d62fdb` | La conexión con el antivirus espera su respuesta antes de cerrarse                    |
| (este)    | Cierre del bloque                                                                     |
