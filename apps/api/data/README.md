# Datos de la API

## `leaked-passwords.txt.gz`

Lista de contraseñas filtradas que la API rechaza al crear o cambiar una contraseña (numeral 15.1
del Manual MN-TEC-002, bloque B08). Funciona sin conexión a internet: el servidor de pruebas no
tiene salida (B07).

- **Origen:** proyecto [SecLists](https://github.com/danielmiessler/SecLists), carpeta
  `Passwords/Common-Credentials`, archivos `Pwdb_top-1000000.txt`,
  `xato-net-10-million-passwords-1000000.txt` y `100k-most-used-passwords-NCSC.txt`, descargados el
  08/10/2026.
- **Licencia:** MIT, Copyright (c) 2018 Daniel Miessler.
- **Preparación:** se unieron los tres archivos, se quitaron las líneas con caracteres fuera de
  ASCII, se pasaron a minúsculas, se dejaron solo las de 12 a 128 caracteres (las más cortas ya
  las rechaza la regla de longitud) y se quitaron los duplicados: 72 957 contraseñas. Se guarda
  comprimido con gzip.

Para actualizarla, repita la preparación con una versión nueva de SecLists y reemplace el archivo.
La prueba `src/modules/iam/infrastructure/infrastructure.test.ts` comprueba que siga funcionando.
