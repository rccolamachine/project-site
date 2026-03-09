import styles from "../pager.module.css";

function formatTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleTimeString();
}

function getFlowState(flow, progress, sending) {
  if (flow === "preflight") {
    if (progress.errorStep === 0 || progress.errorStep === 1) return "error";
    if (progress.completedStep >= 1) return "done";
    if (sending && (progress.activeStep === 0 || progress.activeStep === 1)) {
      return "active";
    }
    return "pending";
  }

  if (flow === "api_send") {
    if (progress.errorStep === 2) return "error";
    if (progress.completedStep >= 2) return "done";
    if (sending && progress.activeStep === 2) return "active";
    return "pending";
  }

  if (flow === "upstream_accept") {
    if (progress.errorStep >= 3) return "error";
    if (progress.completedStep >= 4) return "done";
    return "pending";
  }

  return "pending";
}

function normalizeForMatch(value) {
  return String(value || "")
    .trim()
    .replace(/^"+|"+$/g, "")
    .replace(/^'+|'+$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function extractTextFromDetail(detail) {
  const raw = String(detail || "");
  const quoted = raw.match(/text:"([^"]+)"/i);
  if (quoted?.[1]) return quoted[1].trim();
  const loose = raw.match(/text:([^|]+?)(?:\s+source:|$)/i);
  if (loose?.[1]) return loose[1].trim();
  return "";
}

function getSummary(progress, sending, telemetryStatus) {
  if (progress.cancelled) return "Cancelled before sending.";
  if (progress.errorMessage) return progress.errorMessage;

  if (sending && (progress.activeStep === 0 || progress.activeStep === 1)) {
    return "Preparing pager message...";
  }
  if (sending && progress.activeStep === 2) {
    return "Sending pager message...";
  }

  if (progress.completedStep >= 4 && progress.successTimestamp) {
    if (telemetryStatus.confirmation === "full") {
      return `Pager message sent at ${progress.successTimestamp}. Pi-Star MMDVM send and DAPNET gateway text match confirmed.`;
    }
    if (telemetryStatus.confirmation === "mmdvm_only") {
      return `Pager message sent at ${progress.successTimestamp}. Pi-Star MMDVM send confirmed; waiting for DAPNET text match.`;
    }
    if (telemetryStatus.confirmation === "dapnet_only") {
      return `Pager message sent at ${progress.successTimestamp}. DAPNET gateway saw matching text; waiting for Pi-Star MMDVM TX event.`;
    }
    if (telemetryStatus.tone === "active") {
      return `Pager message sent at ${progress.successTimestamp}. Waiting for radio telemetry...`;
    }
    return `Pager message sent at ${progress.successTimestamp}.`;
  }

  if (sending) return "Sending pager message...";
  return "Ready to send.";
}

function getSummaryTone(progress, sending, telemetryStatus) {
  if (progress.errorMessage) return "error";
  if (progress.cancelled) return "muted";
  if (progress.completedStep >= 4) {
    if (telemetryStatus?.tone === "done") return "success";
    if (telemetryStatus?.tone === "active") return "active";
    if (telemetryStatus?.tone === "error") return "error";
    return "success";
  }
  if (sending) return "active";
  return "muted";
}

function getTelemetryStatus(telemetry) {
  if (!telemetry) {
    return {
      tone: "pending",
      detail: "Starts after upstream acceptance.",
      confirmation: "none",
    };
  }

  if (!telemetry.telemetryConfigured) {
    return {
      tone: "pending",
      detail: "Telemetry hook is not configured.",
      confirmation: "none",
    };
  }

  if (telemetry.error) {
    return {
      tone: "error",
      detail: telemetry.error,
      confirmation: "none",
    };
  }

  const stages = telemetry.stages || {};
  const gatewayAt = String(stages?.gateway_received?.at || "").trim();
  const txStartedAt = String(stages?.mmdvm_tx_started?.at || "").trim();
  const txCompletedAt = String(stages?.mmdvm_tx_completed?.at || "").trim();
  const expectedText = normalizeForMatch(telemetry?.expectedText);
  const gatewayDetailText = extractTextFromDetail(stages?.gateway_received?.detail);
  const gatewayDetailTextNormalized = normalizeForMatch(gatewayDetailText);
  const gatewayTextMatched =
    Boolean(gatewayAt) &&
    Boolean(expectedText) &&
    Boolean(gatewayDetailTextNormalized) &&
    gatewayDetailTextNormalized === expectedText;

  const mmdvmConfirmed = Boolean(txStartedAt || txCompletedAt);

  if (mmdvmConfirmed && gatewayTextMatched) {
    return {
      tone: "done",
      detail:
        txCompletedAt
          ? `Pi-Star MMDVM send confirmed at ${formatTime(
              txStartedAt || txCompletedAt,
            )}. DAPNET gateway confirmed matching text at ${formatTime(gatewayAt)}.`
          : `Pi-Star MMDVM send confirmed at ${formatTime(
              txStartedAt,
            )}. DAPNET gateway confirmed matching text at ${formatTime(gatewayAt)}.`,
      confirmation: "full",
    };
  }

  if (mmdvmConfirmed && gatewayAt && !gatewayTextMatched) {
    return {
      tone: "active",
      detail:
        "Pi-Star MMDVM send confirmed, but DAPNET gateway text did not match this message yet.",
      confirmation: "mmdvm_only",
    };
  }

  if (mmdvmConfirmed) {
    return {
      tone: "active",
      detail: `Pi-Star MMDVM send confirmed at ${formatTime(
        txStartedAt || txCompletedAt,
      )}. Waiting for DAPNET gateway text match.`,
      confirmation: "mmdvm_only",
    };
  }

  if (gatewayTextMatched) {
    return {
      tone: "active",
      detail: `DAPNET gateway confirmed matching text at ${formatTime(
        gatewayAt,
      )}. Waiting for Pi-Star MMDVM TX event.`,
      confirmation: "dapnet_only",
    };
  }

  if (gatewayAt) {
    return {
      tone: "active",
      detail: "DAPNET gateway event observed; waiting for text match and Pi-Star TX event.",
      confirmation: "none",
    };
  }

  if (telemetry.polling) {
    return {
      tone: "active",
      detail: "Polling Pi-Star/MMDVM events...",
      confirmation: "none",
    };
  }

  return {
    tone: "pending",
    detail: "No Pi-Star/MMDVM events received yet.",
    confirmation: "none",
  };
}

export default function PagerStatusTimeline({ progress, sending, telemetry }) {
  const telemetryStatus = getTelemetryStatus(telemetry);
  const summary = getSummary(progress, sending, telemetryStatus);
  const summaryTone = getSummaryTone(progress, sending, telemetryStatus);

  const groupedRows = [
    {
      title: "Preflight checks",
      detail: "Validate text and endpoint credentials.",
      state: getFlowState("preflight", progress, sending),
    },
    {
      title: "API send",
      detail: "Send POST /api/pager and await upstream acceptance.",
      state: getFlowState("api_send", progress, sending),
    },
    {
      title: "Upstream queue",
      detail: "HamPager/DAPNET accepted and queued for RF.",
      state: getFlowState("upstream_accept", progress, sending),
    },
    {
      title: "Radio telemetry",
      detail: telemetryStatus.detail,
      state: telemetryStatus.tone,
    },
  ];

  return (
    <section className={styles.statusPanel} aria-live="polite">
      <div className={styles.statusHeader}>Transmission status</div>

      <ol className={styles.statusList}>
        {groupedRows.map((row) => {
          return (
            <li key={row.title} className={styles.statusItem}>
              <span className={styles.statusDot} data-state={row.state} />
              <div>
                <div className={styles.statusTitle}>{row.title}</div>
                <div className={styles.statusDetail}>{row.detail}</div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className={styles.statusSummary} data-tone={summaryTone}>
        {summary}
      </div>
    </section>
  );
}
