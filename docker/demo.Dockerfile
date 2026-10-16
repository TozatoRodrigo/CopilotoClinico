FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/
RUN pnpm install --frozen-lockfile --prod=false

FROM base AS web-deps
COPY web/package.json ./web/package.json
COPY web/pnpm-lock.yaml ./web/pnpm-lock.yaml
RUN cd web && pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=web-deps /app/web/node_modules ./web/node_modules
COPY . .
RUN pnpm prisma generate
RUN pnpm build
RUN cd web && pnpm build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/web/.next ./web/.next
COPY --from=builder /app/web/public ./web/public
COPY --from=builder /app/web/node_modules ./web/node_modules
COPY --from=builder /app/web/package.json ./web/package.json

EXPOSE 3000 3001
CMD ["node", "dist/main.js"]
