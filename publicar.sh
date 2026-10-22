#!/usr/bin/env bash
# Publica a partir desta máquina num servidor com Docker e Caddy. Requer acesso `ssh $HOST` já configurado.
# Uso: HOST=meu-servidor [DEST=/opt/sheets] [DOMINIO=sheets.exemplo.com] ./publicar.sh
# 1) gera os HTML e os checksums  2) envia para /opt/sheets  3) roda o deploy.sh lá
# 4) instala o bloco do Caddy na primeira vez (com backup, validação e reload).
set -euo pipefail
cd "$(dirname "$0")"
HOST=${HOST:?Defina HOST (alias ou usuario@host do SSH). Ex.: HOST=meu-servidor ./publicar.sh}; DEST=${DEST:-/opt/sheets}; DOMINIO=${DOMINIO:-sheets.gplansis.com}
python3 src/build.py
find . -type f ! -path './.git/*' ! -name CHECKSUMS.sha256 ! -name '*.zip' ! -path './.env' ! -path './dados/*' ! -path '*/__pycache__/*' ! -name '.DS_Store' ! -name '._*' | sort | xargs shasum -a 256 > CHECKSUMS.sha256
rsync -az --delete --exclude .git --exclude .env --exclude dados --exclude '__pycache__' --exclude '.DS_Store' --exclude '._*' ./ "$HOST:$DEST/"
ssh "$HOST" "cd $DEST && { [ -f .env ] || { cp .env.example .env && chmod 600 .env; }; } && chmod +x deploy.sh && ./deploy.sh"
ssh "$HOST" "set -e; if ! grep -q 'import /etc/caddy/sheets.caddy' /etc/caddy/Caddyfile; then
  ts=\$(date +%Y%m%d-%H%M%S); cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-sheets-\$ts
  cp $DEST/deploy/sheets.caddy /etc/caddy/sheets.caddy
  touch /var/log/caddy/sheets.log && chown caddy:caddy /var/log/caddy/sheets.log  # o validate roda como root e criaria o log com dono root
  printf '\n# GPlanSiS|Sheets 2.0 (/opt/sheets)\nimport /etc/caddy/sheets.caddy\n' >> /etc/caddy/Caddyfile
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null || { cp /etc/caddy/Caddyfile.bak-sheets-\$ts /etc/caddy/Caddyfile; rm -f /etc/caddy/sheets.caddy; echo 'Caddyfile inválido; revertido.'; exit 1; }
  systemctl reload caddy; echo 'Caddy: bloco do Sheets adicionado.'
elif ! cmp -s $DEST/deploy/sheets.caddy /etc/caddy/sheets.caddy; then
  cp /etc/caddy/sheets.caddy /etc/caddy/sheets.caddy.bak-\$(date +%Y%m%d-%H%M%S); cp $DEST/deploy/sheets.caddy /etc/caddy/sheets.caddy
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null && systemctl reload caddy && echo 'Caddy: bloco atualizado.'
fi"
echo "Publicado: https://$DOMINIO"
