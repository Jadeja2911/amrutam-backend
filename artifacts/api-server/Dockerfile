# Build context must be the repository ROOT, e.g.:
#   docker build -f artifacts/api-server/Dockerfile -t amrutam-backend .

# --- Build stage ---
FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm@9

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY artifacts/api-server/package.json ./artifacts/api-server/package.json
COPY lib ./lib
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile

COPY artifacts/api-server ./artifacts/api-server
RUN pnpm --filter ./artifacts/api-server run build

# --- Runtime stage ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/artifacts/api-server/dist ./dist
COPY --from=builder /app/artifacts/api-server/node_modules ./node_modules
COPY --from=builder /app/node_modules ./root_node_modules

EXPOSE 3000
CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
