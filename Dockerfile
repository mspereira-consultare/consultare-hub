FROM node:22-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/painel/package.json apps/painel/package.json
COPY apps/intranet/package.json apps/intranet/package.json
COPY apps/portal-colaborador/package.json apps/portal-colaborador/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN npm ci --include=dev --include=optional

FROM node:22-slim AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build:painel && npm run build:intranet
RUN npm prune --omit=dev

FROM node:22-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV APP_NAME=painel

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/painel ./apps/painel
COPY --from=builder /app/apps/intranet ./apps/intranet
COPY --from=builder /app/packages ./packages

EXPOSE 3000

CMD ["sh", "-c", "cd apps/${APP_NAME:-painel} && ../../node_modules/.bin/next start -H 0.0.0.0 -p ${PORT:-3000}"]
