#!/usr/bin/env bash
# Implanta ou atualiza o GPlanSiS|Sheets no servidor (rodar dentro de /opt/sheets). Idempotente.
# Uso: ./deploy.sh                 -> backup do banco + build + subida + espera o healthcheck
#      ./deploy.sh rollback 2.0.0  -> volta para uma imagem anterior já construída
#      ./deploy.sh backup          -> só o backup do banco
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || { echo "Falta o arquivo .env (copie de .env.example)."; exit 1; }
set -a; . ./.env; set +a
if ! grep -qE '^SHEETS_SECRET=.+' .env; then
  sed -i '/^SHEETS_SECRET=/d' .env; echo "SHEETS_SECRET=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')" >> .env; chmod 600 .env
  echo "SHEETS_SECRET gerado no .env (guarde junto com os backups do banco)."; set -a; . ./.env; set +a
fi
mkdir -p dados/backups && chown -R 10001:10001 dados 2>/dev/null || true
chmod 700 dados dados/backups 2>/dev/null || true

backup() {
  if docker inspect gplansis-sheets >/dev/null 2>&1 && [ -f dados/sheets.db ]; then
    ts=$(date +%Y%m%d-%H%M%S)
    docker exec gplansis-sheets python -c "import sqlite3;s=sqlite3.connect('/data/sheets.db');d=sqlite3.connect('/data/backups/sheets-$ts.db');s.backup(d);d.close()"
    ls -1t dados/backups/sheets-*.db 2>/dev/null | tail -n +15 | xargs -r rm -f
    echo "Backup: dados/backups/sheets-$ts.db"
  fi
}

case "${1:-}" in
  backup) backup; exit 0 ;;
  rollback)
    : "${2:?Informe a versão: ./deploy.sh rollback 2.0.0}"
    docker image inspect "gplansis/sheets:$2" >/dev/null || { echo "Imagem gplansis/sheets:$2 não encontrada."; exit 1; }
    backup; SHEETS_VERSION="$2" docker compose up -d --no-build ;;
  *)
    if [ -f CHECKSUMS.sha256 ]; then sha256sum -c CHECKSUMS.sha256 --quiet || { echo "Checksum não confere: o pacote foi alterado ou está incompleto."; exit 1; }; fi
    backup; docker compose build --pull; docker compose up -d ;;
esac

echo "Aguardando o healthcheck…"
for i in $(seq 1 30); do
  st=$(docker inspect -f '{{.State.Health.Status}}' gplansis-sheets 2>/dev/null || echo "?")
  [ "$st" = "healthy" ] && { echo "OK: contêiner saudável em 127.0.0.1:${SHEETS_PORT:-8958}"; exit 0; }
  sleep 2
done
echo "O contêiner não ficou saudável. Veja: docker logs gplansis-sheets"; exit 1
