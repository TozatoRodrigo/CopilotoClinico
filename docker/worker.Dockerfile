FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS production
COPY --from=copiloto-api:latest /app/dist ./dist
COPY --from=copiloto-api:latest /app/node_modules ./node_modules
COPY --from=copiloto-api:latest /app/package.json ./

ENV NODE_ENV=production

CMD ["node", "dist/workers/main.js"]
