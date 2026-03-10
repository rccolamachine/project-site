import Image from "next/image";
import { useEffect, useRef } from "react";
import styles from "../pager.module.css";
import { isPagerGatewayTextMatch, safeTrim } from "@/lib/pagerTelemetryUtils";

function formatTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleTimeString();
}

function getStateTimeLabel(state, timestamp) {
  const safeTimestamp = String(timestamp || "").trim();
  if (!safeTimestamp) return "";
  const formattedTime = formatTime(safeTimestamp);
  if (!formattedTime) return "";

  if (state === "done") return `completed ${formattedTime}`;
  if (state === "error") return `failed ${formattedTime}`;
  if (state === "active") return `in progress ${formattedTime}`;
  return `updated ${formattedTime}`;
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

function getMessageState(progress) {
  const sentAt = String(progress?.stageTimestamps?.send_message || "").trim();
  if (!sentAt) return "pending";
  return "done";
}

function getSummary(progress, sending, telemetryStatus) {
  const specificError = String(progress?.errorMessage || "").trim();
  if (specificError) return specificError;
  if (telemetryStatus?.tone === "error") {
    return String(telemetryStatus?.detail || "").trim() || "Message send failed.";
  }
  if (progress?.errorStep >= 0) return "Message send failed.";
  if (progress?.cancelled) return "Message send failed.";
  if (telemetryStatus?.confirmation === "full") return "Message send complete.";
  if (sending || progress?.completedStep >= 0) return "Message send in progress.";
  return "Message send in progress.";
}

function getSummaryTone(progress, sending, telemetryStatus) {
  if (progress?.errorMessage) return "error";
  if (telemetryStatus?.tone === "error") return "error";
  if (progress?.errorStep >= 0) return "error";
  if (progress?.cancelled) return "error";
  if (telemetryStatus?.confirmation === "full") return "success";
  if (sending || progress?.completedStep >= 0) return "active";
  return "muted";
}

function getStatusIcon(state) {
  if (state === "error") return "X";
  if (state === "done") return "OK";
  if (state === "active") return "...";
  return "-";
}

function getTelemetryStatus(telemetry) {
  if (!telemetry) {
    return {
      tone: "pending",
      detail: "Broadcast message to pager.",
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
  const gatewayAt = safeTrim(stages?.gateway_received?.at);
  const txStartedAt = safeTrim(stages?.mmdvm_tx_started?.at);
  const txCompletedAt = safeTrim(stages?.mmdvm_tx_completed?.at);
  const gatewayTextMatched = isPagerGatewayTextMatch({
    stages,
    expectedText: telemetry?.expectedText,
  });

  const mmdvmConfirmed = Boolean(txStartedAt || txCompletedAt);

  if (mmdvmConfirmed && gatewayTextMatched) {
    return {
      tone: "done",
      detail: "Pi-Star MMDVM send and DAPNET gateway text match confirmed.",
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
      detail: "Pi-Star MMDVM send confirmed. Waiting for DAPNET gateway text match.",
      confirmation: "mmdvm_only",
    };
  }

  if (gatewayTextMatched) {
    return {
      tone: "active",
      detail: "DAPNET gateway confirmed matching text. Waiting for Pi-Star MMDVM TX event.",
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
  const screenOverlayRef = useRef(null);
  const previousVisibleCountRef = useRef(0);
  const telemetryStatus = getTelemetryStatus(telemetry);
  const summary = getSummary(progress, sending, telemetryStatus);
  const summaryTone = getSummaryTone(progress, sending, telemetryStatus);
  const stageTimestamps =
    progress?.stageTimestamps &&
    typeof progress.stageTimestamps === "object" &&
    !Array.isArray(progress.stageTimestamps)
      ? progress.stageTimestamps
      : {};
  const telemetryStages =
    telemetry?.stages &&
    typeof telemetry.stages === "object" &&
    !Array.isArray(telemetry.stages)
      ? telemetry.stages
      : {};

  const radioTimestamp =
    String(telemetryStages?.mmdvm_tx_completed?.at || "").trim() ||
    String(telemetryStages?.mmdvm_tx_started?.at || "").trim() ||
    String(telemetryStages?.gateway_received?.at || "").trim();

  const retryCount = Math.max(0, Number(progress?.retryCount || 0));
  const apiSendDetail =
    retryCount > 0
      ? `Send POST /api/pager and await upstream acceptance. Auto-retry ${retryCount}/2.`
      : "Send POST /api/pager and await upstream acceptance.";

  const groupedRows = [
    {
      key: "submit_message",
      title: "Submit message",
      detail: `Submit message: ${progress?.sentText ? `\"${progress.sentText}\"` : "(no text)"}`,
      state: getMessageState(progress),
      timestamp: stageTimestamps.send_message || "",
      used: Boolean(stageTimestamps.send_message),
    },
    {
      key: "preflight",
      title: "Preflight checks",
      detail: "Validate text and endpoint credentials.",
      state: getFlowState("preflight", progress, sending),
      timestamp: stageTimestamps.preflight || "",
      used: Boolean(stageTimestamps.preflight),
    },
    {
      key: "api_send",
      title: "API send",
      detail: apiSendDetail,
      state: getFlowState("api_send", progress, sending),
      timestamp: stageTimestamps.api_send || "",
      used:
        Boolean(stageTimestamps.api_send) ||
        progress.activeStep >= 2 ||
        progress.completedStep >= 2 ||
        progress.errorStep === 2,
    },
    {
      key: "upstream_queue",
      title: "Upstream queue",
      detail: "Send DAPNET-accepted message to Pi-star radio.",
      state: getFlowState("upstream_accept", progress, sending),
      timestamp:
        String(telemetry?.acceptedAt || "").trim() ||
        String(stageTimestamps.upstream_accept || "").trim(),
      used:
        Boolean(telemetry?.acceptedAt) ||
        Boolean(stageTimestamps.upstream_accept) ||
        progress.completedStep >= 4 ||
        progress.errorStep >= 3,
    },
    {
      key: "radio_telemetry",
      title: "Radio telemetry",
      detail: telemetryStatus.detail,
      state: telemetryStatus.tone,
      timestamp: radioTimestamp,
      used:
        Boolean(telemetry) &&
        (Boolean(telemetry?.polling) ||
          Boolean(telemetry?.error) ||
          Boolean(radioTimestamp) ||
          telemetryStatus.confirmation !== "none"),
    },
  ];

  const visibleRows = groupedRows.filter((row) => row.used).slice(0, 5);

  useEffect(() => {
    const nextCount = visibleRows.length;
    if (nextCount > previousVisibleCountRef.current && screenOverlayRef.current) {
      screenOverlayRef.current.scrollTo({
        top: screenOverlayRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
    previousVisibleCountRef.current = nextCount;
  }, [visibleRows.length]);

  return (
    <section className={styles.statusPanel} aria-live="polite">
      <div className={styles.pagerDeviceWrap}>
        <Image
          src="/pager/gp2009N.png"
          alt="Pager device showing transmission status"
          width={1536}
          height={1024}
          className={styles.pagerDeviceImage}
        />
        <div className={styles.pagerScreenOverlay} ref={screenOverlayRef}>
          <div className={styles.pagerScreenHeader}>Transmission status</div>
          <ol className={styles.pagerScreenList}>
            {visibleRows.map((row) => {
              const rowTimeLabel = getStateTimeLabel(row.state, row.timestamp);
              return (
                <li key={row.key} className={styles.pagerScreenItem}>
                  <span className={styles.pagerScreenIcon} data-state={row.state}>
                    {getStatusIcon(row.state)}
                  </span>
                  <span className={styles.pagerScreenText}>
                    <span className={styles.pagerScreenTextPrimary}>{row.title}</span>
                    {row.detail ? (
                      <span className={styles.pagerScreenTextDetail}>{row.detail}</span>
                    ) : null}
                    {rowTimeLabel ? (
                      <span className={styles.pagerScreenTextMeta}>{rowTimeLabel}</span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ol>
          <div className={styles.pagerScreenSummary} data-tone={summaryTone}>
            {summary}
          </div>
        </div>
      </div>
    </section>
  );
}
