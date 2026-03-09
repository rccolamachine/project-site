#!/usr/bin/env bash
set -euo pipefail

# Watches a Pi-Star/MMDVM log and emits telemetry events to /api/pager/telemetry.
# The telemetry endpoint can now match by recent pending pager request, so this
# script only needs to send stage + detail.

PAGER_TELEMETRY_URL="${PAGER_TELEMETRY_URL:-}"
PAGER_TELEMETRY_URLS="${PAGER_TELEMETRY_URLS:-}"
PAGER_TELEMETRY_SECRET="${PAGER_TELEMETRY_SECRET:-}"
MMDVM_LOG_FILE="${MMDVM_LOG_FILE:-}"
MMDVM_LOG_GLOB="${MMDVM_LOG_GLOB:-/var/log/pi-star/MMDVM-*.log}"
MMDVM_LOG_SWITCH_INTERVAL_SEC="${MMDVM_LOG_SWITCH_INTERVAL_SEC:-30}"

GATEWAY_RECEIVED_REGEX="${GATEWAY_RECEIVED_REGEX:-DAPNET|POCSAG.*(queue|queued|received)}"
MMDVM_TX_STARTED_REGEX="${MMDVM_TX_STARTED_REGEX:-POCSAG.*(tx|transmit|sending|start)}"
MMDVM_TX_COMPLETED_REGEX="${MMDVM_TX_COMPLETED_REGEX:-POCSAG.*(complete|completed|sent|finish|end|stop)}"

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

declare -a TELEMETRY_DESTINATIONS=()
declare -A TELEMETRY_DESTINATIONS_SEEN=()

add_telemetry_destination() {
  local candidate
  candidate="$(trim "$1")"
  if [[ -z "$candidate" ]]; then
    return
  fi

  if [[ -n "${TELEMETRY_DESTINATIONS_SEEN[$candidate]:-}" ]]; then
    return
  fi

  TELEMETRY_DESTINATIONS+=("$candidate")
  TELEMETRY_DESTINATIONS_SEEN["$candidate"]=1
}

if [[ -n "$PAGER_TELEMETRY_URLS" ]]; then
  IFS=',' read -r -a parsed_urls <<< "$PAGER_TELEMETRY_URLS"
  for url in "${parsed_urls[@]}"; do
    add_telemetry_destination "$url"
  done
fi

if [[ -n "$PAGER_TELEMETRY_URL" ]]; then
  add_telemetry_destination "$PAGER_TELEMETRY_URL"
fi

if (( ${#TELEMETRY_DESTINATIONS[@]} == 0 )); then
  echo "Missing telemetry destination. Set PAGER_TELEMETRY_URL or PAGER_TELEMETRY_URLS." >&2
  exit 1
fi

if [[ -z "$PAGER_TELEMETRY_SECRET" ]]; then
  echo "Missing PAGER_TELEMETRY_SECRET." >&2
  exit 1
fi

if ! [[ "$MMDVM_LOG_SWITCH_INTERVAL_SEC" =~ ^[0-9]+$ ]] || (( MMDVM_LOG_SWITCH_INTERVAL_SEC <= 0 )); then
  MMDVM_LOG_SWITCH_INTERVAL_SEC=30
fi

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/ }"
  value="${value//$'\r'/ }"
  value="${value//$'\t'/ }"
  printf '%s' "$value"
}

send_stage_to_destination() {
  local destination="$1"
  local stage="$2"
  local at="$3"
  local detail="$4"
  local payload
  local curl_output=""

  payload=$(
    printf '{"stage":"%s","at":"%s","detail":"%s"}' \
      "$stage" \
      "$at" \
      "$(json_escape "$detail")"
  )

  if curl_output="$(
    curl -fsS --max-time 6 \
      -X POST "$destination" \
      -H "Content-Type: application/json" \
      -H "x-pager-telemetry-secret: $PAGER_TELEMETRY_SECRET" \
      --data "$payload" \
      -o /dev/null \
      2>&1
  )"; then
    return 0
  fi

  LAST_SEND_ERROR="$(echo "$curl_output" | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g' | sed 's/^ //; s/ $//')"
  if [[ -z "$LAST_SEND_ERROR" ]]; then
    LAST_SEND_ERROR="unknown curl failure"
  fi
  return 1
}

post_stage() {
  local stage="$1"
  local detail="$2"
  local at
  local destination
  local any_success=0
  local failure_reason=""
  at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  for destination in "${TELEMETRY_DESTINATIONS[@]}"; do
    LAST_SEND_ERROR=""
    if send_stage_to_destination "$destination" "$stage" "$at" "$detail"; then
      printf '%s sent %s -> %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$stage" "$destination"
      any_success=1
    else
      failure_reason="$LAST_SEND_ERROR"
      printf '%s failed %s -> %s (%s)\n' \
        "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        "$stage" \
        "$destination" \
        "${failure_reason:0:160}" >&2
    fi
  done

  if (( any_success == 0 )); then
    return 1
  fi
  return 0
}

