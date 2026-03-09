"use client";

import { useEffect, useRef, useState } from "react";
import PageIntro from "@/components/PageIntro";
import PagerArchitectureDiagram from "./components/PagerArchitectureDiagram";
import PagerStatusTimeline from "./components/PagerStatusTimeline";
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
};

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
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(INITIAL_PROGRESS);
  const [telemetry, setTelemetry] = useState(null);
  const telemetryTimerRef = useRef(null);
  const telemetryPollRef = useRef({
    attempts: 0,
    text: "",
    timestamp: "",
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

  useEffect(() => {
    return () => {
      stopTelemetryPolling();
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
          setTelemetry((prev) => ({
            ...prev,
            telemetryConfigured: Boolean(snapshot.telemetryConfigured),
            polling: current.attempts < 30,
          }));
        } else if (snapshot?.ok) {
          applyTelemetrySnapshot(snapshot);

          const completedAt = snapshot?.stages?.mmdvm_tx_completed?.at;
          if (completedAt) {
            stopTelemetryPolling();
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

  const setErrorState = (step, message, completedStep = -1) => {
    setError(message);
    setProgress({
      ...INITIAL_PROGRESS,
      activeStep: step,
      completedStep,
      errorStep: step,
      errorMessage: message,
    });
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

  const onSubmit = async (event) => {
    event.preventDefault();
    stopTelemetryPolling();
    setTelemetry(null);
    setError("");
    setProgress(INITIAL_PROGRESS);

    setProgress({
      ...INITIAL_PROGRESS,
      activeStep: 0,
    });

    const validationError = validatePagerText(text);
    if (validationError) {
      setErrorState(0, validationError, -1);
      return;
    }
    setProgress((prev) => ({ ...prev, activeStep: 1, completedStep: 0 }));

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
    }));

    try {
      const payload = await sendPagerMessage({
        text: trimmedText,
        username: credentials.username,
        password: credentials.password,
      });

      setProgress({
        activeStep: -1,
        completedStep: 4,
        errorStep: -1,
        errorMessage: "",
        cancelled: false,
        successTimestamp: formatPagerTimestamp(payload.timestamp),
      });
      beginTelemetryPolling({
        text: payload.text || trimmedText,
        timestamp: payload.timestamp,
      });
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

          <PagerStatusTimeline progress={progress} sending={sending} telemetry={telemetry} />

          {error ? <div className="ui-errorInline">{error}</div> : null}

          <div className="ui-actionRow">
            <button type="submit" disabled={!canSend}>
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </form>
      </div>

      <div className={`card ${styles.diagramCard}`}>
        <h2 className={styles.diagramTitle}>Architecture Diagram</h2>
        <p className={`ui-helperText ${styles.diagramSubtitle}`}>
          What&apos;s going on under the hood?
        </p>
        <PagerArchitectureDiagram />
      </div>
    </section>
  );
}
