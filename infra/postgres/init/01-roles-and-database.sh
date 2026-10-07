#!/usr/bin/env bash
# Prepara la base de datos de ARZA ONE (capítulo 12.1, ADR-006 y ADR-007).
# PostgreSQL lo ejecuta una sola vez, como superusuario, al crear el volumen de datos
# (carpeta /docker-entrypoint-initdb.d). Lo usan Testcontainers (B03) y Docker Compose (B06, B07).
#
# - migration_user: dueño del esquema; aplica las migraciones. No es superusuario.
# - app_user: el usuario de la API. No es dueño de nada, no salta la seguridad por fila y solo
#   recibe en cada migración los permisos que esa migración le concede.
#
# Las contraseñas llegan por variables de entorno; nunca se escriben en el repositorio.
set -euo pipefail

: "${APP_DB_PASSWORD:?Falta APP_DB_PASSWORD}"
: "${MIGRATION_DB_PASSWORD:?Falta MIGRATION_DB_PASSWORD}"

psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  --set=app_password="$APP_DB_PASSWORD" \
  --set=migration_password="$MIGRATION_DB_PASSWORD" <<'SQL'
CREATE ROLE migration_user LOGIN PASSWORD :'migration_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE app_user LOGIN PASSWORD :'app_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;

-- UTF-8, orden alfabético del español de Colombia y zona horaria UTC (capítulo 12.1).
CREATE DATABASE arza_one OWNER migration_user TEMPLATE template0 ENCODING 'UTF8'
  LOCALE_PROVIDER icu ICU_LOCALE 'es-CO' LOCALE 'C.UTF-8';
ALTER DATABASE arza_one SET timezone TO 'UTC';
REVOKE ALL ON DATABASE arza_one FROM PUBLIC;
GRANT CONNECT ON DATABASE arza_one TO app_user;

\connect arza_one
ALTER SCHEMA public OWNER TO migration_user;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_user;
SQL
