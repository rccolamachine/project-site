import {
  DiagramBlock,
  HORIZONTAL_ARROW,
  VERTICAL_ARROW,
  horizontalArrowLeftToRight,
  horizontalArrowRightToLeft,
  measureBlockHeight,
  verticalArrowBetween,
} from "../../components/architecture/ArchitectureDiagramPrimitives";
import diagramStyles from "../../components/architecture/architectureDiagram.module.css";

export default function PagerArchitectureDiagram() {
  const LEFT_LANE_X = 36;
  const RIGHT_LANE_X = 560;
  const BLOCK_WIDTH = 460;
  const leftLaneCenterX = LEFT_LANE_X + BLOCK_WIDTH / 2;
  const rightLaneCenterX = RIGHT_LANE_X + BLOCK_WIDTH / 2;
  const ARROW_GAP = VERTICAL_ARROW.height;
  const MIN_BLOCK_HEIGHT = 52;

  const web1 = {
    x: LEFT_LANE_X,
    y: 44,
    width: BLOCK_WIDTH,
    title: "1) Pager UI (/pager)",
    bodyLines:
      "User enters a message, clicks Send, and supplies rccolamachine endpoint credentials.",
  };
  web1.height = measureBlockHeight({
    width: web1.width,
    title: web1.title,
    bodyLines: web1.bodyLines,
    minHeight: MIN_BLOCK_HEIGHT,
  });

  const web2 = {
    x: LEFT_LANE_X,
    y: web1.y + web1.height + ARROW_GAP,
    width: BLOCK_WIDTH,
    title: "2) POST /api/pager",
    bodyLines:
      "Browser sends message text in the request body and endpoint credentials via Basic auth.",
  };
  web2.height = measureBlockHeight({
    width: web2.width,
    title: web2.title,
    bodyLines: web2.bodyLines,
    minHeight: MIN_BLOCK_HEIGHT,
  });

  const web3 = {
    x: LEFT_LANE_X,
    y: web2.y + web2.height + ARROW_GAP,
    width: BLOCK_WIDTH,
    title: "3) Server Guardrails",
    bodyLines:
      "Server validates credentials, enforces rate limits (1 request / 3 seconds and 10 requests / minute per IP), and builds a normalized DAPNET payload.",
  };
  web3.height = measureBlockHeight({
    width: web3.width,
    title: web3.title,
    bodyLines: web3.bodyLines,
    minHeight: MIN_BLOCK_HEIGHT,
  });

  const web4 = {
    x: LEFT_LANE_X,
    y: web3.y + web3.height + ARROW_GAP,
    width: BLOCK_WIDTH,
    title: "4) Upstream API call",
    bodyLines:
      "Server posts the message to DAPNET (hampager.de/api/calls) using secure upstream credentials.",
  };
  web4.height = measureBlockHeight({
    width: web4.width,
    title: web4.title,
    bodyLines: web4.bodyLines,
    minHeight: MIN_BLOCK_HEIGHT,
  });

  const radio5 = {
    x: RIGHT_LANE_X,
    y: web4.y,
    width: BLOCK_WIDTH,
    title: "5) DAPNET network handoff",
    bodyLines: "DAPNET dispatches the message to Rob's internet/Wi-Fi path.",
  };
  radio5.height = measureBlockHeight({
    width: radio5.width,
    title: radio5.title,
    bodyLines: radio5.bodyLines,
    minHeight: MIN_BLOCK_HEIGHT,
  });

  const web8 = {
    x: LEFT_LANE_X,
    y: web4.y + web4.height + ARROW_GAP,
    width: BLOCK_WIDTH,
    title: "8) API response to browser",
    bodyLines:
      "On success, the API returns ok/text/timestamp; on failure, it returns an error.",
  };
  web8.height = measureBlockHeight({
    width: web8.width,
    title: web8.title,
    bodyLines: web8.bodyLines,
    minHeight: MIN_BLOCK_HEIGHT,
  });

  const radio6 = {
    x: RIGHT_LANE_X,
    y: radio5.y + radio5.height + ARROW_GAP,
    width: BLOCK_WIDTH,
    title: "6) Home WiFi link",
    bodyLines: "Rob's Wi-Fi network receives the data and relays it to Pi-Star MMDVM.",
  };
  radio6.height = measureBlockHeight({
    width: radio6.width,
    title: radio6.title,
    bodyLines: radio6.bodyLines,
    minHeight: MIN_BLOCK_HEIGHT,
  });

  const radio7 = {
    x: RIGHT_LANE_X,
    y: radio6.y + radio6.height + ARROW_GAP,
    width: BLOCK_WIDTH,
    title: "7) Pi-Star to RF to Pager",
    bodyLines:
      "Pi-Star MMDVM processes the incoming page and sends a radio/POCSAG signal to the pager in Rob's apartment.",
  };
  radio7.height = measureBlockHeight({
    width: radio7.width,
    title: radio7.title,
    bodyLines: radio7.bodyLines,
    minHeight: MIN_BLOCK_HEIGHT,
  });

  const radio9 = {
    x: RIGHT_LANE_X,
    y: radio7.y + radio7.height + ARROW_GAP,
    width: BLOCK_WIDTH,
    title: "9) Pi-Star telemetry bridge",
    bodyLines:
      "Service tails DAPNET/MMDVM logs on Pi-Star, detects gateway and TX events for each page, and pushes events to POST /api/pager/telemetry.",
  };
  radio9.height = measureBlockHeight({
    width: radio9.width,
    title: radio9.title,
    bodyLines: radio9.bodyLines,
    minHeight: MIN_BLOCK_HEIGHT,
  });

  const web10 = {
    x: LEFT_LANE_X,
    y: radio9.y,
    width: BLOCK_WIDTH,
    title: "10) Status polling + UI updates",
    bodyLines:
      "Browser polls POST /api/pager/status every few seconds, reads Pi-Star telemetry stages captured by the API, and updates the transmission timeline in the Pager UI.",
  };
  web10.height = measureBlockHeight({
    width: web10.width,
    title: web10.title,
    bodyLines: web10.bodyLines,
    minHeight: MIN_BLOCK_HEIGHT,
  });

  const blocks = {
    web1,
    web2,
    web3,
    web4,
    web8,
    web10,
    radio5,
    radio6,
    radio7,
    radio9,
  };

  const arrow12 = verticalArrowBetween(blocks.web1);
  const arrow23 = verticalArrowBetween(blocks.web2);
  const arrow34 = verticalArrowBetween(blocks.web3);
  const arrow48 = verticalArrowBetween(blocks.web4);
  const arrow56 = verticalArrowBetween(blocks.radio5);
  const arrow67 = verticalArrowBetween(blocks.radio6);
  const arrow79 = verticalArrowBetween(blocks.radio7);
  const arrow45 = horizontalArrowLeftToRight(
    blocks.web4,
    blocks.radio5.y + blocks.radio5.height / 2,
  );
  const arrow910 = horizontalArrowRightToLeft(
    blocks.radio9,
    blocks.web10.y + blocks.web10.height / 2,
  );
  const diagramHeight =
    Math.max(web10.y + web10.height, radio9.y + radio9.height) + 24;

  return (
    <div className={diagramStyles.diagramWrap}>
      <svg
        viewBox={`0 0 1060 ${diagramHeight}`}
        className={diagramStyles.diagramSvg}
        role="img"
        aria-label="Two-lane architecture diagram for Pager feature"
        shapeRendering="crispEdges"
      >
        <text x={leftLaneCenterX} y="28" className={diagramStyles.diagramLaneLabel}>
          Web/API lane
        </text>
        <text x={rightLaneCenterX} y="28" className={diagramStyles.diagramLaneLabel}>
          Radio delivery lane
        </text>

        <DiagramBlock
          idPrefix="pager"
          x={blocks.web1.x}
          y={blocks.web1.y}
          width={blocks.web1.width}
          height={blocks.web1.height}
          boxClassName={diagramStyles.diagramBoxWeb}
          title={blocks.web1.title}
          bodyLines={blocks.web1.bodyLines}
          titleClassName={diagramStyles.diagramStepTitle}
          bodyClassName={diagramStyles.diagramStepBody}
        />

        <DiagramBlock
          idPrefix="pager"
          x={blocks.web2.x}
          y={blocks.web2.y}
          width={blocks.web2.width}
          height={blocks.web2.height}
          boxClassName={diagramStyles.diagramBoxWeb}
          title={blocks.web2.title}
          bodyLines={blocks.web2.bodyLines}
          titleClassName={diagramStyles.diagramStepTitle}
          bodyClassName={diagramStyles.diagramStepBody}
        />

        <DiagramBlock
          idPrefix="pager"
          x={blocks.web3.x}
          y={blocks.web3.y}
          width={blocks.web3.width}
          height={blocks.web3.height}
          boxClassName={diagramStyles.diagramBoxWeb}
          title={blocks.web3.title}
          bodyLines={blocks.web3.bodyLines}
          titleClassName={diagramStyles.diagramStepTitle}
          bodyClassName={diagramStyles.diagramStepBody}
        />

        <DiagramBlock
          idPrefix="pager"
          x={blocks.web4.x}
          y={blocks.web4.y}
          width={blocks.web4.width}
          height={blocks.web4.height}
          boxClassName={diagramStyles.diagramBoxWeb}
          title={blocks.web4.title}
          bodyLines={blocks.web4.bodyLines}
          titleClassName={diagramStyles.diagramStepTitle}
          bodyClassName={diagramStyles.diagramStepBody}
        />

        <DiagramBlock
          idPrefix="pager"
          x={blocks.radio5.x}
          y={blocks.radio5.y}
          width={blocks.radio5.width}
          height={blocks.radio5.height}
          boxClassName={diagramStyles.diagramBoxRadio}
          title={blocks.radio5.title}
          bodyLines={blocks.radio5.bodyLines}
          titleClassName={diagramStyles.diagramStepTitle}
          bodyClassName={diagramStyles.diagramStepBody}
        />

        <DiagramBlock
          idPrefix="pager"
          x={blocks.radio6.x}
          y={blocks.radio6.y}
          width={blocks.radio6.width}
          height={blocks.radio6.height}
          boxClassName={diagramStyles.diagramBoxRadio}
          title={blocks.radio6.title}
          bodyLines={blocks.radio6.bodyLines}
          titleClassName={diagramStyles.diagramStepTitle}
          bodyClassName={diagramStyles.diagramStepBody}
        />

        <DiagramBlock
          idPrefix="pager"
          x={blocks.radio7.x}
          y={blocks.radio7.y}
          width={blocks.radio7.width}
          height={blocks.radio7.height}
          boxClassName={diagramStyles.diagramBoxRadio}
          title={blocks.radio7.title}
          bodyLines={blocks.radio7.bodyLines}
          titleClassName={diagramStyles.diagramStepTitle}
          bodyClassName={diagramStyles.diagramStepBody}
        />

        <DiagramBlock
          idPrefix="pager"
          x={blocks.web8.x}
          y={blocks.web8.y}
          width={blocks.web8.width}
          height={blocks.web8.height}
          boxClassName={diagramStyles.diagramBoxWeb}
          title={blocks.web8.title}
          bodyLines={blocks.web8.bodyLines}
          titleClassName={diagramStyles.diagramStepTitle}
          bodyClassName={diagramStyles.diagramStepBody}
        />

        <DiagramBlock
          idPrefix="pager"
          x={blocks.radio9.x}
          y={blocks.radio9.y}
          width={blocks.radio9.width}
          height={blocks.radio9.height}
          boxClassName={diagramStyles.diagramBoxRadio}
          title={blocks.radio9.title}
          bodyLines={blocks.radio9.bodyLines}
          titleClassName={diagramStyles.diagramStepTitle}
          bodyClassName={diagramStyles.diagramStepBody}
        />

        <DiagramBlock
          idPrefix="pager"
          x={blocks.web10.x}
          y={blocks.web10.y}
          width={blocks.web10.width}
          height={blocks.web10.height}
          boxClassName={diagramStyles.diagramBoxWeb}
          title={blocks.web10.title}
          bodyLines={blocks.web10.bodyLines}
          titleClassName={diagramStyles.diagramStepTitle}
          bodyClassName={diagramStyles.diagramStepBody}
        />

        <image
          href="/pager/cyan-arrow-transparent.png"
          x={arrow12.x}
          y={arrow12.y}
          width={VERTICAL_ARROW.width}
          height={VERTICAL_ARROW.height}
          preserveAspectRatio="none"
        />
        <image
          href="/pager/cyan-arrow-transparent.png"
          x={arrow23.x}
          y={arrow23.y}
          width={VERTICAL_ARROW.width}
          height={VERTICAL_ARROW.height}
          preserveAspectRatio="none"
        />
        <image
          href="/pager/cyan-arrow-transparent.png"
          x={arrow34.x}
          y={arrow34.y}
          width={VERTICAL_ARROW.width}
          height={VERTICAL_ARROW.height}
          preserveAspectRatio="none"
        />
        <image
          href="/pager/cyan-arrow-transparent.png"
          x={arrow45.x}
          y={arrow45.y}
          width={HORIZONTAL_ARROW.width}
          height={HORIZONTAL_ARROW.height}
          preserveAspectRatio="none"
          transform={arrow45.transform}
        />
        <image
          href="/pager/cyan-arrow-transparent.png"
          x={arrow48.x}
          y={arrow48.y}
          width={VERTICAL_ARROW.width}
          height={VERTICAL_ARROW.height}
          preserveAspectRatio="none"
        />
        <image
          href="/pager/pink-arrow-transparent.png"
          x={arrow56.x}
          y={arrow56.y}
          width={VERTICAL_ARROW.width}
          height={VERTICAL_ARROW.height}
          preserveAspectRatio="none"
        />
        <image
          href="/pager/pink-arrow-transparent.png"
          x={arrow67.x}
          y={arrow67.y}
          width={VERTICAL_ARROW.width}
          height={VERTICAL_ARROW.height}
          preserveAspectRatio="none"
        />
        <image
          href="/pager/pink-arrow-transparent.png"
          x={arrow79.x}
          y={arrow79.y}
          width={VERTICAL_ARROW.width}
          height={VERTICAL_ARROW.height}
          preserveAspectRatio="none"
        />
        <image
          href="/pager/cyan-arrow-transparent.png"
          x={arrow910.x}
          y={arrow910.y}
          width={HORIZONTAL_ARROW.width}
          height={HORIZONTAL_ARROW.height}
          preserveAspectRatio="none"
          transform={arrow910.transform}
        />
      </svg>
    </div>
  );
}
