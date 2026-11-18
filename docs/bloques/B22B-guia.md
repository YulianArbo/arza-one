# B22B — Guía de implementación visual y plan aprobado

Complementa `docs/bloques/B22B.md`. La primera parte es la guía que entregó el dueño del producto
con los bocetos. La segunda es el plan que aprobó el 18/11/2026.

Bocetos: `docs/bloques/B22B-bocetos/`, con 31 archivos PNG numerados por pantalla. Las capturas
de escritorio miden 1440 px de ancho y las de celular 390 px (27 a 31). Algunas imágenes son más
altas porque muestran la página completa. Estos bocetos reemplazan a los seis de OpenCode del
15/11/2026, que quedan solo como referencia.

## Parte 1. Guía del dueño del producto

Use los bocetos como referencia de jerarquía, distribución y apariencia. Antes de implementar, lea
`docs/bloques/B22B.md`, el cierre de B22A, el capítulo 16 del Manual Maestro y los componentes
existentes de `@arza/ui`.

### Identidad visual

| Elemento                 | Cómo se construyó y cómo conservarlo                                                                                                                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tipografía               | Montserrat en pesos 400, 500 y 600: 400 para texto, 500 para navegación y controles, 600 para títulos y énfasis. Mantenga las cifras tabulares donde ya se usan para importes e indicadores.                                                              |
| Títulos internos         | Comercial, Finanzas y otros encabezados internos usan `clamp(29px, 3.4vw, 46px)` y alcanzan 46 px a 1440 px de ancho. Mantenga esa jerarquía también al pasar de un módulo a un submódulo.                                                                |
| Portada y acceso         | La portada pública tiene un título de 33 a 63 px. El título de ingreso va de 29 a 43 px. Los encabezados de sección de la vitrina van de 23 a 32 px.                                                                                                      |
| Texto y navegación       | En la maqueta, el texto base ronda los 13 px y el menú lateral usa 12 px. Son referencias de densidad del boceto. Ajústelos con la escala de `@arza/ui` y compruebe la legibilidad y las áreas táctiles (ver decisión 3).                                 |
| Paleta                   | Azul de acción `#005AFE`, azul marino `#0D1B2A` y acento en oscuro `#7FB2FF`. El fondo general pasa de `#F7F8FA` en claro a `#08090A` en oscuro. Use los tokens semánticos del proyecto.                                                                  |
| Superficies y movimiento | Tarjetas con borde fino y esquinas redondeadas. Los botones reaccionan al pasar el cursor y al presionarlos, con transiciones cercanas a 200 ms. Use las utilidades de B22A y respete «reducir movimiento». Sin degradados, cristal ni sombras en reposo. |

### Cómo interpretar los bocetos

- **01–02 y 27–28 · Vitrina pública.** Conserve la portada, los cinco servicios, la presentación de
  ARZA ONE, proyectos, noticias, cotización, verificación documental, PQRSF y contacto. Respete el
  orden y los textos del sitio actual. El botón del encabezado dice «Iniciar sesión».
- **03–04 y 31 · Acceso.** En escritorio, el formulario va centrado en la mitad derecha, con las
  opciones «Ingreso plataforma» y «Portal de clientes». En celular, el formulario tiene prioridad.
  La foto y el mensaje motivacional se omitieron de esta entrega (ver decisiones 1 y 2).
- **05–23 · Plataforma interna.** Barra lateral, íconos delante de los nombres y sangría de unos
  20 px para los submódulos. Cada acción lleva un ícono según su función y su etiqueta. El enlace
  «Volver a [módulo]» va arriba, junto a la ruta de navegación. Se conservan la búsqueda global,
  los avisos, la ayuda, la cuenta y el selector de apariencia.
- **24–26 y 29–30 · Portal de clientes.** Prioridad al avance del proyecto, a lo que está por
  aprobar y al acceso a soporte. Las capturas de celular sirven para revisar el orden del
  contenido, el ajuste de la navegación y la visibilidad de la acción principal.

### Cómo llevarlo al código

1. **Parta de lo existente.** Reutilice rutas, permisos, contratos y componentes de `@arza/ui`. Los
   datos, nombres y cifras de los bocetos son ejemplos visuales. Antes de conectar indicadores o
   resúmenes, valide qué datos entrega ya cada módulo.
2. **Conserve el flujo propio de cada módulo.** Comercial usa un embudo de oportunidades. Compras se
   organiza por etapas, de la solicitud a la recepción. Proyectos prioriza avance y entregables.
   Servicio muestra bandejas por tipo de atención. Finanzas destaca la ejecución presupuestal.
   Talento y SST organiza selección, vinculación e inducción. Documentos conserva el explorador por
   carpetas. Cree un submódulo solo si corresponde al alcance aprobado y al flujo real.
