#!/usr/bin/env bash
set -euo pipefail

# Watches Pi-Star/MMDVM logs and emits pager telemetry events.
# To avoid background noise, this bridge first checks for an active pending pager
# request and only emits telemetry when one exists.

PAGER_TELEMETRY_URL="${PAGER_TELEMETRY_URL:-}"
PAGER_TELEMETRY_URLS="${PAGER_TELEMETRY_URLS:-}"
PAGER_TELEMETRY_SECRET="${PAGER_TELEMETRY_SECRET:-}"
PAGER_TELEMETRY_ACTIVE_CONTEXT_URL="${PAGER_TELEMETRY_ACTIVE_CONTEXT_URL:-}"
PAGER_TELEMETRY_ACTIVE_CONTEXT_CACHE_SEC="${PAGER_TELEMETRY_ACTIVE_CONTEXT_CACHE_SEC:-2}"
PAGER_TELEMETRY_ACTIVE_CONTEXT_MAX_AGE_MS="${PAGER_TELEMETRY_ACTIVE_CONTEXT_MAX_AGE_MS:-600000}"
MMDVM_LOG_FILE="${MMDVM_LOG_FILE:-}"
MMDVM_LOG_GLOB="${MMDVM_LOG_GLOB:-/var/log/pi-star/MMDVM-*.log}"
DAPNET_LOG_FILE="${DAPNET_LOG_FILE:-}"
DAPNET_LOG_GLOB="${DAPNET_LOG_GLOB:-/var/log/pi-star/DAPNETGateway-*.log}"
PAGER_EXTRA_LOG_GLOBS="${PAGER_EXTRA_LOG_GLOBS:-}"
MMDVM_LOG_SWITCH_INTERVAL_SEC="${MMDVM_LOG_SWITCH_INTERVAL_SEC:-30}"
PAGER_TELEMETRY_LOG_FULL_PAYLOAD="${PAGER_TELEMETRY_LOG_FULL_PAYLOAD:-0}"
GATEWAY_DUPLICATE_WINDOW_SEC="${GATEWAY_DUPLICATE_WINDOW_SEC:-30}"
MMDVM_TX_STARTED_COOLDOWN_SEC="${MMDVM_TX_STARTED_COOLDOWN_SEC:-3}"
MMDVM_LINK_LAST_GATEWAY_TEXT_SEC="${MMDVM_LINK_LAST_GATEWAY_TEXT_SEC:-120}"

GATEWAY_RECEIVED_REGEX="${GATEWAY_RECEIVED_REGEX:-DAPNET|POCSAG.*(queue|queued|received)}"
MMDVM_TX_STARTED_REGEX="${MMDVM_TX_STARTED_REGEX:-POCSAG.*(tx|transmit|transmitted|sending|start|starting)}"
MMDVM_TX_COMPLETED_REGEX="${MMDVM_TX_COMPLETED_REGEX:-POCSAG.*(complete|completed|sent|finish|end|stop)}"
DAPNET_GATEWAY_REGEX="${DAPNET_GATEWAY_REGEX:-Queueing message|Sending message in slot}"

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

if [[ -z "$PAGER_TELEMETRY_ACTIVE_CONTEXT_URL" ]]; then
  first_destination="${TELEMETRY_DESTINATIONS[0]}"
  if [[ "$first_destination" == *"/api/pager/telemetry"* ]]; then
    PAGER_TELEMETRY_ACTIVE_CONTEXT_URL="${first_destination/\/api\/pager\/telemetry/\/api\/pager\/telemetry\/active}"
  fi
fi

if [[ -z "$PAGER_TELEMETRY_ACTIVE_CONTEXT_URL" ]]; then
  echo "Missing active-context URL. Set PAGER_TELEMETRY_ACTIVE_CONTEXT_URL." >&2
  exit 1
fi

