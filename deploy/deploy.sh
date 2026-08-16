#!/usr/bin/env bash
# =====================================================================
#  Albion Comp Bot auf den eigenen Server bringen
#
#  Laeuft neben Noxa auf demselben Rechner, aber unter eigenem Nutzer
#  und in eigenem Verzeichnis - ein kaputter Albion-Bot darf Noxa nicht
#  mitreissen.
#
#  Ueber git archive statt rsync oder scp -r: so geht genau das rueber,
#  was auch im Repo ist. Kein node_modules, keine .env, keine lokalen
#  Reste. Die .env liegt einmalig auf dem Server und wird hier nie
#  angefasst.
#
#    ./deploy/deploy.sh              # aktueller Stand
#    HOST=root@1.2.3.4 ./deploy/deploy.sh
# =====================================================================
set -euo pipefail

HOST="${HOST:-root@116.203.249.88}"
ZIEL="${ZIEL:-/opt/albion-bot}"
DIENST="albion-bot"

cd "$(dirname "$0")/.."

echo "==> Tests"
npm test --silent

echo "==> Stand nach $HOST:$ZIEL"
git archive --format=tar HEAD | ssh "$HOST" "
  set -e
  mkdir -p '$ZIEL'
  # bot/.env ueberlebt: sie ist nicht im Repo und wird nicht ueberschrieben.
  tar -x -C '$ZIEL' -f -
  cd '$ZIEL'
  npm install --omit=dev --no-fund --no-audit
  id albion >/dev/null 2>&1 || useradd --system --home '$ZIEL' --shell /usr/sbin/nologin albion
  chown -R albion:albion '$ZIEL'
  install -m 644 deploy/$DIENST.service /etc/systemd/system/$DIENST.service
  systemctl daemon-reload
  systemctl enable --now $DIENST
  systemctl restart $DIENST
"

echo "==> Dashboard nach $HOST:/opt/albion-dashboard"
# Getrennt vom Bot: eigener Dienst, eigener Build. Faellt das Dashboard um,
# laeuft der Bot weiter - und umgekehrt.
git archive --format=tar HEAD dashboard | ssh "$HOST" "
  set -e
  cd /opt/albion-dashboard
  tar -x --strip-components=1 -f -
  npm install --no-fund --no-audit >/dev/null
  npm run build >/dev/null
  chown -R albion:albion /opt/albion-dashboard
  systemctl restart albion-dashboard
"

echo "==> Startmeldung abwarten"
ssh "$HOST" "
  for i in \$(seq 1 30); do
    if journalctl -u $DIENST -n 50 --no-pager | grep -q 'Eingeloggt als'; then
      echo 'Bot ist oben:'
      journalctl -u $DIENST -n 8 --no-pager
      exit 0
    fi
    sleep 2
  done
  echo 'Keine Bereitmeldung nach 60s:'
  journalctl -u $DIENST -n 40 --no-pager
  exit 1
"

echo "==> Antwortet das Dashboard?"
ssh "$HOST" "curl -sf -o /dev/null -w 'HTTP %{http_code}
' --max-time 20 http://127.0.0.1:3200/" \n  || { echo 'Dashboard antwortet nicht:'; ssh "$HOST" 'journalctl -u albion-dashboard -n 20 --no-pager'; exit 1; }
