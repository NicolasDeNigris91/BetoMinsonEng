#!/usr/bin/env bash
# Backup incremental de UPLOADS_DIR (fotos das vistorias) pra um bucket
# S3-compatível (Cloudflare R2 recomendado). Pensado pra rodar via Cron
# Job do Railway, mas funciona local desde que rclone esteja instalado.
#
# Variáveis obrigatórias (setar no painel Railway → Variables):
#   R2_ACCESS_KEY_ID
#   R2_SECRET_ACCESS_KEY
#   R2_ENDPOINT       ex.: https://<account>.r2.cloudflarestorage.com
#   R2_BUCKET         nome do bucket (ex.: rme-uploads-backup)
#
# Opcionais:
#   UPLOADS_DIR       default: /data (mesmo do app em produção)
#
# Modelo de proteção contra delete acidental:
# `rclone sync` com `--backup-dir` move arquivos removidos no source pra
# uma pasta com timestamp em vez de deletá-los no destino. Assim, um bug
# local que apague tudo NÃO replica a perda no backup.
#
# Ver docs/backup-restore.md para o procedimento de restore completo.

set -euo pipefail

UPLOADS_DIR="${UPLOADS_DIR:-/data}"

: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID nao definido}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY nao definido}"
: "${R2_ENDPOINT:?R2_ENDPOINT nao definido}"
: "${R2_BUCKET:?R2_BUCKET nao definido}"

if ! command -v rclone >/dev/null 2>&1; then
  echo "[backup] rclone nao encontrado no PATH. Instale com:"
  echo "[backup]   curl https://rclone.org/install.sh | sudo bash"
  exit 1
fi

if [ ! -d "$UPLOADS_DIR" ]; then
  echo "[backup] UPLOADS_DIR ($UPLOADS_DIR) nao existe — abortando."
  exit 1
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
DATE_DIR=$(date -u +"%Y-%m-%d")

echo "[backup] iniciando — $TIMESTAMP"
echo "[backup] source: $UPLOADS_DIR"
echo "[backup] dest:   r2:$R2_BUCKET/uploads/"

# Config inline do rclone via env vars — evita gravar arquivo de config.
# RCLONE_CONFIG_<name>_TYPE define um remote chamado <name>.
export RCLONE_CONFIG_R2_TYPE="s3"
export RCLONE_CONFIG_R2_PROVIDER="Cloudflare"
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="$R2_ENDPOINT"

rclone sync "$UPLOADS_DIR" "r2:$R2_BUCKET/uploads/" \
  --backup-dir "r2:$R2_BUCKET/uploads-deleted/$DATE_DIR/" \
  --transfers 8 \
  --checkers 16 \
  --stats=30s \
  --stats-one-line

echo "[backup] concluido em $(date -u +%H:%M:%SZ)"