if ! [[ "$MMDVM_LOG_SWITCH_INTERVAL_SEC" =~ ^[0-9]+$ ]] || (( MMDVM_LOG_SWITCH_INTERVAL_SEC <= 0 )); then
  MMDVM_LOG_SWITCH_INTERVAL_SEC=30
fi
if ! [[ "$GATEWAY_DUPLICATE_WINDOW_SEC" =~ ^[0-9]+$ ]] || (( GATEWAY_DUPLICATE_WINDOW_SEC < 0 )); then
  GATEWAY_DUPLICATE_WINDOW_SEC=30
fi
if ! [[ "$MMDVM_TX_STARTED_COOLDOWN_SEC" =~ ^[0-9]+$ ]] || (( MMDVM_TX_STARTED_COOLDOWN_SEC < 0 )); then
  MMDVM_TX_STARTED_COOLDOWN_SEC=3
fi
if ! [[ "$MMDVM_LINK_LAST_GATEWAY_TEXT_SEC" =~ ^[0-9]+$ ]] || (( MMDVM_LINK_LAST_GATEWAY_TEXT_SEC < 0 )); then
  MMDVM_LINK_LAST_GATEWAY_TEXT_SEC=120
fi
if ! [[ "$PAGER_TELEMETRY_ACTIVE_CONTEXT_CACHE_SEC" =~ ^[0-9]+$ ]] || (( PAGER_TELEMETRY_ACTIVE_CONTEXT_CACHE_SEC < 0 )); then
  PAGER_TELEMETRY_ACTIVE_CONTEXT_CACHE_SEC=2
fi
if ! [[ "$PAGER_TELEMETRY_ACTIVE_CONTEXT_MAX_AGE_MS" =~ ^[0-9]+$ ]] || (( PAGER_TELEMETRY_ACTIVE_CONTEXT_MAX_AGE_MS <= 0 )); then
  PAGER_TELEMETRY_ACTIVE_CONTEXT_MAX_AGE_MS=600000
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