shopt -s nocasematch

resolve_active_log_file() {
  local explicit
  local latest

  explicit="$(trim "$MMDVM_LOG_FILE")"
  if [[ -n "$explicit" && -f "$explicit" ]]; then
    printf '%s' "$explicit"
    return 0
  fi

  latest="$(ls -1t $MMDVM_LOG_GLOB 2>/dev/null | head -n 1 || true)"
  latest="$(trim "$latest")"
  if [[ -n "$latest" && -f "$latest" ]]; then
    printf '%s' "$latest"
    return 0
  fi

  return 1
}

stop_tail_reader() {
  local pid="$1"
  local fd="$2"

  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
  fi
  if [[ -n "$pid" ]]; then
    wait "$pid" 2>/dev/null || true
  fi
  if [[ -n "$fd" ]]; then
    exec {fd}<&- || true
  fi
}

process_log_line() {
  local line="$1"
  local stage=""
  local signature

  if [[ "$line" =~ $MMDVM_TX_COMPLETED_REGEX ]]; then
    stage="mmdvm_tx_completed"
  elif [[ "$line" =~ $MMDVM_TX_STARTED_REGEX ]]; then
    stage="mmdvm_tx_started"
  elif [[ "$line" =~ $GATEWAY_RECEIVED_REGEX ]]; then
    stage="gateway_received"
  fi

  if [[ -z "$stage" ]]; then
    return 0
  fi

  signature="$stage|$line"
  if [[ "$signature" == "$LAST_SIGNATURE" ]]; then
    return 0
  fi
  LAST_SIGNATURE="$signature"

  post_stage "$stage" "$line" || true
}

for destination in "${TELEMETRY_DESTINATIONS[@]}"; do
  echo "Telemetry destination: $destination"
done

echo "MMDVM explicit file: ${MMDVM_LOG_FILE:-<none>}"
echo "MMDVM rotating glob: $MMDVM_LOG_GLOB"

CURRENT_LOG_FILE=""
LAST_SIGNATURE=""
LAST_SEND_ERROR=""
TAIL_PID=""
TAIL_FD=""
NEXT_SWITCH_CHECK_EPOCH=0

while true; do
  NOW_EPOCH="$(date +%s)"
  ACTIVE_LOG_FILE="$(resolve_active_log_file || true)"

  if [[ -z "$ACTIVE_LOG_FILE" ]]; then
    if [[ -n "$TAIL_PID" || -n "$TAIL_FD" ]]; then
      stop_tail_reader "$TAIL_PID" "$TAIL_FD"
      TAIL_PID=""
      TAIL_FD=""
      CURRENT_LOG_FILE=""
      LAST_SIGNATURE=""
    fi
    echo "MMDVM log not found. Checked explicit file and glob. Retrying in 5s..."
    sleep 5
    continue
  fi

  if [[ "$ACTIVE_LOG_FILE" != "$CURRENT_LOG_FILE" || -z "$TAIL_PID" ]] || ! kill -0 "$TAIL_PID" 2>/dev/null; then
    stop_tail_reader "$TAIL_PID" "$TAIL_FD"
    CURRENT_LOG_FILE="$ACTIVE_LOG_FILE"
    LAST_SIGNATURE=""
    echo "Watching $CURRENT_LOG_FILE for pager telemetry patterns..."
    coproc TAIL_READER { exec tail -n0 -F "$CURRENT_LOG_FILE"; }
    TAIL_PID="$TAIL_READER_PID"
    TAIL_FD="${TAIL_READER[0]}"
    NEXT_SWITCH_CHECK_EPOCH=$(( NOW_EPOCH + MMDVM_LOG_SWITCH_INTERVAL_SEC ))
  fi

  if read -r -t 1 -u "$TAIL_FD" LOG_LINE; then
    process_log_line "$LOG_LINE"
  fi

  NOW_EPOCH="$(date +%s)"
  if (( NOW_EPOCH >= NEXT_SWITCH_CHECK_EPOCH )); then
    NEXT_SWITCH_CHECK_EPOCH=$(( NOW_EPOCH + MMDVM_LOG_SWITCH_INTERVAL_SEC ))
    LATEST_LOG_FILE="$(resolve_active_log_file || true)"
    if [[ -n "$LATEST_LOG_FILE" && "$LATEST_LOG_FILE" != "$CURRENT_LOG_FILE" ]]; then
      echo "Detected newer MMDVM log: $LATEST_LOG_FILE"
      stop_tail_reader "$TAIL_PID" "$TAIL_FD"
      TAIL_PID=""
      TAIL_FD=""
      CURRENT_LOG_FILE=""
      LAST_SIGNATURE=""
    fi
  fi
done
