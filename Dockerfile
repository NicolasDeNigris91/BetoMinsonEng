FROM mcr.microsoft.com/playwright:v1.59.1-noble

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN corepack enable && corepack prepare pnpm@11.0.9 --activate

COPY package.json pnpm-lock.yaml .npmrc ./

RUN pnpm install --frozen-lockfile --prod=false --config.dangerouslyAllowAllBuilds=true

COPY . .

# Build-time placeholders only. Railway's runtime env vars override these in production.
# next build evaluates route modules to collect page data, so DATABASE_URL etc. need to be
# defined; their values are never used because no DB queries run during build.
ENV DATABASE_URL=postgres://build-placeholder@localhost:5432/build
ENV APP_PASSWORD=build-placeholder
ENV SESSION_SECRET=build_placeholder_secret_at_least_32_chars_long_xxxxxx
ENV BASE_URL=http://localhost:3000

RUN pnpm build

# Pre-create the uploads directory; in production Railway mounts a Volume here.
RUN mkdir -p /data/uploads && chmod 777 /data/uploads
ENV UPLOADS_DIR=/data/uploads

EXPOSE 3000

# Run migrations on every boot (idempotent), then start Next.js.
CMD ["sh", "-c", "pnpm db:migrate && pnpm start"]
