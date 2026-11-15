#!/bin/bash
# Backup semanal de PRODUÇÃO (agendado pelo launchd: ops/br.com.dabitech.custo.backup.plist).
# export (somente leitura no D1) -> manifesto SHA-256 -> verify (restaura em memória) -> descarte dos agendados com mais de 90 dias.
# Só apaga arquivos criados por ESTE agendamento (prefixo custo-production-weekly-); backups manuais nunca são tocados.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DIR="${CUSTO_BACKUP_DIR:-$HOME/custo-backups}"
RETENTION_DAYS="${CUSTO_BACKUP_RETENTION_DAYS:-90}"
PREFIX="custo-production-weekly-"
STAMP="$(date -u +%Y%m%dT%H%MZ)"
FILE="$DIR/$PREFIX$STAMP.sql"

mkdir -p "$DIR"
cd "$REPO"
echo "== $(date -u +%FT%TZ) backup semanal de produção -> $FILE"

# O Wrangler imprime um link de download temporário (assinado) do banco: nunca vai para o log.
npm run --silent d1 -- export --env production --output "$FILE" 2>&1 | grep -v -e "r2.cloudflarestorage.com" -e "download your export" || true
test -s "$FILE" || { echo "   ERRO: exportação não gerou arquivo"; exit 1; }
npm run --silent backup:manifest -- --file "$FILE" --env production >/dev/null
npm run --silent backup:verify -- --file "$FILE" >/dev/null
echo "   ok: exportado, manifesto gravado e restauração em memória conferida"

# Descarte: só os agendados (e seus manifestos) mais antigos que a retenção, e nunca o que acabou de ser feito.
find "$DIR" -maxdepth 1 -type f \( -name "$PREFIX*.sql" -o -name "$PREFIX*.sql.manifest.json" \) -mtime +"$RETENTION_DAYS" -print -delete \
  | sed 's/^/   descartado (retenção de '"$RETENTION_DAYS"' dias): /'
echo "== fim"
