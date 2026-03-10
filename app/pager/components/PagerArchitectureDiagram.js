import styles from "../pager.module.css";

export default function PagerArchitectureDiagram() {
  return (
    <div className={styles.diagramWrap}>
      <svg
        viewBox="0 0 980 920"
        style={{ width: "100%", height: "auto" }}
        role="img"
        aria-label="Two-lane architecture diagram for Pager feature"
        shapeRendering="crispEdges"
      >
        <text
          x="246"
          y="28"
          fill="rgba(243,244,255,0.85)"
          fontSize="9"
          textAnchor="middle"
          textDecoration="underline"
        >
          Web/API lane
        </text>
        <text
          x="734"
          y="28"
          fill="rgba(243,244,255,0.85)"
          fontSize="9"
          textAnchor="middle"
          textDecoration="underline"
        >
          Radio delivery lane
        </text>

        <rect
          x="36"
          y="44"
          width="420"
          height="88"
          rx="14"
          fill="rgba(45, 226, 230, 0.08)"
          stroke="rgba(45, 226, 230, 0.55)"
        />
        <text x="56" y="74" fill="#f3f4ff" fontSize="11">
          1) Pager UI (/pager)
        </text>
        <text x="56" y="94" fill="rgba(243,244,255,0.78)" fontSize="7">
          Enter message and click Send
        </text>
        <text x="56" y="108" fill="rgba(243,244,255,0.78)" fontSize="7">
          Enter rccolamachine endpoint credentials
        </text>

        <rect
          x="36"
          y="164"
          width="420"
          height="88"
          rx="14"
          fill="rgba(45, 226, 230, 0.09)"
          stroke="rgba(45, 226, 230, 0.56)"
        />
        <text x="56" y="194" fill="#f3f4ff" fontSize="11">
          2) POST /api/pager
        </text>
        <text x="56" y="214" fill="rgba(243,244,255,0.78)" fontSize="7">
          Sends message text in request body
        </text>
        <text x="56" y="228" fill="rgba(243,244,255,0.78)" fontSize="7">
          Endpoint credentials sent as Basic auth
        </text>

        <rect
          x="36"
          y="284"
          width="420"
          height="116"
          rx="14"
          fill="rgba(45, 226, 230, 0.09)"
          stroke="rgba(45, 226, 230, 0.56)"
        />
        <text x="56" y="314" fill="#f3f4ff" fontSize="11">
          3) Server Guardrails
        </text>
        <text x="56" y="334" fill="rgba(243,244,255,0.78)" fontSize="7">
          Validates rccolamachine endpoint credentials
        </text>
        <text x="56" y="348" fill="rgba(243,244,255,0.78)" fontSize="7">
          Enforces limits: 1 request / 3 seconds
        </text>
        <text x="56" y="362" fill="rgba(243,244,255,0.78)" fontSize="7">
          and 10 requests / minute per IP
        </text>
        <text x="56" y="376" fill="rgba(243,244,255,0.78)" fontSize="7">
          Builds normalized payload for DAPNET
        </text>

        <rect
          x="36"
          y="430"
          width="420"
          height="104"
          rx="14"
          fill="rgba(45, 226, 230, 0.09)"
          stroke="rgba(45, 226, 230, 0.56)"
        />
        <text x="56" y="460" fill="#f3f4ff" fontSize="11">
          4) Upstream API call
        </text>
        <text x="56" y="480" fill="rgba(243,244,255,0.78)" fontSize="7">
          POST /api/pager sends message to
        </text>
        <text x="56" y="494" fill="rgba(243,244,255,0.78)" fontSize="7">
          DAPNET pager server (hampager.de/api/calls)
        </text>
        <text x="56" y="508" fill="rgba(243,244,255,0.78)" fontSize="7">
          Upstream auth uses DAPNET credentials
        </text>
        <text x="56" y="522" fill="rgba(243,244,255,0.78)" fontSize="7">
          stored as secure upstream credentials
        </text>

        <rect
          x="524"
          y="430"
          width="420"
          height="88"
          rx="14"
          fill="rgba(255, 79, 216, 0.10)"
          stroke="rgba(255, 79, 216, 0.58)"
        />
        <text x="544" y="460" fill="#f3f4ff" fontSize="11">
          5) DAPNET network handoff
        </text>
        <text x="544" y="480" fill="rgba(243,244,255,0.78)" fontSize="7">
          DAPNET dispatches message to
        </text>
        <text x="544" y="494" fill="rgba(243,244,255,0.78)" fontSize="7">
          internet / Rob&apos;s Wi-Fi network path
        </text>

        <rect
          x="524"
          y="542"
          width="420"
          height="88"
          rx="14"
          fill="rgba(255, 79, 216, 0.10)"
          stroke="rgba(255, 79, 216, 0.58)"
        />
        <text x="544" y="572" fill="#f3f4ff" fontSize="11">
          6) Home WiFi link
        </text>
        <text x="544" y="592" fill="rgba(243,244,255,0.78)" fontSize="7">
          Rob&apos;s Wi-Fi network receives and relays
        </text>
        <text x="544" y="606" fill="rgba(243,244,255,0.78)" fontSize="7">
          message to Pi-Star MMDVM
        </text>

        <rect
          x="524"
          y="654"
          width="420"
          height="104"
          rx="14"
          fill="rgba(255, 79, 216, 0.10)"
          stroke="rgba(255, 79, 216, 0.58)"
        />
        <text x="544" y="684" fill="#f3f4ff" fontSize="11">
          7) Pi-Star to RF to Pager
        </text>
        <text x="544" y="704" fill="rgba(243,244,255,0.78)" fontSize="7">
          Pi-Star MMDVM processes incoming page
        </text>
        <text x="544" y="718" fill="rgba(243,244,255,0.78)" fontSize="7">
          sends radio / POCSAG signal to pager in Rob&apos;s apartment
        </text>

        <rect
          x="36"
          y="566"
          width="420"
          height="128"
          rx="14"
          fill="rgba(45, 226, 230, 0.09)"
          stroke="rgba(45, 226, 230, 0.56)"
        />
        <text x="56" y="596" fill="#f3f4ff" fontSize="11">
          8) API response to browser
        </text>
        <text x="56" y="616" fill="rgba(243,244,255,0.78)" fontSize="7">
          Success response:
        </text>
        <text x="56" y="630" fill="rgba(243,244,255,0.78)" fontSize="7">
          ok, text, timestamp
        </text>
        <text x="56" y="652" fill="rgba(243,244,255,0.78)" fontSize="7">
          Failure response:
        </text>
        <text x="56" y="666" fill="rgba(243,244,255,0.78)" fontSize="7">
          error
        </text>

        <rect
          x="524"
          y="780"
          width="420"
          height="108"
          rx="14"
          fill="rgba(255, 79, 216, 0.10)"
          stroke="rgba(255, 79, 216, 0.58)"
        />
        <text x="544" y="810" fill="#f3f4ff" fontSize="11">
          9) Pi-Star telemetry bridge
        </text>
        <text x="544" y="830" fill="rgba(243,244,255,0.78)" fontSize="7">
          Service tails DAPNET / MMDVM logs on Pi-Star
        </text>
        <text x="544" y="844" fill="rgba(243,244,255,0.78)" fontSize="7">
          Detects gateway + TX events for each page
        </text>
        <text x="544" y="858" fill="rgba(243,244,255,0.78)" fontSize="7">
          Pushes events to POST /api/pager/telemetry
        </text>

        <rect
          x="36"
          y="780"
          width="420"
          height="116"
          rx="14"
          fill="rgba(45, 226, 230, 0.09)"
          stroke="rgba(45, 226, 230, 0.56)"
        />
        <text x="56" y="810" fill="#f3f4ff" fontSize="11">
          10) Status polling + UI updates
        </text>
        <text x="56" y="830" fill="rgba(243,244,255,0.78)" fontSize="7">
          Browser polls POST /api/pager/status every few seconds
        </text>
        <text x="56" y="844" fill="rgba(243,244,255,0.78)" fontSize="7">
          Reads Pi-Star telemetry stages captured by the API
        </text>
        <text x="56" y="858" fill="rgba(243,244,255,0.78)" fontSize="7">
          Updates Transmission status timeline in Pager UI
        </text>

        <image
          href="/pager/cyan-arrow-transparent.png"
          x="235"
          y="132"
          width="22"
          height="32"
          preserveAspectRatio="none"
        />
        <image
          href="/pager/cyan-arrow-transparent.png"
          x="235"
          y="252"
          width="22"
          height="32"
          preserveAspectRatio="none"
        />
        <image
          href="/pager/cyan-arrow-transparent.png"
          x="235"
          y="400"
          width="22"
          height="30"
          preserveAspectRatio="none"
        />
        <image
          href="/pager/cyan-arrow-transparent.png"
          x="479"
          y="414"
          width="22"
          height="68"
          preserveAspectRatio="none"
          transform="rotate(-90 490 448)"
        />
        <image
          href="/pager/cyan-arrow-transparent.png"
          x="235"
          y="534"
          width="22"
          height="32"
          preserveAspectRatio="none"
        />
        <image
          href="/pager/pink-arrow-transparent.png"
          x="725"
          y="518"
          width="18"
          height="24"
          preserveAspectRatio="none"
        />
        <image
          href="/pager/pink-arrow-transparent.png"
          x="725"
          y="630"
          width="18"
          height="24"
          preserveAspectRatio="none"
        />
        <image
          href="/pager/pink-arrow-transparent.png"
          x="725"
          y="758"
          width="18"
          height="22"
          preserveAspectRatio="none"
        />
        <image
          href="/pager/cyan-arrow-transparent.png"
          x="479"
          y="772"
          width="22"
          height="68"
          preserveAspectRatio="none"
          transform="rotate(90 490 806)"
        />
      </svg>
    </div>
  );
}
