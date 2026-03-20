export default function AutomationBuilderPanel({
  ui,
  setControlsOpen,
  automationBuilderRunning,
  automationBuilderActiveStepLabel,
  automationBuilderRemainingMs,
  automationBuilderStatus,
  stopAutomationBuilder,
  startAutomationBuilder,
  automationBuilderActions,
  automationBuilderAddKind,
  setAutomationBuilderAddKind,
  automationKindOptions,
  addAutomationBuilderAction,
  renderAutomationBuilderNode,
  automationBuilderRepeatCycle,
  setAutomationBuilderRepeatCycle,
  clearAutomationBuilder,
}) {
  return (
    <div
      id="controls-overlay"
      className={ui.controls}
      style={{ maxHeight: "calc(100% - 136px)" }}
    >
      <div className={ui.headerRow}>
        <button
          onClick={() => setControlsOpen(false)}
          className={ui.titleBtn}
          title="Close automation panel."
        >
          Automation builder
        </button>
        <button
          onClick={() => setControlsOpen(false)}
          className={ui.btnLight}
          title="Close automation panel."
        >
          Hide
        </button>
      </div>

      <div className={ui.section}>
        <div className={ui.row}>
          <div className="reactor-text-10-muted">
            {automationBuilderRunning
              ? `Step ${automationBuilderActiveStepLabel} • ${(Math.max(0, Number(automationBuilderRemainingMs) || 0) / 1000).toFixed(1)}s`
              : `Status: ${automationBuilderStatus}`}
          </div>
          <button
            onClick={() =>
              automationBuilderRunning
                ? stopAutomationBuilder("stopped")
                : startAutomationBuilder()
            }
            className={automationBuilderRunning ? ui.btnDark : ui.btnLight}
            title={
              automationBuilderRunning
                ? "Stop custom automation."
                : "Run custom automation actions."
            }
          >
            {automationBuilderRunning ? "Stop" : "Run"}
          </button>
        </div>

        <div className="reactor-automation-builder-canvas">
          {automationBuilderActions.length <= 0 ? (
            <div className="reactor-automation-builder-empty">
              <div>No actions yet.</div>
              <div className="reactor-row-gap-8-wrap">
                <select
                  value={automationBuilderAddKind}
                  onChange={(e) => setAutomationBuilderAddKind(e.target.value)}
                  disabled={automationBuilderRunning}
                  className={ui.select}
                >
                  {automationKindOptions}
                </select>
                <button
                  onClick={() => addAutomationBuilderAction(automationBuilderAddKind)}
                  disabled={automationBuilderRunning}
                  className={ui.btnLight}
                  title="Add your first action step."
                >
                  Add First Step
                </button>
              </div>
            </div>
          ) : (
            <>
              {automationBuilderActions.map((action, idx) => {
                const isFirst = idx === 0;
                const incomingEdge = String(action?.incomingEdge || "");
                const label = isFirst
                  ? "Start"
                  : incomingEdge === "then"
                    ? "Then"
                    : incomingEdge === "while"
                      ? "While"
                      : null;
                const branchKind = isFirst
                  ? "root"
                  : incomingEdge === "then"
                    ? "then"
                    : incomingEdge === "while"
                      ? "while"
                      : "root";
                const showThenTone = label === "Then";

                return (
                  <div key={action.id} className="reactor-automation-builder-root">
                    {label ? (
                      <div
                        className={`reactor-automation-builder-branch${
                          showThenTone ? " is-then" : ""
                        }`}
                      >
                        <div
                          className={`reactor-automation-builder-branch-label${
                            showThenTone ? " is-then" : ""
                          }`}
                        >
                          {label}
                        </div>
                        {renderAutomationBuilderNode(
                          action,
                          String(idx + 1),
                          branchKind,
                        )}
                      </div>
                    ) : (
                      renderAutomationBuilderNode(action, String(idx + 1), branchKind)
                    )}
                  </div>
                );
              })}
              <div className="reactor-automation-builder-root">
                <div className="reactor-automation-builder-branch">
                  <div className="reactor-automation-builder-branch-label">End</div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="reactor-automation-builder-footer">
          <div className={ui.row}>
            <label className={ui.row}>
              <span
                className="reactor-text-10-muted"
                title="Repeat the full custom action sequence."
              >
                Repeat cycle
              </span>
              <input
                type="checkbox"
                checked={automationBuilderRepeatCycle}
                onChange={(e) => setAutomationBuilderRepeatCycle(e.target.checked)}
                disabled={automationBuilderRunning}
                title="Repeat the full custom action sequence."
              />
            </label>
            {automationBuilderActions.length > 0 ? (
              <button
                onClick={clearAutomationBuilder}
                disabled={automationBuilderRunning}
                className={ui.btnLight}
                title="Clear all builder actions."
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