truncate_value() {
  local value="$1"
  local max_len="$2"
  if (( ${#value} <= max_len )); then
    printf '%s' "$value"
    return 0
  fi
  printf '%s' "${value:0:max_len}"
}

normalize_whitespace() {
  local value="$1"
  printf '%s' "$value" | tr '\n' ' ' | tr '\r' ' ' | sed 's/[[:space:]]\+/ /g' | sed 's/^ //; s/ $//'
}

sanitize_extracted_text() {
  local value="$1"
  value="$(normalize_whitespace "$value")"
  value="${value#\\\"}"
  value="${value%\\\"}"
  value="${value#\"}"
  value="${value%\"}"
  value="${value#\'}"
  value="${value%\'}"
  printf '%s' "$value"
}

extract_target_from_line() {
  local line="$1"
  if [[ "$line" =~ [Tt]o[[:space:]]+([A-Za-z0-9._:-]+) ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  if [[ "$line" =~ [Cc]allsign[[:space:]]*[:=][[:space:]]*([A-Za-z0-9._:-]+) ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  if [[ "$line" =~ [Rr][Ii][Cc][[:space:]]*[:=][[:space:]]*([A-Za-z0-9._:-]+) ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  if [[ "$line" =~ [Cc]apcode[[:space:]]*[:=][[:space:]]*([A-Za-z0-9._:-]+) ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  if [[ "$line" =~ [Rr][Ii][Cc][[:space:]]+([0-9]{3,}) ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  return 1
}

extract_text_from_line() {
  local line="$1"
  if [[ "$line" =~ [Tt]ext[[:space:]]*[:=][[:space:]]*\"([^\"]+)\" ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  if [[ "$line" =~ [Mm](essage|sg)[[:space:]]*[:=][[:space:]]*\"([^\"]+)\" ]]; then
    printf '%s' "${BASH_REMATCH[2]}"
    return 0
  fi
  if [[ "$line" =~ [Tt]ext[[:space:]]*[:=][[:space:]]*([^|,;]+) ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  if [[ "$line" =~ [Mm](essage|sg)[[:space:]]*[:=][[:space:]]*([^|,;]+) ]]; then
    printf '%s' "${BASH_REMATCH[2]}"
    return 0
  fi
  if [[ "$line" =~ [Mm]essage[^:]*:[[:space:]](.+)$ ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  if [[ "$line" =~ \'([^\']{2,})\' ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  if [[ "$line" =~ \"([^\"]{2,})\" ]]; then
    printf '%s' "${BASH_REMATCH[1]}"
    return 0
  fi
  return 1
}

build_enriched_detail() {
  local stage="$1"
  local raw_line="$2"
  local source_file="${3:-}"
  local fallback_text="${4:-}"
  local normalized_line
  local target=""
  local text=""
  local source_name=""
  local concise=""
  local normalized_stage=""

  normalized_stage="$(normalize_whitespace "$stage")"
  normalized_line="$(normalize_whitespace "$raw_line")"

  if target="$(extract_target_from_line "$raw_line")"; then
    target="$(normalize_whitespace "$target")"
    target="$(truncate_value "$target" 40)"
  fi

  if text="$(extract_text_from_line "$raw_line")"; then
    text="$(sanitize_extracted_text "$text")"
    text="$(truncate_value "$text" 120)"
  elif [[ -n "$fallback_text" ]]; then
    text="$(sanitize_extracted_text "$fallback_text")"
    text="$(truncate_value "$text" 120)"
  fi

  source_name="$(normalize_whitespace "$source_file")"
  if [[ -n "$source_name" ]]; then
    source_name="$(basename "$source_name")"
    source_name="$(truncate_value "$source_name" 48)"
  fi

  if [[ "$normalized_stage" == "gateway_received" ]]; then
    if [[ -n "$target" ]]; then
      concise="target:${target}"
    fi
    if [[ -n "$text" ]]; then
      if [[ -n "$concise" ]]; then
        concise="${concise} "
      fi
      concise="${concise}text:\"${text}\""
    fi
    if [[ -n "$source_name" ]]; then
      if [[ -n "$concise" ]]; then
        concise="${concise} "
      fi
      concise="${concise}source:${source_name}"
    fi
    if [[ -n "$concise" ]]; then
      truncate_value "$concise" 260
      return 0
    fi
  fi

  if [[ "$normalized_stage" == "mmdvm_tx_started" ]]; then
    concise="event:mmdvm_tx_started"
    if [[ -n "$text" ]]; then
      concise="${concise} text:\"${text}\""
    fi
    if [[ -n "$source_name" ]]; then
      concise="${concise} source:${source_name}"
    fi
    printf '%s' "$concise"
    return 0
  fi

  if [[ "$normalized_stage" == "mmdvm_tx_completed" ]]; then
    concise="event:mmdvm_tx_completed"
    if [[ -n "$text" ]]; then
      concise="${concise} text:\"${text}\""
    fi
    if [[ -n "$source_name" ]]; then
      concise="${concise} source:${source_name}"
    fi
    printf '%s' "$concise"
    return 0
  fi

  truncate_value "$normalized_line" 180
}

build_send_log_context() {
  local detail="$1"
  local target=""
  local text=""
  local source=""
  local context=""

  target="$(printf '%s' "$detail" | sed -n 's/.* target:\([^ ]\+\).*/\1/p' | head -n 1)"
  text="$(printf '%s' "$detail" | sed -n 's/.* text:"\([^"]\+\)".*/\1/p' | head -n 1)"
  source="$(printf '%s' "$detail" | sed -n 's/.* source:\([^ ]\+\).*/\1/p' | head -n 1)"

  target="$(normalize_whitespace "$target")"
  text="$(normalize_whitespace "$text")"
  source="$(normalize_whitespace "$source")"

  if [[ -n "$target" ]]; then
    context="${context} target=${target}"
  fi
  if [[ -n "$text" ]]; then
    text="$(truncate_value "$text" 140)"
    context="${context} text=\"${text}\""
  fi
  if [[ -n "$source" ]]; then
    context="${context} source=${source}"
  fi

  normalize_whitespace "$context"
}

send_stage_to_destination() {
  local destination="$1"
  local stage="$2"
  local at="$3"
  local detail="$4"
  local tracking_key="${5:-}"
  local curl_output=""

  if [[ -n "$tracking_key" ]]; then
    LAST_SEND_PAYLOAD=$(
      printf '{"trackingKey":"%s","stage":"%s","at":"%s","detail":"%s"}' \
        "$(json_escape "$tracking_key")" \
        "$stage" \
        "$at" \
        "$(json_escape "$detail")"
    )
  else
    LAST_SEND_PAYLOAD=$(
      printf '{"stage":"%s","at":"%s","detail":"%s"}' \
        "$stage" \
        "$at" \
        "$(json_escape "$detail")"
    )
  fi

  if curl_output="$(
    curl -fsS --max-time 6 \
      -X POST "$destination" \
      -H "Content-Type: application/json" \
      -H "x-pager-telemetry-secret: $PAGER_TELEMETRY_SECRET" \
      --data "$LAST_SEND_PAYLOAD" \
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
  local raw_line="${3:-}"
  local tracking_key="${4:-}"
  local at
  local destination
  local any_success=0
  local failure_reason=""
  local log_context=""
  local raw_line_normalized=""
  at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  log_context="$(build_send_log_context "$detail")"
  if [[ -n "$tracking_key" ]]; then
    if [[ -n "$log_context" ]]; then
      log_context="trackingKey=${tracking_key:0:12} ${log_context}"
    else
      log_context="trackingKey=${tracking_key:0:12}"
    fi
  fi
  raw_line_normalized="$(normalize_whitespace "$raw_line")"

  for destination in "${TELEMETRY_DESTINATIONS[@]}"; do
    LAST_SEND_ERROR=""
    if send_stage_to_destination "$destination" "$stage" "$at" "$detail" "$tracking_key"; then
      if [[ "$PAGER_TELEMETRY_LOG_FULL_PAYLOAD" == "1" ]]; then
        if [[ -n "$raw_line_normalized" ]]; then
          printf '%s sent %s -> %s | payload=%s | raw="%s"\n' \
            "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
            "$stage" \
            "$destination" \
            "$LAST_SEND_PAYLOAD" \
            "$raw_line_normalized"
        else
          printf '%s sent %s -> %s | payload=%s\n' \
            "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
            "$stage" \
            "$destination" \
            "$LAST_SEND_PAYLOAD"
        fi
      elif [[ -n "$log_context" ]]; then
        printf '%s sent %s -> %s | %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$stage" "$destination" "$log_context"
      else
        printf '%s sent %s -> %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$stage" "$destination"
      fi
      any_success=1
    else
      failure_reason="$LAST_SEND_ERROR"
      if [[ "$PAGER_TELEMETRY_LOG_FULL_PAYLOAD" == "1" ]]; then
        if [[ -n "$raw_line_normalized" ]]; then
          printf '%s failed %s -> %s (%s) | payload=%s | raw="%s"\n' \
            "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
            "$stage" \
            "$destination" \
            "${failure_reason:0:160}" \
            "$LAST_SEND_PAYLOAD" \
            "$raw_line_normalized" >&2
        else
          printf '%s failed %s -> %s (%s) | payload=%s\n' \
            "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
            "$stage" \
            "$destination" \
            "${failure_reason:0:160}" \
            "$LAST_SEND_PAYLOAD" >&2
        fi
      else
        printf '%s failed %s -> %s (%s)\n' \
          "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
          "$stage" \
          "$destination" \
          "${failure_reason:0:160}" >&2
      fi
    fi
  done

  if (( any_success == 0 )); then
    return 1
  fi
  return 0
}

shopt -s nocasematch

resolve_newest_matching_file() {
  local glob_pattern="$1"
  local latest=""
  local safe_glob
  safe_glob="$(trim "$glob_pattern")"
  if [[ -z "$safe_glob" ]]; then
    return 1
  fi

  latest="$(ls -1t $safe_glob 2>/dev/null | head -n 1 || true)"
  latest="$(trim "$latest")"
  if [[ -n "$latest" && -f "$latest" ]]; then
    printf '%s' "$latest"
    return 0
  fi
  return 1
}

resolve_active_log_files() {
  ACTIVE_LOG_FILES=()
  declare -A seen=()
  local candidate=""
  local extra_glob=""
  local -a extra_globs=()

  add_watch_file() {
    local maybe_file
    maybe_file="$(trim "$1")"
    if [[ -z "$maybe_file" || ! -f "$maybe_file" ]]; then
      return
    fi
    if [[ -n "${seen[$maybe_file]:-}" ]]; then
      return
    fi
    ACTIVE_LOG_FILES+=("$maybe_file")
    seen["$maybe_file"]=1
  }

  add_watch_file "$MMDVM_LOG_FILE"
  candidate="$(resolve_newest_matching_file "$MMDVM_LOG_GLOB" || true)"
  add_watch_file "$candidate"

  add_watch_file "$DAPNET_LOG_FILE"
  candidate="$(resolve_newest_matching_file "$DAPNET_LOG_GLOB" || true)"
  add_watch_file "$candidate"

  if [[ -n "$PAGER_EXTRA_LOG_GLOBS" ]]; then
    IFS=',' read -r -a extra_globs <<< "$PAGER_EXTRA_LOG_GLOBS"
    for extra_glob in "${extra_globs[@]}"; do
      candidate="$(resolve_newest_matching_file "$extra_glob" || true)"
      add_watch_file "$candidate"
    done
  fi

  if (( ${#ACTIVE_LOG_FILES[@]} > 0 )); then
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

extract_json_string_value() {
  local json="$1"
  local key="$2"
  printf '%s' "$json" | sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -n 1
}

json_has_true_flag() {
  local json="$1"
  local key="$2"
  if printf '%s' "$json" | grep -Eqi "\"${key}\"[[:space:]]*:[[:space:]]*true"; then
    return 0
  fi
  return 1
}

refresh_active_context() {
  local now_epoch
  local request_url=""
  local separator="?"
  local response_body=""
  local active_flag=0
  local tracking_key=""
  now_epoch="$(date +%s)"

  if (( PAGER_TELEMETRY_ACTIVE_CONTEXT_CACHE_SEC > 0 )) && (( now_epoch < ACTIVE_CONTEXT_CACHE_UNTIL )); then
    return 0
  fi

  request_url="$PAGER_TELEMETRY_ACTIVE_CONTEXT_URL"
  if [[ "$request_url" == *\?* ]]; then
    separator="&"
  fi
  request_url="${request_url}${separator}maxAgeMs=${PAGER_TELEMETRY_ACTIVE_CONTEXT_MAX_AGE_MS}"

  if ! response_body="$(
    curl -fsS --max-time 4 \
      -X GET "$request_url" \
      -H "x-pager-telemetry-secret: $PAGER_TELEMETRY_SECRET" \
      2>&1
  )"; then
    ACTIVE_CONTEXT_TRACKING_KEY=""
    ACTIVE_CONTEXT_LAST_ERROR="$(normalize_whitespace "$response_body")"
    ACTIVE_CONTEXT_CACHE_UNTIL=$(( now_epoch + PAGER_TELEMETRY_ACTIVE_CONTEXT_CACHE_SEC ))
    if (( now_epoch - ACTIVE_CONTEXT_LAST_ERROR_LOG_AT >= 30 )); then
      printf '%s active context lookup failed (%s)\n' \
        "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
        "${ACTIVE_CONTEXT_LAST_ERROR:0:160}" >&2
      ACTIVE_CONTEXT_LAST_ERROR_LOG_AT="$now_epoch"
    fi
    return 1
  fi

  if json_has_true_flag "$response_body" "active"; then
    active_flag=1
  fi

  if (( active_flag == 1 )); then
    tracking_key="$(extract_json_string_value "$response_body" "trackingKey")"
    tracking_key="$(trim "$tracking_key")"
  fi

  ACTIVE_CONTEXT_TRACKING_KEY="$tracking_key"
  ACTIVE_CONTEXT_CACHE_UNTIL=$(( now_epoch + PAGER_TELEMETRY_ACTIVE_CONTEXT_CACHE_SEC ))
  ACTIVE_CONTEXT_LAST_ERROR=""

  if [[ "$ACTIVE_CONTEXT_TRACKING_KEY" != "$LAST_ACTIVE_TRACKING_KEY" ]]; then
    LAST_ACTIVE_TRACKING_KEY="$ACTIVE_CONTEXT_TRACKING_KEY"
    LAST_POSTED_GATEWAY_TRACKING_KEY=""
    LAST_POSTED_MMDVM_TRACKING_KEY=""
  fi

  return 0
}

stage_bucket_for_limit() {
  local stage="$1"
  if [[ "$stage" == "gateway_received" ]]; then
    printf '%s' "gateway"
    return 0
  fi
  if [[ "$stage" == "mmdvm_tx_started" || "$stage" == "mmdvm_tx_completed" ]]; then
    printf '%s' "mmdvm"
    return 0
  fi
  printf '%s' "$stage"
}

process_log_line() {
  local line="$1"
  local source_file="${2:-}"
  local source_name=""
  local enriched_detail=""
  local extracted_gateway_text=""
  local normalized_gateway_text=""
  local now_epoch
  local fallback_text=""
  local stage=""
  local signature
  local tracking_key=""
  local stage_bucket=""

  source_name="$(basename "$(normalize_whitespace "$source_file")")"
  now_epoch="$(date +%s)"

  if [[ "$source_name" =~ DAPNET ]]; then
    if [[ "$line" =~ $DAPNET_GATEWAY_REGEX ]]; then
      extracted_gateway_text="$(extract_text_from_line "$line" || true)"
      extracted_gateway_text="$(sanitize_extracted_text "$extracted_gateway_text")"
      normalized_gateway_text="$(printf '%s' "$extracted_gateway_text" | tr '[:upper:]' '[:lower:]')"
      if [[ -z "$normalized_gateway_text" ]]; then
        return 0
      fi
      if [[ "$normalized_gateway_text" == "$LAST_GATEWAY_TEXT_KEY" ]] && \
        (( GATEWAY_DUPLICATE_WINDOW_SEC > 0 )) && \
        (( now_epoch - LAST_GATEWAY_TEXT_AT < GATEWAY_DUPLICATE_WINDOW_SEC )); then
        return 0
      fi
      LAST_GATEWAY_TEXT_KEY="$normalized_gateway_text"
      LAST_GATEWAY_TEXT_RAW="$extracted_gateway_text"
      LAST_GATEWAY_TEXT_AT="$now_epoch"
      stage="gateway_received"
    fi
  elif [[ "$line" =~ $MMDVM_TX_COMPLETED_REGEX ]]; then
    if (( MMDVM_LINK_LAST_GATEWAY_TEXT_SEC > 0 )) && \
      (( now_epoch - LAST_GATEWAY_TEXT_AT <= MMDVM_LINK_LAST_GATEWAY_TEXT_SEC )); then
      fallback_text="$LAST_GATEWAY_TEXT_RAW"
    fi
    stage="mmdvm_tx_completed"
  elif [[ "$line" =~ $MMDVM_TX_STARTED_REGEX ]]; then
    if (( MMDVM_TX_STARTED_COOLDOWN_SEC > 0 )) && \
      (( now_epoch - LAST_MMDVM_TX_STARTED_AT < MMDVM_TX_STARTED_COOLDOWN_SEC )); then
      return 0
    fi
    if (( MMDVM_LINK_LAST_GATEWAY_TEXT_SEC > 0 )) && \
      (( now_epoch - LAST_GATEWAY_TEXT_AT <= MMDVM_LINK_LAST_GATEWAY_TEXT_SEC )); then
      fallback_text="$LAST_GATEWAY_TEXT_RAW"
    fi
    LAST_MMDVM_TX_STARTED_AT="$now_epoch"
    stage="mmdvm_tx_started"
  elif [[ "$line" =~ $GATEWAY_RECEIVED_REGEX ]]; then
    stage="gateway_received"
  fi

  if [[ -z "$stage" ]]; then
    return 0
  fi

  signature="$stage|$source_file|$line"
  if [[ "$signature" == "$LAST_SIGNATURE" ]]; then
    return 0
  fi
  LAST_SIGNATURE="$signature"

  if ! refresh_active_context; then
    return 0
  fi
  tracking_key="$ACTIVE_CONTEXT_TRACKING_KEY"
  if [[ -z "$tracking_key" ]]; then
    return 0
  fi

  stage_bucket="$(stage_bucket_for_limit "$stage")"
  if [[ "$stage_bucket" == "gateway" && "$LAST_POSTED_GATEWAY_TRACKING_KEY" == "$tracking_key" ]]; then
    return 0
  fi
  if [[ "$stage_bucket" == "mmdvm" && "$LAST_POSTED_MMDVM_TRACKING_KEY" == "$tracking_key" ]]; then
    return 0
  fi

  enriched_detail="$(build_enriched_detail "$stage" "$line" "$source_file" "$fallback_text")"
  if post_stage "$stage" "$enriched_detail" "$line" "$tracking_key"; then
    if [[ "$stage_bucket" == "gateway" ]]; then
      LAST_POSTED_GATEWAY_TRACKING_KEY="$tracking_key"
    fi
    if [[ "$stage_bucket" == "mmdvm" ]]; then
      LAST_POSTED_MMDVM_TRACKING_KEY="$tracking_key"
    fi
  fi
}

for destination in "${TELEMETRY_DESTINATIONS[@]}"; do
  echo "Telemetry destination: $destination"
done
echo "Active context URL: $PAGER_TELEMETRY_ACTIVE_CONTEXT_URL"
echo "Active context cache: ${PAGER_TELEMETRY_ACTIVE_CONTEXT_CACHE_SEC}s"
echo "Active context max age: ${PAGER_TELEMETRY_ACTIVE_CONTEXT_MAX_AGE_MS}ms"

echo "MMDVM explicit file: ${MMDVM_LOG_FILE:-<none>}"
echo "MMDVM rotating glob: $MMDVM_LOG_GLOB"
echo "DAPNET explicit file: ${DAPNET_LOG_FILE:-<none>}"
echo "DAPNET rotating glob: $DAPNET_LOG_GLOB"
echo "DAPNET gateway regex: $DAPNET_GATEWAY_REGEX"
if [[ -n "$PAGER_EXTRA_LOG_GLOBS" ]]; then
  echo "Extra log globs: $PAGER_EXTRA_LOG_GLOBS"
fi

CURRENT_WATCH_KEY=""
LAST_SIGNATURE=""
LAST_SEND_ERROR=""
LAST_SEND_PAYLOAD=""
LAST_TAIL_SOURCE=""
LAST_GATEWAY_TEXT_KEY=""
LAST_GATEWAY_TEXT_RAW=""
LAST_GATEWAY_TEXT_AT=0
LAST_MMDVM_TX_STARTED_AT=0
ACTIVE_CONTEXT_TRACKING_KEY=""
ACTIVE_CONTEXT_LAST_ERROR=""
ACTIVE_CONTEXT_CACHE_UNTIL=0
ACTIVE_CONTEXT_LAST_ERROR_LOG_AT=0
LAST_ACTIVE_TRACKING_KEY=""
LAST_POSTED_GATEWAY_TRACKING_KEY=""
LAST_POSTED_MMDVM_TRACKING_KEY=""
TAIL_PID=""
TAIL_FD=""
NEXT_SWITCH_CHECK_EPOCH=0

while true; do
  NOW_EPOCH="$(date +%s)"
  ACTIVE_LOG_FILES=()
  resolve_active_log_files || true

  if (( ${#ACTIVE_LOG_FILES[@]} == 0 )); then
    if [[ -n "$TAIL_PID" || -n "$TAIL_FD" ]]; then
      stop_tail_reader "$TAIL_PID" "$TAIL_FD"
      TAIL_PID=""
      TAIL_FD=""
      CURRENT_WATCH_KEY=""
      LAST_SIGNATURE=""
      LAST_TAIL_SOURCE=""
    fi
    echo "No matching telemetry logs found. Checked MMDVM/DAPNET files and globs. Retrying in 5s..."
    sleep 5
    continue
  fi

  ACTIVE_WATCH_KEY="$(printf '%s|' "${ACTIVE_LOG_FILES[@]}")"

  if [[ "$ACTIVE_WATCH_KEY" != "$CURRENT_WATCH_KEY" || -z "$TAIL_PID" ]] || ! kill -0 "$TAIL_PID" 2>/dev/null; then
    stop_tail_reader "$TAIL_PID" "$TAIL_FD"
    CURRENT_WATCH_KEY="$ACTIVE_WATCH_KEY"
    LAST_SIGNATURE=""
    LAST_TAIL_SOURCE=""
    for watch_file in "${ACTIVE_LOG_FILES[@]}"; do
      echo "Watching $watch_file for pager telemetry patterns..."
    done
    coproc TAIL_READER { exec tail -n0 -F "${ACTIVE_LOG_FILES[@]}"; }
    TAIL_PID="$TAIL_READER_PID"
    TAIL_FD="${TAIL_READER[0]}"
    NEXT_SWITCH_CHECK_EPOCH=$(( NOW_EPOCH + MMDVM_LOG_SWITCH_INTERVAL_SEC ))
  fi

  if read -r -t 1 -u "$TAIL_FD" LOG_LINE; then
    if [[ "$LOG_LINE" =~ ^==\>[[:space:]](.+)[[:space:]]\<==$ ]]; then
      LAST_TAIL_SOURCE="${BASH_REMATCH[1]}"
    elif [[ "$LOG_LINE" =~ ^==\>[[:space:]](.+)[[:space:]]\<==[[:space:]]*$ ]]; then
      LAST_TAIL_SOURCE="${BASH_REMATCH[1]}"
    else
      process_log_line "$LOG_LINE" "$LAST_TAIL_SOURCE"
    fi
  fi

  NOW_EPOCH="$(date +%s)"
  if (( NOW_EPOCH >= NEXT_SWITCH_CHECK_EPOCH )); then
    NEXT_SWITCH_CHECK_EPOCH=$(( NOW_EPOCH + MMDVM_LOG_SWITCH_INTERVAL_SEC ))
    ACTIVE_LOG_FILES=()
    resolve_active_log_files || true
    NEXT_WATCH_KEY="$(printf '%s|' "${ACTIVE_LOG_FILES[@]}")"
    if [[ -n "$NEXT_WATCH_KEY" && "$NEXT_WATCH_KEY" != "$CURRENT_WATCH_KEY" ]]; then
      echo "Detected telemetry log set change; reloading tail watchers."
      stop_tail_reader "$TAIL_PID" "$TAIL_FD"
      TAIL_PID=""
      TAIL_FD=""
      CURRENT_WATCH_KEY=""
      LAST_SIGNATURE=""
      LAST_TAIL_SOURCE=""
    fi
  fi
done