3. **Verifique cada pantalla en contexto.** Escritorio a 1440 px y celular a 390 px; temas claro,
   oscuro y según el sistema; navegación por teclado, foco visible y sin desborde horizontal. Las
   gráficas mantienen su tabla de datos y las pantallas, los estados que exige el manual.
4. **Documente las diferencias antes de implementar.** Si un detalle visual necesita una ruta, un
   dato o una regla que el producto aún no tiene, regístrelo para que decida el dueño.

## Parte 2. Plan aprobado (18/11/2026)

### Etapas

| Etapa | Entrega                                                                                                                                          | Bocetos          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| F0    | Escala tipográfica, espaciados y fondos `#F7F8FA` / `#08090A` en `@arza/ui`                                                                      | —                |
| F1    | Barra lateral azul marino con íconos y submódulos con sangría; ruta con «Volver a [módulo]»; barra superior con búsqueda, avisos, ayuda y cuenta | 05–23            |
| F2    | Inicio «Su jornada» y pantallas de entrada de cada módulo                                                                                        | 05–13, 23        |
| F3    | Listas y fichas de detalle                                                                                                                       | 08, 14–21        |
| F4    | Formularios, acciones con ícono y estados de pantalla                                                                                            | todos            |
| F5    | Portal de clientes en escritorio y celular                                                                                                       | 24–26, 29–30     |
| F6    | Vitrina (misma estructura y contenido actuales, con pie de redes sociales) y acceso con imagen y mensaje aleatorios                              | 01–04, 27–28, 31 |
| F7    | Verificación, cierre y lineamientos para B36 en adelante                                                                                         | —                |

**Inicio:** después del cierre de B35, como dice `B22B.md`.

### Decisiones del dueño

1. **Imagen aleatoria en el acceso.** Va en la mitad izquierda de las pantallas de acceso (bocetos
   03, 04 y 31): un banco de 24 a 30 fotos de tecnología con licencia libre de uso comercial,
   guardadas en el proyecto y optimizadas. En cada visita se muestra una al azar. No se cargan
   desde servicios externos: la política de contenido solo permite imágenes propias
   (`img-src 'self' data: blob:`) y un servicio externo vería la dirección de cada visitante. La
   licencia de cada foto queda registrada. El dueño aprueba la selección antes de incorporarla. La
   imagen es decorativa (`alt=""`) y no puede retrasar la primera pantalla útil (manual 16.6).
2. **Mensaje del día aleatorio, sin inteligencia artificial.** Un banco de fragmentos escritos y
   revisados en español de Colombia, con trato de usted. Unos 40 inicios por 40 cierres dan más de
   1.500 combinaciones, y en cada visita se elige una al azar. Como en el acceso aún no se sabe
   quién es la persona, el mensaje distinto por usuario va en Inicio (idea 2).
3. **Tamaños de texto.** El texto base de la plataforma queda en 14 px, como exige el manual 16.2,
   y el menú lateral en 13 px. Los 13 y 12 px del boceto son solo referencia de densidad.
4. **Un solo azul de acción por pantalla.** En Compras (boceto 07), la etapa resaltada usa azul
   marino o un borde, no el azul de acción, que queda para «Nueva solicitud».
5. **Redes sociales en el pie de la vitrina.** Se conservan las del código actual (Facebook,
   Instagram, X, LinkedIn, WhatsApp, YouTube y TikTok), aunque el boceto no las muestre. Se activan
   cuando el dueño entregue sus direcciones.
6. **Ideas de innovación incluidas:**
   1. Saludo según la hora en Colombia en Inicio («Buenos días, [nombre]»).
   2. Mensaje personal del día en Inicio, distinto para cada usuario y cada día.
   3. «Continuar trabajando» automático, con los últimos módulos abiertos por cada persona.

   Quedan para el final del bloque, si alcanza el tiempo y previa confirmación: la búsqueda Ctrl K
   con acciones, el modo compacto o cómodo, los atajos de teclado con ayuda en «?» y el botón
   «Volver arriba» de la vitrina.

### Diferencias con los bocetos ya resueltas

- La frase «Use los datos ficticios de ejemplo para recorrer la maqueta» (boceto 03) es solo de la
  maqueta: no va en el producto.
- Los módulos de «Bloques posteriores» del menú dicen «Disponible pronto» y no simulan funcionar.
- En Comercial (boceto 06) se conserva arrastrar tarjetas entre etapas, además del selector
  «Mover a», que es la alternativa por teclado del manual 16.4.
- «Continuar trabajando» y los conteos por etapa se conectan solo con datos que ya entrega cada
  módulo. Si falta un dato, se informa al dueño antes de construirlo.
- La página de firma electrónica queda fuera del rediseño.
