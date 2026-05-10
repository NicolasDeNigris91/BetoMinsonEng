FROM mcr.microsoft.com/playwright:v1.59.1-noble

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN corepack enable && corepack prepare pnpm@11.0.9 --activate

COPY package.json pnpm-lock.yaml .npmrc ./

RUN pnpm install --frozen-lockfile --prod=false --config.dangerouslyAllowAllBuilds=true

COPY . .

RUN pnpm build

# Pre-create the uploads directory; in production Railway mounts a Volume here.
RUN mkdir -p /data/uploads && chmod 777 /data/uploads
ENV UPLOADS_DIR=/data/uploads

EXPOSE 3000

# Run migrations on every boot (idempotent), then start Next.js.
CMD ["sh", "-c", "pnpm db:migrate && pnpm start"]
