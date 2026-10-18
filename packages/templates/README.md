# @arza/templates

Plantillas de correo y de documentos PDF.

- **Correo de los avisos (B16):** `noticeEmail`, con el marco institucional en texto y HTML.
- **Documentos PDF (B20):**
  - `institutionalHeader` e `institutionalFooter`: el encabezado del SGC (logo, nombre, código,
    versión, fecha y página) y el pie (razón social, NIT, registro y «Copia no controlada cuando se
    imprime»). Gotenberg los repite en cada página.
  - `formDocumentBody` y `printPage`: la maqueta de un formato diligenciado, sección por sección.
  - `renderHtmlTemplate` y `htmlTemplateVariables`: plantillas de salida HTML con Handlebars
    (variables `{{nombre}}`, bloques `{{#each lista}}`). Todo valor se escapa y solo se permiten
    las ayudas propias de Handlebars.
  - `fillDocxTemplate` y `docxTemplateVariables`: plantillas de salida en Word con docxtemplater
    (variables `{nombre}`, bloques `{#lista}…{/lista}`, rutas con punto como `{registro.codigo}`).
  - `templateContext`: las variables que recibe una plantilla (cada campo por su nombre interno y
    `formato`, `registro` y `empresa`). La guía completa está en `docs/manual/datos/doc.md`.
  - `controlledCopyStamp`: el texto del pie de la copia de consulta de un documento vigente.

Bibliotecas (capítulo 9 del manual): Handlebars (MIT), docxtemplater (MIT) y pizzip (MIT o
GPL-3.0; se usa con la licencia MIT).
