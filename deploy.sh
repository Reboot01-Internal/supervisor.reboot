#!/usr/bin/env bash
set -euo pipefail

# ============================================================
#  Supervisor Reboot — Deploy Script
#
#  Usage:
#    sudo ./deploy.sh                  # port 4500
#    sudo ./deploy.sh --port 5500      # custom port
#    sudo ./deploy.sh --api-url https://mysite.com/api
# ============================================================

BACKEND_PORT=4500
API_URL=""
APP_NAME="supervisor-reboot"
DEPLOY_DIR="/opt/${APP_NAME}"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

while [[ $# -gt 0 ]]; do
  case $1 in
    --port)      BACKEND_PORT="$2"; shift 2 ;;
    --api-url)   API_URL="$2";      shift 2 ;;
    --deploy-dir) DEPLOY_DIR="$2";  shift 2 ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

# Default API URL if not provided
[[ -z "$API_URL" ]] && API_URL="http://localhost:${BACKEND_PORT}"

echo "==> Backend port : ${BACKEND_PORT}"
echo "==> Frontend API : ${API_URL}"
echo "==> Deploy dir   : ${DEPLOY_DIR}"
echo ""

# ---------- build backend ----------
echo "==> Building Go backend..."
cd "${REPO_DIR}/backend"
CGO_ENABLED=1 go build -o "${DEPLOY_DIR}/backend/${APP_NAME}" ./cmd/api/

mkdir -p "${DEPLOY_DIR}"/{backend,data}
cp -r migrations "${DEPLOY_DIR}/backend/"

# copy .env first time only
if [[ -f .env ]] && [[ ! -f "${DEPLOY_DIR}/backend/.env" ]]; then
  cp .env "${DEPLOY_DIR}/backend/.env"
  echo "==> Copied .env (edit ${DEPLOY_DIR}/backend/.env for production values)"
fi

# ---------- patch .env with port + db path ----------
ENV_FILE="${DEPLOY_DIR}/backend/.env"
PROD_DB="${DEPLOY_DIR}/data/app.db"

# set PORT
if grep -q "^PORT=" "${ENV_FILE}" 2>/dev/null; then
  sed -i "s/^PORT=.*/PORT=${BACKEND_PORT}/" "${ENV_FILE}"
else
  echo "PORT=${BACKEND_PORT}" >> "${ENV_FILE}"
fi

# set DB_PATH
if grep -q "^DB_PATH=" "${ENV_FILE}" 2>/dev/null; then
  sed -i "s|^DB_PATH=.*|DB_PATH=${PROD_DB}|" "${ENV_FILE}"
else
  echo "DB_PATH=${PROD_DB}" >> "${ENV_FILE}"
fi

# ---------- build frontend ----------
echo "==> Building React frontend..."
cd "${REPO_DIR}/frontend"
npm ci --no-audit --no-fund
VITE_API_URL="${API_URL}" npm run build

mkdir -p "${DEPLOY_DIR}/frontend"
rm -rf "${DEPLOY_DIR}/frontend/dist"
cp -r dist "${DEPLOY_DIR}/frontend/"

# ---------- systemd service ----------
echo "==> Setting up systemd service..."
cat > "/etc/systemd/system/${APP_NAME}.service" <<UNIT
[Unit]
Description=Supervisor Reboot Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=${DEPLOY_DIR}/backend
ExecStart=${DEPLOY_DIR}/backend/${APP_NAME}
EnvironmentFile=${DEPLOY_DIR}/backend/.env
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable "${APP_NAME}"
systemctl restart "${APP_NAME}"

# ---------- done ----------
echo ""
echo "==> Done!"
echo "    Backend running on port ${BACKEND_PORT}"
echo "    Frontend built at ${DEPLOY_DIR}/frontend/dist"
echo "    Service: sudo systemctl status ${APP_NAME}"
echo "    Logs:    sudo journalctl -u ${APP_NAME} -f"
echo "    Env:     ${DEPLOY_DIR}/backend/.env"
