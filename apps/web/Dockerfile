# Imagen de la web (numerales 8.2 y 10.3). Se construye desde la raíz del repositorio:
#   docker build -f apps/web/Dockerfile -t arza-one/web .
# La imagen base va fijada por su huella; Renovate propone las actualizaciones.
ARG NODE_IMAGE=node:24-alpine@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5

FROM ${NODE_IMAGE} AS build
WORKDIR /repo
RUN npm install --global pnpm@12.9.1
COPY . .
# Sin scripts de instalación: los ganchos de git no aplican en la imagen.
RUN pnpm install --frozen-lockfile --ignore-scripts
# Salida autónoma de Next.js: el servidor y solo las dependencias que usa.
RUN NEXT_OUTPUT=standalone pnpm turbo run build --filter=@arza/web

FROM ${NODE_IMAGE} AS runtime
# La imagen final no lleva gestores de paquetes: no se usan y suman vulnerabilidades.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
  /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  PORT=3000 \
  HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
# Usuario sin privilegios (numeral 10.3).
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT ?? '3000') + '/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/web/server.js"]
