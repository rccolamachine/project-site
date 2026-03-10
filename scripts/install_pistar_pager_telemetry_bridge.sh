#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_BRIDGE_SCRIPT="$SCRIPT_DIR/pager_telemetry_bridge.sh"
SRC_SERVICE_FILE="$SCRIPT_DIR/pager_telemetry_bridge.service"
SRC_ENV_EXAMPLE="$SCRIPT_DIR/pager_telemetry.env.example"

DEST_BRIDGE_SCRIPT="/usr/local/bin/pager-telemetry-bridge.sh"
DEST_SERVICE_FILE="/etc/systemd/system/pager-telemetry-bridge.service"
DEST_ENV_FILE="/etc/pager-telemetry.env"

if [[ ! -f "$SRC_BRIDGE_SCRIPT" ]]; then
  echo "Missing source script: $SRC_BRIDGE_SCRIPT" >&2
  exit 1
fi

if [[ ! -f "$SRC_SERVICE_FILE" ]]; then
  echo "Missing service template: $SRC_SERVICE_FILE" >&2
  exit 1
fi

if [[ ! -f "$SRC_ENV_EXAMPLE" ]]; then
  echo "Missing env template: $SRC_ENV_EXAMPLE" >&2
  exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl not found. This script is intended for Pi-Star systemd hosts." >&2
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required." >&2
  exit 1
fi

if [[ "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage:
  ./scripts/install_pistar_pager_telemetry_bridge.sh

What it does:
  1) Installs pager bridge script to /usr/local/bin/pager-telemetry-bridge.sh
  2) Installs systemd unit to /etc/systemd/system/pager-telemetry-bridge.service
  3) Creates /etc/pager-telemetry.env if missing
  4) Enables and starts pager-telemetry-bridge service

If /etc/pager-telemetry.env already exists, it is preserved.
EOF
  exit 0
fi

echo "Installing bridge script..."
sudo install -m 0755 "$SRC_BRIDGE_SCRIPT" "$DEST_BRIDGE_SCRIPT"

echo "Installing systemd service..."
sudo install -m 0644 "$SRC_SERVICE_FILE" "$DEST_SERVICE_FILE"

if [[ ! -f "$DEST_ENV_FILE" ]]; then
  echo "Creating $DEST_ENV_FILE from example template..."
  sudo install -m 0600 "$SRC_ENV_EXAMPLE" "$DEST_ENV_FILE"
  echo
  echo "IMPORTANT: Edit $DEST_ENV_FILE and set:"
  echo "  - PAGER_TELEMETRY_URL or PAGER_TELEMETRY_URLS"
  echo "  - PAGER_TELEMETRY_SECRET"
  echo "  - MMDVM_LOG_GLOB (recommended) or MMDVM_LOG_FILE"
  echo
else
  echo "Keeping existing env file: $DEST_ENV_FILE"
fi

if sudo grep -Eq 'PAGER_TELEMETRY_URLS?=.*(localhost|127\.0\.0\.1)' "$DEST_ENV_FILE"; then
  echo
  echo "WARNING: $DEST_ENV_FILE references localhost/127.0.0.1 for telemetry URL."
  echo "On Pi-Star, that targets Pi-Star itself, not your dev machine."
  echo "Use your dev machine LAN IP (for example http://192.168.1.66:3000/api/pager/telemetry)."
  echo
fi

echo "Reloading systemd..."
sudo systemctl daemon-reload

echo "Enabling and starting service..."
sudo systemctl enable --now pager-telemetry-bridge

echo
echo "Service status:"
sudo systemctl --no-pager --full status pager-telemetry-bridge || true

echo
echo "Done. Watch logs with:"
echo "  journalctl -u pager-telemetry-bridge -f"
