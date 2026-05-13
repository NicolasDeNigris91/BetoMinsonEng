# DiMinson Engenharia — Vistorias

Sistema interno pra registrar vistorias de instalações de empreendimentos
(elétrica, hidráulica, HVAC, piscina, aspiração, sistemas), gerar PDF
profissional e compartilhar com cliente via link com expiração.

## Stack

- **Next.js 16** (App Router, Turbopack, Server Actions)
- **Postgres 17** com **Drizzle ORM**
- **Iron-session** para autenticação (senha única, cookie httpOnly)
- **Sharp** para processamento de imagens (resize, thumbs, mozjpeg)
- **Playwright** para gerar PDF a partir de HTML
- **shadcn/ui** + **base-ui** + **Tailwind v4**

## Modelo

- **Empreendimento** → várias **Unidades** (casas, lotes)
- **Unidade** → várias **Vistorias** (visitas datadas)
- **Vistoria** registra **Achados** (problemas encontrados) e os marca como
  *persiste* / *resolvido* nas próximas visitas.
- Cada achado pode ter **fotos** e **notas** associadas a uma vistoria.
- **Tokens de compartilhamento**: leitura pra cliente (7 dias) ou upload
  pelo celular (24h, gera QR).

## Setup local

```bash
pnpm install
docker compose up -d postgres
cp .env.example .env.local   # ajustar SESSION_SECRET e APP_PASSWORD
pnpm db:migrate
pnpm dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Deploy (Railway)

1. Service Next.js: Dockerfile do repo, build automático em push pra `main`.
2. Service Postgres: provisionado pelo Railway.
3. Variáveis no service Next.js:
   - `DATABASE_URL` → `${{ Postgres.DATABASE_URL }}`
   - `APP_PASSWORD`, `SESSION_SECRET`, `BASE_URL`
4. Volume montado em `/data` pras fotos persistirem entre deploys.
5. Healthcheck em `/api/health`.

## Scripts

- `pnpm dev` — servidor de dev
- `pnpm build` — build de produção
- `pnpm lint` — eslint
- `pnpm db:migrate` — aplica migrations
- `pnpm db:generate` — gera nova migration a partir do schema
- `pnpm db:studio` — UI do Drizzle
