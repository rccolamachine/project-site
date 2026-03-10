"use client";

import { useEffect, useRef, useState } from "react";
import PageIntro from "@/components/PageIntro";
import PagerArchitectureDiagram from "./components/PagerArchitectureDiagram";
import PagerStatusTimeline from "./components/PagerStatusTimeline";
import { isPagerTelemetryFullConfirmation } from "@/lib/pagerTelemetryUtils";
import { fetchPagerDeliveryStatus, sendPagerMessage } from "./pagerApi";
import {
  clampPagerText,
  MAX_PAGER_TEXT_LENGTH,
  promptForPagerCredentials,
  validatePagerText,
} from "./pagerUtils";
import styles from "./pager.module.css";

const INITIAL_PROGRESS = {
  activeStep: -1,
  completedStep: -1,
  errorStep: -1,
  errorMessage: "",
  cancelled: false,
  successTimestamp: "",
  sentText: "",
  retryCount: 0,
  stageTimestamps: {
    send_message: "",
    preflight: "",
    api_send: "",
    upstream_accept: "",
  },
};

const TELEMETRY_CONFIRMATION_RETRY_DELAY_MS = 30_000;
const MAX_PAGER_AUTO_RETRIES = 2;

function formatPagerTimestamp(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString();
}

export default function PagerPage() {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showArchitecture, setShowArchitecture] = useState(true);
  const [progress, setProgress] = useState(INITIAL_PROGRESS);
  const [telemetry, setTelemetry] = useState(null);
  const telemetryTimerRef = useRef(null);
  const retryTimerRef = useRef(null);
  const telemetryPollRef = useRef({
    attempts: 0,
    text: "",
    timestamp: "",
  });
  const telemetrySnapshotRef = useRef({
    stages: {},
    expectedText: "",
    full: false,
  });
  const retrySessionRef = useRef({
    active: false,
    text: "",
    username: "",
    password: "",
    retriesUsed: 0,
  });

  const trimmedText = text.trim();
  const remaining = Math.max(0, MAX_PAGER_TEXT_LENGTH - text.length);
  const canSend =
    !sending &&
    trimmedText.length > 0 &&
    text.length <= MAX_PAGER_TEXT_LENGTH;

  const stopTelemetryPolling = () => {
    if (telemetryTimerRef.current) {
      clearInterval(telemetryTimerRef.current);
      telemetryTimerRef.current = null;
    }
  };

  const stopRetryTimer = () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  const clearRetrySession = () => {
    retrySessionRef.current = {
      active: false,
      text: "",
      username: "",
      password: "",
      retriesUsed: 0,
    };
  };

  const updateTelemetrySnapshot = (stages, expectedText) => {
    const safeStages =
      stages && typeof stages === "object" && !Array.isArray(stages) ? stages : {};
    const safeExpectedText = String(expectedText || "").trim();
    const full = isPagerTelemetryFullConfirmation({
      stages: safeStages,
      expectedText: safeExpectedText,
    });
    telemetrySnapshotRef.current = {
      stages: safeStages,
      expectedText: safeExpectedText,
      full,
    };
    return full;
  };

  useEffect(() => {
    return () => {
      stopTelemetryPolling();
      stopRetryTimer();
    };
  }, []);

  const applyTelemetrySnapshot = (snapshot) => {
    setTelemetry((prev) => ({
      ...prev,
      telemetryConfigured: Boolean(snapshot?.telemetryConfigured),
      stages:
        snapshot?.stages && typeof snapshot.stages === "object" ? snapshot.stages : {},
      acceptedAt: String(snapshot?.acceptedAt || ""),
      updatedAt: String(snapshot?.updatedAt || ""),
      error: "",
      polling: true,
    }));
    updateTelemetrySnapshot(snapshot?.stages, telemetryPollRef.current?.text);
  };

  const getErrorStep = (message) => {
    const msg = String(message || "");
    if (
      msg.includes("Text is required") ||
      msg.includes("characters or fewer") ||
      msg.includes('only the "text" field')
    ) {
      return 0;
    }

    if (
      msg.includes("Username and password are required") ||
      msg.includes("Invalid credentials")
    ) {
      return 1;
    }

    if (msg.includes("Failed to send pager call") || msg.includes("Upstream")) {
      return 3;
    }

    return 2;
  };

  const setErrorState = (step, message, completedStep = -1) => {
    stopRetryTimer();
    clearRetrySession();
    setProgress((prev) => ({
      ...INITIAL_PROGRESS,
      activeStep: step,
      completedStep,
      errorStep: step,
      errorMessage: message,
      sentText: String(prev?.sentText || "").trim(),
      retryCount: Number(prev?.retryCount || 0),
      stageTimestamps: {
        ...INITIAL_PROGRESS.stageTimestamps,
        ...(prev?.stageTimestamps || {}),
      },
    }));
  };

  const scheduleAutoRetryCheck = () => {
    stopRetryTimer();
    retryTimerRef.current = setTimeout(() => {
      const session = retrySessionRef.current;
      if (!session.active) return;
      if (telemetrySnapshotRef.current.full) return;
      if (session.retriesUsed >= MAX_PAGER_AUTO_RETRIES) return;

      const runRetry = async () => {
        const retryAttempt = session.retriesUsed + 1;
        session.retriesUsed = retryAttempt;
        const retryApiAt = new Date().toISOString();

        setSending(true);
        setProgress((prev) => ({
          ...prev,
          activeStep: 2,
          completedStep: Math.max(1, prev?.completedStep ?? -1),
          errorStep: -1,
          errorMessage: "",
          retryCount: retryAttempt,
          stageTimestamps: {
            ...INITIAL_PROGRESS.stageTimestamps,
            ...(prev?.stageTimestamps || {}),
            api_send: retryApiAt,
          },
        }));

        try {
          const payload = await sendPagerMessage({
            text: session.text,
            username: session.username,
            password: session.password,
          });

          const upstreamAt =
            String(payload.timestamp || "").trim() || new Date().toISOString();

          setProgress((prev) => ({
            ...prev,
            activeStep: -1,
            completedStep: 4,
            errorStep: -1,
            errorMessage: "",
            cancelled: false,
            successTimestamp: formatPagerTimestamp(upstreamAt),
            sentText: String(payload.text || prev?.sentText || session.text).trim(),
            retryCount: retryAttempt,
            stageTimestamps: {
              ...INITIAL_PROGRESS.stageTimestamps,
              ...(prev?.stageTimestamps || {}),
              upstream_accept: upstreamAt,
            },
          }));

          beginTelemetryPolling({
            text: payload.text || session.text,
            timestamp: payload.timestamp,
          });
          scheduleAutoRetryCheck();
        } catch (err) {
          const message = err?.message || String(err);
          const step = getErrorStep(message);
          const completedStep = Math.max(-1, step - 1);
          setErrorState(step, `Auto-retry ${retryAttempt} failed: ${message}`, completedStep);
        } finally {
          setSending(false);
        }
      };

      runRetry().catch(() => {});
    }, TELEMETRY_CONFIRMATION_RETRY_DELAY_MS);
  };

  const beginTelemetryPolling = ({ text: nextText, timestamp }) => {
    const safeText = String(nextText || "").trim();
    const safeTimestamp = String(timestamp || "").trim();
    if (!safeText || !safeTimestamp) {
      setTelemetry(null);
      return;
    }

    stopTelemetryPolling();
    telemetryPollRef.current = { attempts: 0, text: safeText, timestamp: safeTimestamp };
    updateTelemetrySnapshot({}, safeText);
    setTelemetry({
      expectedText: safeText,
      polling: true,
      telemetryConfigured: false,
      stages: {},
      acceptedAt: "",
      updatedAt: "",
      error: "",
    });

    const poll = async () => {
      const current = telemetryPollRef.current;
      current.attempts += 1;

      try {
        const snapshot = await fetchPagerDeliveryStatus({
          text: current.text,
          timestamp: current.timestamp,
        });

        if (snapshot?.notFound) {
          updateTelemetrySnapshot({}, current.text);
          setTelemetry((prev) => ({
            ...prev,
            telemetryConfigured: Boolean(snapshot.telemetryConfigured),
            polling: current.attempts < 30,
          }));
        } else if (snapshot?.ok) {
          applyTelemetrySnapshot(snapshot);

          if (updateTelemetrySnapshot(snapshot?.stages, current.text)) {
            stopTelemetryPolling();
            stopRetryTimer();
            clearRetrySession();
            setTelemetry((prev) => ({ ...prev, polling: false }));
            return;
          }
        }
      } catch (err) {
        const message = err?.message || String(err);
        setTelemetry((prev) => ({
          ...prev,
          error: message,
          polling: current.attempts < 30,
        }));
      }

      if (current.attempts >= 30) {
        stopTelemetryPolling();
        setTelemetry((prev) => ({ ...prev, polling: false }));
      }
    };

    poll().catch(() => {});
    telemetryTimerRef.current = setInterval(() => {
      poll().catch(() => {});
    }, 4000);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    stopTelemetryPolling();
    stopRetryTimer();
    clearRetrySession();
    setTelemetry(null);
    const preflightAt = new Date().toISOString();
    const safeSendText = String(trimmedText || "").trim();
    setProgress({
      ...INITIAL_PROGRESS,
      activeStep: 0,
      sentText: safeSendText,
      stageTimestamps: {
        ...INITIAL_PROGRESS.stageTimestamps,
        send_message: preflightAt,
        preflight: preflightAt,
      },
    });

    const validationError = validatePagerText(text);
    if (validationError) {
      setErrorState(0, validationError, -1);
      return;
    }
    const apiSendAt = new Date().toISOString();
    setProgress((prev) => ({
      ...prev,
      activeStep: 1,
      completedStep: 0,
      stageTimestamps: {
        ...INITIAL_PROGRESS.stageTimestamps,
        ...(prev?.stageTimestamps || {}),
        send_message: prev?.stageTimestamps?.send_message || preflightAt,
        preflight: prev?.stageTimestamps?.preflight || preflightAt,
        api_send: apiSendAt,
      },
    }));

    const credentials = promptForPagerCredentials();
    if (credentials.cancelled) {
      setProgress((prev) => ({
        ...prev,
        activeStep: 1,
        completedStep: 0,
        cancelled: true,
        errorStep: -1,
        errorMessage: "",
      }));
      return;
    }

    if (credentials.error) {
      setErrorState(1, credentials.error, 0);
      return;
    }

    setSending(true);
    setProgress((prev) => ({
      ...prev,
      activeStep: 2,
      completedStep: 1,
      errorStep: -1,
      errorMessage: "",
      cancelled: false,
      successTimestamp: "",
      stageTimestamps: {
        ...INITIAL_PROGRESS.stageTimestamps,
        ...(prev?.stageTimestamps || {}),
        send_message: prev?.stageTimestamps?.send_message || preflightAt,
        preflight: prev?.stageTimestamps?.preflight || preflightAt,
        api_send: prev?.stageTimestamps?.api_send || apiSendAt,
      },
    }));

    try {
      const payload = await sendPagerMessage({
        text: trimmedText,
        username: credentials.username,
        password: credentials.password,
      });

      const upstreamAt = String(payload.timestamp || "").trim() || new Date().toISOString();
      setProgress((prev) => ({
        ...prev,
        activeStep: -1,
        completedStep: 4,
        errorStep: -1,
        errorMessage: "",
        cancelled: false,
        successTimestamp: formatPagerTimestamp(upstreamAt),
        sentText: String(payload.text || prev?.sentText || safeSendText).trim(),
        retryCount: 0,
        stageTimestamps: {
          ...INITIAL_PROGRESS.stageTimestamps,
          ...(prev?.stageTimestamps || {}),
          send_message: prev?.stageTimestamps?.send_message || preflightAt,
          preflight: prev?.stageTimestamps?.preflight || preflightAt,
          api_send: prev?.stageTimestamps?.api_send || apiSendAt,
          upstream_accept: upstreamAt,
        },
      }));
      beginTelemetryPolling({
        text: payload.text || trimmedText,
        timestamp: payload.timestamp,
      });
      retrySessionRef.current = {
        active: true,
        text: String(payload.text || safeSendText).trim(),
        username: credentials.username,
        password: credentials.password,
        retriesUsed: 0,
      };
      scheduleAutoRetryCheck();
      setText("");
    } catch (err) {
      const message = err?.message || String(err);
      const step = getErrorStep(message);
      const completedStep = Math.max(-1, step - 1);
      setErrorState(step, message, completedStep);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="page">
      <PageIntro
        title="Pager"
        lede="Rob has an old-school pager that he can receive messages on. Page him!"
      />

      <div className={`card ${styles.messageCard}`}>
        <form className={`ui-form ${styles.messageForm}`} onSubmit={onSubmit}>
          <label className="ui-field">
            <span className="ui-fieldLabel">Message</span>
            <input
              className="ui-input"
              type="text"
              value={text}
              onChange={(event) => setText(clampPagerText(event.target.value))}
              maxLength={MAX_PAGER_TEXT_LENGTH}
              placeholder="Hi Rob! I hope this beeps you well. Love, rccolamachine"
              disabled={sending}
              required
            />
          </label>

          <div className={`ui-metaText ${styles.charCount}`}>
            {remaining} characters remaining
          </div>

          {progress?.stageTimestamps?.send_message ? (
            <PagerStatusTimeline progress={progress} sending={sending} telemetry={telemetry} />
          ) : null}

          <div className="ui-actionRow">
            <button type="submit" disabled={!canSend}>
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </form>
      </div>

      <div className={`card ${styles.diagramCard}`}>
        <div className={styles.diagramHeader}>
          <div>
            <h2 className={styles.diagramTitle}>Architecture Diagram</h2>
            <p className={`ui-helperText ${styles.diagramSubtitle}`}>
              What&apos;s going on under the hood?
            </p>
          </div>
          <button
            type="button"
            className={styles.diagramToggle}
            onClick={() => setShowArchitecture((prev) => !prev)}
            aria-expanded={showArchitecture}
            aria-controls="pager-architecture-diagram"
          >
            {showArchitecture ? "Hide" : "Show"}
          </button>
        </div>
        {showArchitecture ? (
          <div id="pager-architecture-diagram">
            <PagerArchitectureDiagram />
          </div>
        ) : null}
      </div>
    </section>
  );
}
