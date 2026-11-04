# Builds the web app and the server bundle, then ships only dist/ (no node_modules).
#   docker build -t purelymail-manager .
ARG NODE_IMAGE=node:24-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM ${NODE_IMAGE}
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    # A small heap keeps the container well under 256 MB.
    NODE_OPTIONS="--max-old-space-size=160 --disable-warning=ExperimentalWarning"
WORKDIR /app
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/server.js"]
