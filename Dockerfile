FROM node:24-alpine AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-audit

FROM dependencies AS builder
COPY . .
RUN npm run build

FROM dependencies AS tools
COPY scripts ./scripts
COPY src/domain ./src/domain
COPY src/server/db/schema.ts ./src/server/db/schema.ts
COPY src/server/auth/password.ts ./src/server/auth/password.ts
COPY src/server/errors.ts ./src/server/errors.ts
COPY src/server/configuration.ts ./src/server/configuration.ts
COPY drizzle ./drizzle
COPY tsconfig.json ./
USER node
CMD ["npm", "run", "db:migrate"]

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
