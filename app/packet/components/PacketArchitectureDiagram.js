import styles from "../packet.module.css";

const TITLE_MAX_CHARS = 44;
const BODY_MAX_CHARS = 62;
const TEXT_LINE_HEIGHT = 12;

function wrapText(text, maxChars) {
  const raw = String(text || "").trim();
  if (!raw) return [];

  const words = raw.split(/\s+/);
  const lines = [];
  let current = words[0] || "";

  for (let i = 1; i < words.length; i += 1) {
    const next = words[i];
    if (`${current} ${next}`.length <= maxChars) {
      current = `${current} ${next}`;
    } else {
      lines.push(current);
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function WrappedText({ x, y, className, lines }) {
  return (
    <text x={x} y={y} className={className}>
      {lines.map((line, index) => (
        <tspan
          key={`${className}-${line}-${index}`}
          x={x}
          dy={index === 0 ? 0 : TEXT_LINE_HEIGHT}
        >
          {line}
        </tspan>
      ))}
    </text>
  );
}

function DiagramBlock({ x, y, width, height, boxClassName, title, bodyLines }) {
  const numericX = Number(x);
  const numericY = Number(y);
  const numericWidth = Number(width);
  const numericHeight = Number(height);
  const wrappedTitleLines = wrapText(title, TITLE_MAX_CHARS);
  const sourceBodyLines = Array.isArray(bodyLines) ? bodyLines : [bodyLines];
  const wrappedBodyLines = sourceBodyLines.flatMap((line) =>
    wrapText(line, BODY_MAX_CHARS),
  );
  const titleY = numericY + 24;
  const bodyY =
    titleY + (wrappedTitleLines.length - 1) * TEXT_LINE_HEIGHT + 18;

  return (
    <>
      <rect
        x={numericX}
        y={numericY}
        width={numericWidth}
        height={numericHeight}
        rx="14"
        className={boxClassName}
      />
      <WrappedText
        x={numericX + 20}
        y={titleY}
        className={styles.diagramStepTitle}
        lines={wrappedTitleLines}
      />
      <WrappedText
        x={numericX + 20}
        y={bodyY}
        className={styles.diagramStepBody}
        lines={wrappedBodyLines}
      />
    </>
  );
}

export default function PacketArchitectureDiagram() {
  return (
    <div className={styles.diagramWrap}>
      <svg
        viewBox="0 0 980 430"
        className={styles.diagramSvg}
        role="img"
        aria-label="Simplified two-lane architecture diagram for Packets feature"
        shapeRendering="crispEdges"
      >
        <text x="246" y="24" className={styles.diagramLaneLabel}>
          Radio delivery lane
        </text>
        <text x="734" y="24" className={styles.diagramLaneLabel}>
          Web/API lane
        </text>

        <DiagramBlock
          x="36"
          y="136"
          width="420"
          height="74"
          boxClassName={styles.diagramBoxRadio}
          title="1) KY4ZO radio sends position packet"
          bodyLines={[
            "GPS-equipped station transmits APRS packet over radio frequencies (RF)",
          ]}
        />

        <DiagramBlock
          x="36"
          y="226"
          width="420"
          height="88"
          boxClassName={styles.diagramBoxRadio}
          title="2) iGate bridges RF packet to APRS-IS"
          bodyLines={[
            "Internet-connected radio receives radio packet",
            "Converts packet to electronic web signal",
            "Uploads web packet to APRS-IS",
          ]}
        />

        <DiagramBlock
          x="524"
          y="56"
          width="420"
          height="62"
          boxClassName={styles.diagramBoxWeb}
          title="3) Packets UI (/packet)"
          bodyLines={["Opening page or clicking Refresh starts fetch flow"]}
        />

        <DiagramBlock
          x="524"
          y="136"
          width="420"
          height="62"
          boxClassName={styles.diagramBoxWeb}
          title="4) GET /api/packet/ky4zo"
          bodyLines={["Browser requests snapshot from server route"]}
        />

        <DiagramBlock
          x="524"
          y="226"
          width="420"
          height="74"
          boxClassName={styles.diagramBoxWeb}
          title="5) Upstream call to aprs.fi API"
          bodyLines={[
            "Server queries latest KY4ZO records",
            "using secure upstream access token",
          ]}
        />

        <DiagramBlock
          x="524"
          y="326"
          width="420"
          height="62"
          boxClassName={styles.diagramBoxWeb}
          title="6) API response to browser"
          bodyLines={["Normalized data drives map and table rendering"]}
        />

        <image
          href="/pager/pink-arrow-transparent.png"
          x="235"
          y="210"
          width="18"
          height="16"
          preserveAspectRatio="none"
        />

        <image
          href="/pager/cyan-arrow-transparent.png"
          x="725"
          y="118"
          width="22"
          height="18"
          preserveAspectRatio="none"
        />
        <image
          href="/pager/cyan-arrow-transparent.png"
          x="725"
          y="198"
          width="22"
          height="28"
          preserveAspectRatio="none"
        />
        <image
          href="/pager/cyan-arrow-transparent.png"
          x="725"
          y="300"
          width="22"
          height="26"
          preserveAspectRatio="none"
        />

        <image
          href="/pager/cyan-arrow-transparent.png"
          x="479"
          y="234"
          width="22"
          height="68"
          preserveAspectRatio="none"
          transform="rotate(-90 490 268)"
        />
      </svg>
    </div>
  );
}
