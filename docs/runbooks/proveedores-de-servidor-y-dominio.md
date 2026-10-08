# Proveedores de servidor y de dominio

Guía para escoger y contratar el servidor de pruebas y el dominio (bloque B07, numerales 10.1, 10.2
y 10.4). Es una lista de opciones conocidas, no una recomendación comercial: **los precios y las
condiciones cambian**; los valores de aquí son aproximados y el precio real es el que muestra la
página oficial el día de la compra. Antes de pagar, revise la lista de verificación del final.

## Qué servidor necesita el ambiente de pruebas

| Aspecto           | Mínimo                                                    | Recomendado         |
| ----------------- | --------------------------------------------------------- | ------------------- |
| Núcleos           | 2                                                         | 4                   |
| Memoria           | **8 GB** (la plataforma usa unos 6 GB)                    | 8 GB                |
| Disco             | 80 GB SSD                                                 | 160 GB SSD          |
| Sistema operativo | Ubuntu Server 24.04 LTS                                   | Ubuntu Server 24.04 |
| Dirección pública | Una dirección IPv4 fija                                   | IPv4 fija           |
| Acceso            | Por llave SSH (el proveedor la pide al crear el servidor) | Igual               |

Corrección frente al plan: allí se mencionaron 4 GB. Al sumar los límites de memoria de cada
servicio (numeral 10.3) el total pasa de 6 GB, así que el mínimo real es **8 GB**.

Producción (numeral 10.2) exige además un centro de datos con certificación **ISO/IEC 27001** y
acuerdo de tratamiento de datos. Para pruebas no es obligatorio (los datos son ficticios), pero
conviene escoger desde ya un proveedor que lo cumpla para usar el mismo en producción.

## Servidores

| Proveedor                  | Página oficial                                                      | Costo aproximado (2 a 4 núcleos, 8 GB) | Observaciones                                                                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Oracle Cloud (Always Free) | https://www.oracle.com/cloud/free/                                  | **Gratis** (hasta 4 núcleos y 24 GB)   | Pide tarjeta para verificar identidad. A veces dice «sin capacidad». Procesadores ARM: hay que activar las imágenes ARM (ver abajo). Tiene región en Bogotá: verifíquelo al crear la cuenta, porque la región escogida no se puede cambiar |
| Hetzner                    | https://www.hetzner.com/cloud                                       | Desde unos 8 a 15 euros al mes         | Muy económico. Centros de datos en Europa y Estados Unidos con ISO/IEC 27001. Pide documento de identidad al registrarse                                                                                                                   |
| DigitalOcean               | https://www.digitalocean.com/pricing/droplets                       | Unos 48 a 60 dólares al mes            | Muy sencillo de usar; buena documentación en inglés. ISO/IEC 27001                                                                                                                                                                         |
| Vultr                      | https://www.vultr.com/pricing/                                      | Unos 40 a 50 dólares al mes            | Centros de datos en varias ciudades de América Latina; revise si hay uno en Colombia (evita la transmisión internacional de datos) y su certificación                                                                                      |
| Akamai (antes Linode)      | https://www.linode.com/pricing/                                     | Unos 40 a 50 dólares al mes            | ISO/IEC 27001                                                                                                                                                                                                                              |
| Amazon Lightsail (AWS)     | https://aws.amazon.com/lightsail/pricing/                           | Unos 40 dólares al mes                 | Parte de Amazon Web Services. ISO/IEC 27001. Región más cercana: São Paulo                                                                                                                                                                 |
| Google Cloud               | https://cloud.google.com/compute/vm-instance-pricing                | Variable; suele salir más caro         | Su plan gratuito (1 GB de memoria) no alcanza                                                                                                                                                                                              |
| Microsoft Azure            | https://azure.microsoft.com/pricing/details/virtual-machines/linux/ | Variable; suele salir más caro         | Su plan gratuito (1 GB de memoria) no alcanza                                                                                                                                                                                              |

**Si escoge Oracle (ARM):** las imágenes se construyen hoy para procesadores comunes (x86). Antes
del primer despliegue, en GitHub cambie la variable `STAGING_PLATFORM` a `linux/arm64` (lo explica
[servidor-de-pruebas.md](servidor-de-pruebas.md)). No requiere cambiar código.

## Dominios

Un dominio propio sirve para pruebas y luego para producción, el correo y el sitio (numeral 10.4).

| Opción                      | Página oficial                                 | Costo aproximado por año                                   | Observaciones                                                                                          |
| --------------------------- | ---------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| DuckDNS (subdominio gratis) | https://www.duckdns.org                        | **Gratis**                                                 | Dirección del tipo `arza-pruebas.duckdns.org`. Solo para pruebas; no sirve para producción ni correo   |
| sslip.io (sin registro)     | https://sslip.io                               | **Gratis**                                                 | Dirección con los números del servidor, por ejemplo `pruebas.203-0-113-10.sslip.io`. Solo para pruebas |
| Cloudflare Registrar        | https://www.cloudflare.com/products/registrar/ | `.com` unos 10 dólares; `.co` unos 25 a 30                 | Cobra el precio de costo, sin recargos en la renovación. Incluye la administración de registros (DNS)  |
| Porkbun                     | https://porkbun.com                            | `.com` unos 10 a 12 dólares; `.co` unos 25 a 30            | Precios bajos y transparentes                                                                          |
| Namecheap                   | https://www.namecheap.com                      | `.com` unos 10 a 15 dólares; `.co` unos 25 a 35            | Muy conocido. Revise el precio de renovación, que suele ser mayor que el del primer año                |
| GoDaddy                     | https://www.godaddy.com/es                     | `.com` unos 15 a 25 dólares; `.co` y `.com.co` disponibles | Atención en español. La renovación suele ser bastante más cara que el primer año                       |
| Dominio `.co` (información) | https://www.go.co                              | Depende del registrador                                    | Página oficial del dominio de Colombia: lista los registradores autorizados                            |

**Consejo:** el precio del primer año suele ser una promoción. Compare siempre el **precio de
renovación**, que es el que pagará los años siguientes, y active la **renovación automática** y la
**protección de privacidad** (oculta sus datos personales en el registro público del dominio).

## Lista de verificación antes de pagar

- [ ] El servidor tiene al menos 8 GB de memoria y Ubuntu Server 24.04 LTS.
- [ ] El precio mensual y el de renovación del dominio están claros (no solo el del primer año).
- [ ] La cuenta del proveedor tiene **segundo factor** activado (numeral 10.2).
- [ ] Para producción, más adelante: certificación ISO/IEC 27001 del centro de datos, acuerdo de
      tratamiento de datos y, si está fuera de Colombia, contrato de transmisión internacional
      (Decreto 1074 de 2015, numeral 10.2).
- [ ] La factura queda a nombre de ARZA TECH S.A.S.

Cuando tenga el servidor y la dirección, siga [servidor-de-pruebas.md](servidor-de-pruebas.md).
