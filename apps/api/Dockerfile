# Imagen de la API (numerales 8.2 y 10.3). Se construye desde la raíz del repositorio:
#   docker build -f apps/api/Dockerfile -t arza-one/api .
# La imagen base va fijada por su huella; Renovate propone las actualizaciones.
ARG NODE_IMAGE=node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1

FROM ${NODE_IMAGE} AS build
WORKDIR /repo
RUN npm install --global pnpm@12.9.1
COPY . .
# Sin scripts de instalación: los ganchos de git no aplican y Prisma se genera al compilar.
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm turbo run build --filter=@arza/api
# Solo las dependencias de producción. Los scripts de instalación no corren: el cliente de
# Prisma ya quedó compilado dentro de dist.
RUN pnpm --filter @arza/api deploy --prod --ignore-scripts /out \
  && cp -r apps/api/dist /out/dist

FROM ${NODE_IMAGE} AS runtime
# La imagen final no lleva gestores de paquetes: no se usan y suman vulnerabilidades.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
  /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
# Usuario sin privilegios (numeral 10.3).
USER node
EXPOSE 4000
# /version no depende de la base de datos: dice si el proceso está vivo. /health dice si está listo.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.API_PORT ?? '4000') + '/version').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/main.js"]
