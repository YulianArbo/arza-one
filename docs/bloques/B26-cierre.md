# Cierre del bloque B26: Proyectos, estructura y tablero de trabajo

- Fecha: 31/10/2026
- Rama: `feat/b26-proyectos-estructura-y-tablero` (parte de `feat/b25-firma-electronica`, que
  todavía espera su revisión en el pull request #40)
- Estado: en revisión. No es un bloque crítico.

## Qué se construyó

Desde este bloque, ARZA ONE tiene el módulo **Proyectos** (ficha 17.8): cada proyecto nace de un
contrato vigente (o, sin él, con la autorización de la Dirección), tiene su equipo, sus hitos, sus
iteraciones, su lista de pendientes y un **tablero de trabajo** donde las tarjetas se arrastran de
columna en columna. Usted aprobó el plan con las catorce recomendaciones; están al final.

| Pieza                              | Qué hace, en palabras sencillas                                                                                                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lista de proyectos                 | Código, cliente, líder, fechas, **avance** y estado. El Equipo de proyecto ve **solo los suyos**. El Líder técnico ve además **«Contratos vigentes sin proyecto»**, cada uno con su botón «Crear el proyecto»          |
| Asistente «Nuevo proyecto»         | Se elige el contrato vigente (trae el cliente, las fechas y el valor) o «sin contrato» y se busca el cliente en Terceros. Luego nombre, tipo, metodología, presupuesto de horas y de pesos, y el líder                 |
| Iniciar                            | Con contrato vigente, «Iniciar el proyecto». Sin él, **«Pedir autorización a la Dirección»** con un motivo: la Dirección recibe la tarea en **Mis tareas** y autoriza (el proyecto arranca solo) o no (con comentario) |
| Estados                            | En planeación → en ejecución → en riesgo o pausado (cada uno con su motivo) → reanudar                                                                                                                                 |
| Equipo                             | Agregar personas con su rol y su dedicación; quien entra recibe un aviso. **Retirar a alguien le quita el acceso al instante** y suelta sus tareas abiertas                                                            |
| Hitos                              | Nombre, fecha y porcentaje que se factura; entre todos, **máximo 100 %**                                                                                                                                               |
| Iteraciones                        | Se planean dentro de las fechas del proyecto; **solo una en curso**; al cerrarla, lo no terminado vuelve a pendientes                                                                                                  |
| Lista de pendientes                | Épicas, historias, tareas y defectos con su código (`PRY-2026-0001-12`, «#12»). Marca en amarillo los que **no tienen criterios de aceptación**: esos **no pueden entrar a una iteración**                             |
| Tablero                            | Cinco columnas: Pendiente, En curso, En revisión, En pruebas, Terminado. Se arrastra con el ratón o se usa **«Mover a»** con el teclado. **No se salta columnas.** Se actualiza solo cada 10 segundos                  |
| Terminar un ítem                   | Pide el **enlace a la revisión de código** y **qué pruebas se hicieron**                                                                                                                                               |
| Enlaces                            | Repositorio, entornos, diseño y documentación; solo direcciones `https://`. ARZA ONE guarda el enlace, nunca el código del cliente                                                                                     |
| Horas, entregables, actas, riesgos | Dicen **«Disponible pronto»**: llegan con el B27                                                                                                                                                                       |

**Tablas nuevas** (separadas por empresa con seguridad por fila): `prj_projects`, `prj_members`,
`prj_milestones`, `prj_sprints`, `prj_items` y `prj_external_links`. Diccionario en
[`prj.md`](../manual/datos/prj.md). **Rutas nuevas de la API:** 23, en
[`apps/api/README.md`](../../apps/api/README.md) y en `apps/api/openapi.json`. **Aviso nuevo:**
«Novedad de un proyecto suyo».

**Lineamientos visuales del B22A:** componentes de `@arza/ui`, una acción principal por pantalla,
resumen de errores en cada formulario, estados de carga, vacío y error, y «Disponible pronto» en lo
que llega después. El menú «Proyectos» dejó de decir «en construcción».

## Cómo se probó

### Los criterios del bloque

**«Un miembro solo ve sus proyectos».** Una prueba contra una base de datos real crea dos
proyectos, agrega a una persona del Equipo de proyecto a uno solo y comprueba que en su lista
aparece ese y no el otro, que el otro «no existe» para ella (ni la ficha ni el tablero) y que no
puede crearle tareas. Otra la **retira del equipo** y comprueba que pierde el acceso en ese mismo
instante y que sus tareas abiertas quedan sin asignar.

**«Un ítem no entra a una iteración sin criterios de aceptación».** Una prueba intenta llevar a una
iteración una tarea sin criterios y una épica: la API las rechaza. Con criterios, entra. Y si
alguien borra los criterios de un ítem que ya está en la iteración, se rechaza. Además lo impide la
propia base de datos, aunque alguien intente el cambio directo en ella.

### Permiso denegado, aislamiento entre empresas y auditoría

- **Permiso denegado:** el Contador y el portal no ven proyectos; Comercial los lee pero no crea,
  no inicia, no arma el equipo ni crea tareas; el Equipo de proyecto no crea proyectos.
- **Aislamiento:** un Líder técnico de otra empresa no ve, no pausa, no mueve tarjetas ni agrega
  hitos a los proyectos de esta, y no puede crear un proyecto con el contrato ni el cliente de otra.
- **Auditoría:** cada paso deja su registro y su evento en la misma operación; la prueba general
  de auditoría recorre las **23 rutas nuevas** y todas dejan rastro.

### Resultado de las verificaciones

| Paso                    | Resultado                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| Formato                 | Sin problemas en los archivos del proyecto (nota 1)                                                       |
| Estilo y tipos          | Sin problemas                                                                                             |
| Fronteras entre módulos | Sin problemas: Proyectos usa Contratos, Terceros, Identidad, Flujos y Núcleo solo por sus índices         |
| Código sin usar (knip)  | Sin problemas, después de corregir 13 piezas que yo había exportado sin necesidad                         |
| Pruebas unitarias       | Las de Proyectos pasan (reglas, esquemas y 15 de pantallas). API: todas salvo la de arranque (nota 2)     |
| Pruebas de integración  | **Las 23 de Proyectos pasan** y las 23 rutas nuevas del recorrido de auditoría (nota 3)                   |
| Pruebas en navegador    | **44 de 44**: Proyectos (accesibilidad claro y oscuro, arrastrar y soltar, teclado), accesibilidad y menú |
| Migraciones             | Desde cero en la prueba de integración y sobre la base local de la versión anterior (B25)                 |

1. **Formato:** solo falla la carpeta local de herramientas `.agents/`, que no es del proyecto
   (igual que en los bloques anteriores).
2. **Prueba de arranque de la API:** falla por lentitud de este equipo, como en el B24 y el B25. No
   es de este bloque y no la toqué.
3. **Integración completa:** en este equipo (7,4 GB de memoria, 1 GB libre) la corrida con todo a
   la vez da fallas de tiempo («la base no alcanza a abrir una transacción») en pruebas que cambian
   de una corrida a otra. Las de Proyectos, corridas por archivo, pasan todas. **La integración
   continua de GitHub debe confirmarlo** con el pull request.

**Errores reales que encontraron las pruebas y corregí:** las primeras versiones de tres pruebas
estaban mal planteadas (Comercial sí puede liderar un proyecto; faltaba cargar las plantillas de
avisos; la prueba de «dos personas mueven la misma tarjeta» pedía un paso inválido). No había fallas
en el código del módulo.

**Ajustes a pruebas existentes, sin debilitarlas:** la del módulo «en construcción» y la de
accesibilidad ahora usan Servicio (B28), porque Proyectos ya está construido; la lista de rutas del
OpenAPI incluye las 23 nuevas. El arrastrar y soltar del embudo del CRM pasó a una pieza común que
usan los dos tableros; sus pruebas siguen pasando.

## Cómo lo prueba usted, paso a paso

Use solo datos de prueba. Necesita a **Ana** (Comercial), a **Laura Díaz** (Dirección,
`direccion@demo-uno.test`) y dos personas nuevas: un **Líder técnico** y alguien del **Equipo de
proyecto**.

### 1. Cargar lo nuevo

En una terminal, en la carpeta del proyecto, una por una:

```bash
git switch feat/b26-proyectos-estructura-y-tablero
```

```bash
pnpm infra:up
```

```bash
pnpm install
```

```bash
pnpm db:migrate
```

```bash
pnpm db:seed:demo
```

La cuarta crea las tablas nuevas; la quinta carga la tarea «Autorizar el inicio del proyecto». Si
alguna falla con «Can't reach database server», espere un minuto y repítala. Luego `pnpm dev`.

> Si `pnpm db:migrate` dice que una migración «fue modificada», es porque en este equipo apliqué una
> versión anterior mientras construía. Escriba `pnpm infra:reset`, luego `pnpm db:migrate` y
> `pnpm db:seed:demo` (borra los datos de prueba locales, no los reales).

### 2. Crear al Líder técnico y a la persona del equipo (una sola vez)

```bash
pnpm iam:invitar --empresa demo-uno --correo lider@demo-uno.test --nombre "Lucía Líder"
```

```bash
pnpm iam:asignar-rol --correo lider@demo-uno.test --rol LIDER_TECNICO
```

```bash
pnpm iam:invitar --empresa demo-uno --correo equipo@demo-uno.test --nombre "Esteban Equipo"
```

```bash
pnpm iam:asignar-rol --correo equipo@demo-uno.test --rol EQUIPO_PROYECTO
```

Active las dos cuentas con el enlace que llega al buzón de prueba Mailpit
(http://localhost:8026).

### 3. Crear un proyecto desde un contrato vigente

1. Tenga un contrato **vigente** (pasos del cierre del B24 o del B25).
2. Entre como **Lucía** → **Proyectos**. Arriba aparece **«Contratos vigentes sin proyecto»** con su
   contrato. Pulse **«Crear el proyecto»**.
3. Verá el nombre, las fechas y el valor ya llenos. Escriba el presupuesto de horas (por ejemplo
   `320,5`), elija a Lucía como líder y pulse **«Crear el proyecto»**.
4. En la ficha pulse **«Iniciar el proyecto»**. Queda «En ejecución».

### 4. Armar el equipo, los hitos y la lista de pendientes

1. Pestaña **Equipo** → «Agregar al equipo» → Esteban, Desarrollo, 50 %. (Esteban recibe un aviso.)
2. Pestaña **Hitos** → agregue «Anticipo» 30 % y «Entrega» 70 %. Intente un tercero con 10 %: le
   dirá que se pasa del 100 %.
3. Pestaña **Pendientes** → «Nuevo ítem»: una épica «Facturación»; una historia «Consultar
   facturas» que pertenezca a la épica, **con** criterios de aceptación; y otra historia **sin**
   criterios. La lista marca la segunda en amarillo.

### 5. Iteración y tablero

1. Pestaña **Iteraciones** → «Planear una iteración» (fechas dentro del proyecto) → «Iniciar».
2. En **Pendientes**, lleve «Consultar facturas» a la iteración. Intente lo mismo con la historia
   sin criterios: no lo permite.
3. Pestaña **Tablero**: arrastre la tarjeta de «Pendiente» a «En curso». Pruebe también con el
   teclado: Tab hasta «Mover a», Enter, flechas y Enter. Fíjese que solo ofrece la columna siguiente
   o las anteriores.
4. Llévela hasta «En pruebas» y luego a «Terminado»: le pide el enlace a la revisión de código
   (por ejemplo `https://git.example.com/pull/1`) y las pruebas hechas.
5. **Tiempo real:** abra la misma ficha con Esteban en otra ventana (o navegador privado), mueva una
   tarjeta con él y mire la ventana de Lucía: en menos de 10 segundos cambia sola.

### 6. Un miembro solo ve sus proyectos

1. Con Lucía, cree un segundo proyecto sin agregar a Esteban.
2. Entre como **Esteban** → Proyectos: ve solo el primero.
3. Con Lucía, en **Equipo**, retire a Esteban. Esteban recarga la página: ya no ve el proyecto.

### 7. Sin contrato: la autorización de la Dirección

1. Con Lucía, «Nuevo proyecto» → «Sin contrato vigente», busque un cliente y créelo.
2. Pulse **«Pedir autorización a la Dirección»** con un motivo.
3. Entre como **Laura Díaz** → **Mis tareas** → «Autorizar el inicio del proyecto…» → autorice.
4. Vuelva con Lucía: el proyecto está «En ejecución» y le llegó un aviso.

## Pendientes

- **B27:** horas, entregables, actas de entrega con firma, riesgos, liberaciones, revisiones de
  código con la lista FT-TEC-002 (reemplaza el enlace y la nota de pruebas de hoy) e indicadores de
  avance y rentabilidad; también los estados «en cierre» y «cerrado».
- **Portal del cliente (M09):** el evento «proyecto creado» ya queda listo para mostrarlo allá.
- **Tareas de arranque automáticas** al crear el proyecto (numeral 13.3): hoy solo el aviso al
  líder.
- **Actualización instantánea** del tablero (sin esperar los 10 segundos): requiere una conexión
  permanente con el servidor; queda para cuando haga falta.
- **Prueba de arranque de la API** lenta en este equipo (viene del B24).
- **Pull requests #35, #37, #38 y #40:** esta rama sale de ellos. Conviene aprobarlos primero.

## Decisiones tomadas

Las catorce que usted aprobó el 31/10/2026:

1. **Punto de partida:** la rama del B26 sale de la del B25.
2. **Códigos:** proyectos `PRY-AAAA-NNNN`; ítems numerados dentro del proyecto
   (`PRY-2026-0001-12`, «#12»).
3. **Sin contrato vigente** se planea, pero se inicia solo con la autorización de la Dirección
   (tarea en Mis tareas, con motivo).
4. **Solo el Líder técnico crea proyectos** (tabla de permisos 15.3). Dirección, Calidad, Comercial,
   Servicio y Finanzas leen todos; el Equipo de proyecto, solo los suyos.
5. **Criterios de aceptación** obligatorios para que historias, tareas y defectos entren a una
   iteración; las épicas nunca entran.
6. **Terminar** pide el enlace a la revisión de código y la nota de pruebas (hasta el B27).
7. **Tiempo real:** el tablero se refresca cada 10 segundos, y una versión vieja no pisa el cambio
   de otro.
8. **Estados** de este bloque: planeación, ejecución, en riesgo y pausado (con motivo). Cierre: B27.
9. **Hitos** con porcentaje de facturación; entre todos, máximo 100 %.
10. **Iteraciones:** una en curso, dentro de las fechas del proyecto; al cerrar, lo pendiente vuelve.
11. **Avisos:** el contrato firmado le dice al responsable que ya puede crearse el proyecto; la lista
    «Contratos vigentes sin proyecto»; aviso al líder y a quien entra al equipo.
12. **Roles del equipo:** líder, análisis, desarrollo, diseño y pruebas; dedicación de 1 a 100 %.
13. **Presupuesto:** en pesos toma el valor del contrato (editable); las horas las escribe el líder.
14. **Fuera de este bloque:** horas, entregables, actas, riesgos, liberaciones, revisiones e
    incidentes (B27) y el portal (M09).

Y otras, menores, que tomé al construir:

- **La Dirección autoriza con el permiso con que aprueba contratos** (`contract.approve`): el
  catálogo no tiene uno para proyectos y un inicio sin contrato es una decisión contractual.
- **Quién puede estar en un equipo:** colaboradores activos con rol de Líder técnico, Equipo de
  proyecto, Dirección, Calidad, Comercial o Servicio (los que ven proyectos).
- **El líder es único:** si se cambia, el anterior sigue en el equipo con el rol Desarrollo; el
  líder no se puede retirar sin antes nombrar otro.
- **Un contrato, un proyecto.** Los acuerdos de confidencialidad no generan proyectos.
- **El tablero sin iteración en curso** muestra los ítems fuera de iteraciones, con los terminados
  de las últimas dos semanas (sirve para la metodología de flujo continuo).
