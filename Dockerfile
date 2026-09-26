FROM node:24.14.1-bookworm-slim@sha256:b506e7321f176aae77317f99d67a24b272c1f09f1d10f1761f2773447d8da26c AS billiards-build

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /source
RUN git clone --filter=blob:none https://github.com/axfsz/billiards.git . \
  && git checkout ec9a66ac67b3576c74b56aff75fde68895ccdca9 \
  && test "$(git rev-parse HEAD)" = ec9a66ac67b3576c74b56aff75fde68895ccdca9
RUN npm ci --omit=dev --ignore-scripts
COPY scripts/prepare-billiards.js /prepare-billiards.js
RUN node /prepare-billiards.js /source /out \
  && cp -R node_modules /out/node_modules

FROM node:24.14.1-bookworm-slim@sha256:b506e7321f176aae77317f99d67a24b272c1f09f1d10f1761f2773447d8da26c AS starliner-build

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /source
RUN git clone --filter=blob:none https://github.com/syedawais10/starliner-game.git . \
  && git checkout 367f2f33cfff88f6cab6bbd4b6712e2c25aa02cb \
  && test "$(git rev-parse HEAD)" = 367f2f33cfff88f6cab6bbd4b6712e2c25aa02cb
COPY scripts/prepare-starliner.js /prepare-starliner.js
COPY deploy/starliner-rules.mjs /deploy/starliner-rules.mjs
RUN node /prepare-starliner.js /source /out

FROM node:24.14.1-bookworm-slim@sha256:b506e7321f176aae77317f99d67a24b272c1f09f1d10f1761f2773447d8da26c AS onenight-build

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /source
RUN git clone --filter=blob:none https://github.com/hangyu-feng/onenight-werewolf.git . \
  && git checkout 6a60bc96a72c6f93cb10938f970011f733a72df8 \
  && test "$(git rev-parse HEAD)" = 6a60bc96a72c6f93cb10938f970011f733a72df8
COPY scripts/prepare-onenight.js /prepare-onenight.js
RUN node /prepare-onenight.js /source /prepared
WORKDIR /prepared
RUN npm ci --ignore-scripts \
  && npm run typecheck \
  && npm run build \
  && mkdir -p /out/server /out/frontend \
  && cp -R server/dist /out/server/dist \
  && cp -R frontend/out /out/frontend/out

FROM node:24.14.1-bookworm-slim@sha256:b506e7321f176aae77317f99d67a24b272c1f09f1d10f1761f2773447d8da26c AS mamahjong-source

RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /source
RUN git clone --filter=blob:none https://github.com/yemaster/mamahjong.git . \
  && git checkout c903603cfefc5786126173b33468e7df001280de \
  && test "$(git rev-parse HEAD)" = c903603cfefc5786126173b33468e7df001280de
RUN git clone --filter=blob:none https://github.com/lietxia/mahjong_graphic.git /tile-art \
  && git -C /tile-art checkout 3e275804ff58325306710bef3a7406860444bc6a \
  && test "$(git -C /tile-art rev-parse HEAD)" = 3e275804ff58325306710bef3a7406860444bc6a
COPY scripts/prepare-mamahjong.js /prepare-mamahjong.js
RUN node /prepare-mamahjong.js /source /prepared /tile-art
WORKDIR /prepared/apps/game-web
RUN npm ci --ignore-scripts && npm run build

FROM rust:1.85.1-bookworm@sha256:e51d0265072d2d9d5d320f6a44dde6b9ef13653b035098febd68cce8fa7c0bc4 AS mamahjong-build

WORKDIR /build
COPY --from=mamahjong-source /prepared/ ./
RUN cargo build --locked --release --package mamahjong-server

FROM node:24.14.1-bookworm-slim@sha256:b506e7321f176aae77317f99d67a24b272c1f09f1d10f1761f2773447d8da26c AS hall

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY server.js startup-port.js ./
COPY platform/ ./platform/
COPY deploy/ ./deploy/
COPY --from=billiards-build /out/ ./integrations/billiards/
COPY --from=mamahjong-build /build/target/release/mamahjong-server ./integrations/mamahjong/mamahjong-server
COPY --from=mamahjong-source /prepared/apps/game-web/dist/ ./integrations/mamahjong/game/
COPY --from=mamahjong-source /prepared/gamenest-upstream.json ./integrations/mamahjong/gamenest-upstream.json
COPY games/ ./games/
COPY bots/ ./bots/
COPY lang/ ./lang/
COPY public/ ./public/

RUN mkdir /data && chown node:node /data
USER node

ENV NODE_ENV=production PORT=3000 DATA_DIR=/data \
    BILLIARDS_DIR=/app/integrations/billiards BILLIARDS_PORT=8188 \
    MAMAHJONG_DIR=/app/integrations/mamahjong MAMAHJONG_PORT=8190
EXPOSE 3000
VOLUME /data
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/healthz', response => process.exit(response.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]

FROM hall AS starliner-preview
COPY --from=starliner-build /out/ ./integrations/starliner/
ENV STARLINER_DIR=/app/integrations/starliner STARLINER_PORT=8189

FROM hall AS onenight-preview
COPY --from=onenight-build /out/ ./integrations/onenight/
ENV ONENIGHT_DIR=/app/integrations/onenight ONENIGHT_PORT=8191 ENABLE_ONENIGHT_PREVIEW=1

FROM starliner-preview AS social-preview
COPY --from=onenight-build /out/ ./integrations/onenight/
ENV ONENIGHT_DIR=/app/integrations/onenight ONENIGHT_PORT=8191 ENABLE_ONENIGHT_PREVIEW=1

FROM hall AS kof-wing-preview
COPY output/kof-wing/ ./integrations/kof-wing/
ENV KOF_WING_DIR=/app/integrations/kof-wing

FROM hall AS final
