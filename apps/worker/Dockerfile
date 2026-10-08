# Imagen del worker (numerales 8.2 y 10.3; pendiente de B05). Se construye desde la raíz:
#   docker build -f apps/worker/Dockerfile -t arza-one/worker .
# La imagen base va fijada por su huella; Renovate propone las actualizaciones.
ARG NODE_IMAGE=node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1

FROM ${NODE_IMAGE} AS build
WORKDIR /repo
RUN npm install --global pnpm@12.9.1
COPY . .
# Sin scripts de instalación: los ganchos de git no aplican y Prisma se genera al compilar.
RUN pnpm install --frozen-lockfile --ignore-scripts
# Compila el worker y lo que reutiliza de la API (ADR-004).
RUN pnpm turbo run build --filter=@arza/worker
# Solo las dependencias de producción, con la API compilada como dependencia del worker.
RUN pnpm --filter @arza/worker deploy --prod --ignore-scripts /out \
  && cp -r apps/worker/dist /out/dist

FROM ${NODE_IMAGE} AS runtime
# La imagen final no lleva gestores de paquetes: no se usan y suman vulnerabilidades.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
  /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
# Usuario sin privilegios (numeral 10.3).
USER node
# Latido en la cola (numeral 10.3): sano si el worker de este contenedor latió hace menos de 45 s.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "dist/healthcheck.js"]
CMD ["node", "dist/main.js"]
