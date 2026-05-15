# Backup e restore

Este projeto guarda dois tipos de estado:

1. **Postgres** — todos os metadados (vistorias, achados, eventos, tokens, schema futuro de usuários). Backup é nativo do Railway, mas precisa estar **ligado por serviço** em Settings → Backups → Schedule. Recomendado: diário com retenção de 7 dias.
2. **Volume `/data`** — fotos JPEG (`originals/` e `thumbs/`) processadas pelo Sharp. **Não tem backup automático.** Se o volume corromper ou o serviço Railway for deletado, todas as fotos somem. Os PDFs históricos podem ser regerados a partir do banco — mas só se as fotos ainda existirem.

Este documento descreve as duas estratégias para o volume e o procedimento de restore para cada uma.

---

## Por que o volume é o ponto fraco

- Postgres no Railway tem snapshot automático (uma vez ligado).
- Volumes não. Eles existem dentro do projeto — se o projeto é apagado por engano, o volume vai junto.
- Migrar de plataforma sem backup off-host significa fazer download manual via shell do container.
- O custo de não ter backup = perda total das fotos. Custo de ter = centavos por mês.

---

## Estratégia A: rclone para R2/S3 (recomendado p/ começar)

O volume continua sendo a fonte primária; um cron diário copia o conteúdo pra um bucket externo. Simples, pouco código, off-host.

### Setup

1. **Criar bucket** em Cloudflare R2 (free tier: 10 GB de armazenamento + 1M de operações Class A/mês — sobra muito) ou AWS S3.
2. **Gerar credenciais** com escrita restrita ao bucket. Salvar como variáveis de ambiente no Railway:
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_ENDPOINT` (ex.: `https://<account>.r2.cloudflarestorage.com`)
   - `R2_BUCKET` (nome do bucket, ex.: `rme-uploads-backup`)
3. **Configurar cron no Railway**: Settings → Cron Jobs → Add. Comando: `bash scripts/backup-uploads.sh`. Schedule: `0 3 * * *` (todo dia às 3h UTC).

### Como funciona

`scripts/backup-uploads.sh` invoca `rclone sync` do `UPLOADS_DIR` para `r2:$R2_BUCKET/uploads/`. `sync` é incremental — só envia arquivos novos ou modificados. A primeira execução leva mais (depende do volume atual); execuções seguintes são quase instantâneas.

O script é **idempotente** e **não destrutivo no destino**: usa `--backup-dir` para mover arquivos deletados para uma pasta com timestamp, em vez de apagá-los. Isso protege contra um bug local que apague tudo e replique a perda no backup.

### Restore

```bash
# Listar o que tem no bucket
rclone ls r2:$R2_BUCKET/uploads/ | head

# Restaurar pra o volume atual (sobrescreve)
rclone sync r2:$R2_BUCKET/uploads/ /data --progress

# Restaurar uma versão de N dias atrás (de --backup-dir)
rclone copy r2:$R2_BUCKET/uploads-deleted/2026-01-15/ /data --progress
```

Após restore, reinicie o serviço pra garantir que cache em memória (se houver) seja invalidado.

---

## Estratégia B: R2 como armazenamento primário (mais robusto, + trabalho)

Em vez de gravar em `/data` e copiar pro R2, gravar direto no R2 e usar o volume só como cache. Elimina o SPOF do volume, mas exige refator em `src/lib/storage.ts` (mover de `fs` para AWS SDK / S3 client).

Benefícios:
- Sem necessidade de cron de backup (gravação já é remota).
- Volume vira opcional — pode rodar em ambientes sem volume montado.
- R2 tem replicação interna; durabilidade muito superior ao volume único.

Custos:
- ~1 dia de refactor + testes.
- Cada upload e cada leitura agora é uma round-trip pro R2 (mas R2 é rápido — ~50ms).

**Quando migrar:** quando crescer ou em qualquer mudança de plataforma. Hoje, A é suficiente.

---

## Procedimento de rollback de deploy ruim

Se um push pra `main` quebrar produção:

1. **Identificar último commit bom.** No GitHub, o histórico de Actions mostra qual commit passou no CI por último. Caso típico: o último que tem ✓ verde.
2. **Reverter via GitHub UI** ou no terminal:
   ```bash
   git revert <sha-ruim>
   git push
   ```
3. Railway redeploya automaticamente o revert. Tempo total: ~3-5 min.
4. **Se a migration de banco precisar reverter**, isso é manual: as migrations Drizzle não têm rollback automático. Verifique `src/db/migrations/0xxx_*.sql` e aplique o inverso à mão via `drizzle-kit studio` ou `psql`.

> **Importante:** revert de schema mudou-coluna-tipo é arriscado se houver dados novos no formato novo. Em caso de dúvida, snapshot do Postgres antes via Railway Backups → Restore.

---

## Checklist mensal (5 min)

- [ ] Backup do Postgres no Railway está ligado e tem snapshots recentes (Settings → Backups).
- [ ] Cron `backup-uploads` rodou nas últimas 24h sem erro (Railway → Cron Jobs → Logs).
- [ ] Tamanho do bucket R2 está crescendo na proporção esperada (cada vistoria = ~5-30 MB de fotos).
- [ ] Teste de restore num ambiente local: `rclone copy r2:$R2_BUCKET/uploads/ /tmp/restore-test/` — confere se baixa.
