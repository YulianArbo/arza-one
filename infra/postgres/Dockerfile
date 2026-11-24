# PostgreSQL de producción con pgBackRest (B44, numeral 10.5). Es la misma imagen oficial que usan
# pruebas y el entorno local, fijada a su huella, más pgBackRest (licencia MIT) desde el
# repositorio oficial de PostgreSQL que la imagen ya trae configurado. pgBackRest corre dentro del
# contenedor porque PostgreSQL le entrega cada archivo de cambios (WAL) al terminarlo.
# Se construye con: bash infra/scripts/ci/build-image.sh postgres <etiqueta>
FROM postgres:17@sha256:ae69c452f483507a6b99fb654cf93aad7fe156ffd2c56247707eef4e36d3c12b

# /var/lib/pgbackrest/ensayo: copias del ensayo de GitHub (BACKUP_REPO_TYPE=posix); en el
# servidor real las copias van al depósito externo y esta carpeta queda vacía.
RUN apt-get update \
  && apt-get install --yes --no-install-recommends pgbackrest \
  && rm -rf /var/lib/apt/lists/* \
  && install --directory --owner=postgres --group=postgres --mode=0750 \
    /var/lib/pgbackrest /var/lib/pgbackrest/ensayo /var/log/pgbackrest \
    /var/spool/pgbackrest /tmp/pgbackrest \
  && rm -f /etc/pgbackrest.conf /etc/pgbackrest/pgbackrest.conf

# La configuración llega toda por variables PGBACKREST_* (infra/compose/production.yml): ningún
# secreto queda escrito en la imagen. El contenedor arranca como la imagen oficial (su punto de
# entrada pasa al usuario postgres); las órdenes de pgBackRest se ejecutan con --user postgres.
