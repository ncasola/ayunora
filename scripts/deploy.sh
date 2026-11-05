#!/usr/bin/env bash
# Despliega Ayunora en el VPS: build local, subida de una release nueva, cambio del
# symlink `current`, reinicio del servicio y smoke test. Conserva las 5 últimas releases.
#
# Uso: scripts/deploy.sh            (host SSH por defecto: ionos)
#      DEPLOY_HOST=otro scripts/deploy.sh
#
# Requisitos en el servidor (ver docs/DEPLOY.md):
#   - /opt/ayunora/releases con permiso de escritura para el usuario SSH
#   - sudo sin contraseña SOLO para: systemctl restart ayunora
set -euo pipefail

HOST="${DEPLOY_HOST:-ionos}"
APP_DIR=/opt/ayunora
RELEASE="$(date +%Y%m%d%H%M%S)"
KEEP=5

cd "$(dirname "$0")/.."

echo "==> Comprobaciones y build"
npm run -s typecheck
npm test
npm run -s build

echo "==> Subiendo release $RELEASE a $HOST"
tar czf - dist drizzle package.json package-lock.json | ssh "$HOST" "
  set -euo pipefail
  dest=$APP_DIR/releases/$RELEASE
  mkdir -p \"\$dest\"
  tar xzf - -C \"\$dest\"
  cd \"\$dest\"
  npm ci --omit=dev --no-audit --no-fund --loglevel=error
  ln -sfn \"\$dest\" $APP_DIR/current
  sudo -n systemctl restart ayunora
  ls -1dt $APP_DIR/releases/* | tail -n +$((KEEP + 1)) | xargs -r rm -rf --
"

echo "==> Smoke test"
ssh "$HOST" '
  for i in $(seq 1 20); do
    if curl -fsS http://127.0.0.1:3100/api/health; then echo; exit 0; fi
    sleep 0.5
  done
  echo "El servicio no responde"; sudo -n journalctl -u ayunora -n 30 --no-pager; exit 1
'
echo "==> Desplegada la release $RELEASE"
