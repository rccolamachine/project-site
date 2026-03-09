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

function getSummary(progress, sending, telemetryStatus, telemetry) {
  if (progress.cancelled) return "Cancelled before sending.";
  if (progress.errorMessage) return progress.errorMessage;

  if (sending && (progress.activeStep === 0 || progress.activeStep === 1)) {
    return "Preparing pager message...";
  }
  if (sending && progress.activeStep === 2) {
    return "Sending pager message...";
  }

  if (progress.completedStep >= 4 && progress.successTimestamp) {
    const completedAt = String(telemetry?.stages?.mmdvm_tx_completed?.at || "").trim();
    const startedAt = String(telemetry?.stages?.mmdvm_tx_started?.at || "").trim();
    const gatewayAt = String(telemetry?.stages?.gateway_received?.at || "").trim();

    if (completedAt) {
      return `Pager message sent at ${progress.successTimestamp}. Radio TX completed at ${formatTime(completedAt)}.`;
    }
    if (startedAt) {
      return `Pager message sent at ${progress.successTimestamp}. Radio TX started at ${formatTime(startedAt)}.`;
    }
    if (gatewayAt) {
      return `Pager message sent at ${progress.successTimestamp}. Gateway received at ${formatTime(gatewayAt)}.`;
    }
    if (telemetryStatus.tone === "active") {
      return `Pager message sent at ${progress.successTimestamp}. Waiting for radio telemetry...`;
    }
    return `Pager message sent at ${progress.successTimestamp}.`;
  }

  if (sending) return "Sending pager message...";
  return "Ready to send.";
}

function getSummaryTone(progress, sending) {
  if (progress.errorMessage) return "error";
  if (progress.cancelled) return "muted";
  if (progress.completedStep >= 4) return "success";
  if (sending) return "active";
  return "muted";
}

function getTelemetryStatus(telemetry) {
  if (!telemetry) {
    return {
      tone: "pending",
      detail: "Starts after upstream acceptance.",
    };
  }

  if (!telemetry.telemetryConfigured) {
    return {
      tone: "pending",
      detail: "Telemetry hook is not configured.",
    };
  }

  if (telemetry.error) {
    return {
      tone: "error",
      detail: telemetry.error,
    };
  }

  const stages = telemetry.stages || {};
  const gatewayAt = String(stages?.gateway_received?.at || "").trim();
  const txStartedAt = String(stages?.mmdvm_tx_started?.at || "").trim();
  const txCompletedAt = String(stages?.mmdvm_tx_completed?.at || "").trim();

  if (txCompletedAt) {
    return {
      tone: "done",
      detail: `Gateway received, TX started, TX completed at ${formatTime(txCompletedAt)}.`,
    };
  }

  const confirmed = [];
  if (gatewayAt) confirmed.push("gateway received");
  if (txStartedAt) confirmed.push("TX started");

  if (confirmed.length > 0) {
    return {
      tone: "active",
      detail: `Confirmed: ${confirmed.join(", ")}. Waiting for TX completion.`,
    };
  }

  if (telemetry.polling) {
    return {
      tone: "active",
      detail: "Polling Pi-Star/MMDVM events...",
    };
  }

  return {
    tone: "pending",
    detail: "No Pi-Star/MMDVM events received yet.",
  };
}

export default function PagerStatusTimeline({ progress, sending, telemetry }) {
  const telemetryStatus = getTelemetryStatus(telemetry);
  const summary = getSummary(progress, sending, telemetryStatus, telemetry);
  const summaryTone = getSummaryTone(progress, sending);

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
