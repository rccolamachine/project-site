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
    title: "4) Upstream API call + fan-out",
    bodyLines:
      "Server posts to DAPNET using secure upstream credentials. After acceptance, it seeds status storage and prepares the browser response in parallel with radio delivery.",
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
    bodyLines: "DAPNET dispatches the message toward Rob's home network path.",
  };
  radio5.height = measureBlockHeight({
    width: radio5.width,
    title: radio5.title,
    bodyLines: radio5.bodyLines,
    minHeight: MIN_BLOCK_HEIGHT,
  });

  const web9 = {
    x: LEFT_LANE_X,
    y: web4.y + web4.height + ARROW_GAP,
    width: BLOCK_WIDTH,
    title: "9) API response to browser",
    bodyLines:
      "On success, the API returns ok/text/timestamp/trackingKey so the UI can poll status by tracking key.",
  };
  web9.height = measureBlockHeight({
    width: web9.width,
    title: web9.title,
    bodyLines: web9.bodyLines,
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
    title: "7) Pi-Star radio",
    bodyLines:
      "Pi-Star MMDVM turns the inbound message into a local RF/POCSAG transmission.",
  };
  radio7.height = measureBlockHeight({
    width: radio7.width,
    title: radio7.title,
    bodyLines: radio7.bodyLines,
    minHeight: MIN_BLOCK_HEIGHT,
  });

  const radio8 = {
    x: RIGHT_LANE_X,
    y: radio7.y + radio7.height + ARROW_GAP,
    width: BLOCK_WIDTH,
    title: "8) Pager",
    bodyLines: "The pager receives and displays the message over RF.",
  };
  radio8.height = measureBlockHeight({
    width: radio8.width,
    title: radio8.title,
    bodyLines: radio8.bodyLines,
    minHeight: MIN_BLOCK_HEIGHT,
  });

  const radio10 = {
    x: RIGHT_LANE_X,
    y: radio8.y + radio8.height + ARROW_GAP,
    width: BLOCK_WIDTH,
    title: "10) Pi-Star telemetry bridge",
    bodyLines:
      "A bridge tails DAPNET/MMDVM logs and posts telemetry events to POST /api/pager/telemetry using a shared secret.",
  };
  radio10.height = measureBlockHeight({
    width: radio10.width,
    title: radio10.title,
    bodyLines: radio10.bodyLines,
    minHeight: MIN_BLOCK_HEIGHT,
  });

  const web11 = {
    x: LEFT_LANE_X,
    y: radio10.y,
    width: BLOCK_WIDTH,
    title: "11) Database",
    bodyLines:
      "Status records live in database: seeded at send acceptance, then updated by telemetry stages.",
  };
  web11.height = measureBlockHeight({
    width: web11.width,
    title: web11.title,
    bodyLines: web11.bodyLines,
    minHeight: MIN_BLOCK_HEIGHT,
  });

  const web12 = {
    x: LEFT_LANE_X,
    y: web11.y + web11.height + ARROW_GAP,
    width: BLOCK_WIDTH,
    title: "12) Status polling",
    bodyLines:
      "Browser polls GET /api/pager/status?trackingKey and refreshes the timeline from database-backed status snapshots.",
  };
  web12.height = measureBlockHeight({
    width: web12.width,
    title: web12.title,
    bodyLines: web12.bodyLines,
    minHeight: MIN_BLOCK_HEIGHT,
  });

  const blocks = {
    web1,
    web2,
    web3,
    web4,
    web9,
    web11,
    web12,
    radio5,
    radio6,
    radio7,
    radio8,
    radio10,
  };

  const arrow12 = verticalArrowBetween(blocks.web1);
  const arrow23 = verticalArrowBetween(blocks.web2);
  const arrow34 = verticalArrowBetween(blocks.web3);
  const arrow49 = verticalArrowBetween(blocks.web4);
  const arrow56 = verticalArrowBetween(blocks.radio5);
  const arrow67 = verticalArrowBetween(blocks.radio6);
  const arrow78 = verticalArrowBetween(blocks.radio7);
  const arrow810 = verticalArrowBetween(blocks.radio8);
  const arrow45 = horizontalArrowLeftToRight(
    blocks.web4,
    blocks.radio5.y + blocks.radio5.height / 2,
  );
  const arrow1011 = horizontalArrowRightToLeft(
    blocks.radio10,
    blocks.web11.y + blocks.web11.height / 2,
  );
  const arrow1112 = verticalArrowBetween(blocks.web11);
  const diagramHeight =
    Math.max(web12.y + web12.height, radio10.y + radio10.height) + 24;

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
          x={blocks.web9.x}
          y={blocks.web9.y}
          width={blocks.web9.width}
          height={blocks.web9.height}
          boxClassName={diagramStyles.diagramBoxWeb}
          title={blocks.web9.title}
          bodyLines={blocks.web9.bodyLines}
          titleClassName={diagramStyles.diagramStepTitle}
          bodyClassName={diagramStyles.diagramStepBody}
        />

        <DiagramBlock
          idPrefix="pager"
          x={blocks.radio8.x}
          y={blocks.radio8.y}
          width={blocks.radio8.width}
          height={blocks.radio8.height}
          boxClassName={diagramStyles.diagramBoxRadio}
          title={blocks.radio8.title}
          bodyLines={blocks.radio8.bodyLines}
          titleClassName={diagramStyles.diagramStepTitle}
          bodyClassName={diagramStyles.diagramStepBody}
        />

        <DiagramBlock
          idPrefix="pager"
          x={blocks.radio10.x}
          y={blocks.radio10.y}
          width={blocks.radio10.width}
          height={blocks.radio10.height}
          boxClassName={diagramStyles.diagramBoxRadio}
          title={blocks.radio10.title}
          bodyLines={blocks.radio10.bodyLines}
          titleClassName={diagramStyles.diagramStepTitle}
          bodyClassName={diagramStyles.diagramStepBody}
        />

        <DiagramBlock
          idPrefix="pager"
          x={blocks.web11.x}
          y={blocks.web11.y}
          width={blocks.web11.width}
          height={blocks.web11.height}
          boxClassName={diagramStyles.diagramBoxWeb}
          title={blocks.web11.title}
          bodyLines={blocks.web11.bodyLines}
          titleClassName={diagramStyles.diagramStepTitle}
          bodyClassName={diagramStyles.diagramStepBody}
        />

        <DiagramBlock
          idPrefix="pager"
          x={blocks.web12.x}
          y={blocks.web12.y}
          width={blocks.web12.width}
          height={blocks.web12.height}
          boxClassName={diagramStyles.diagramBoxWeb}
          title={blocks.web12.title}
          bodyLines={blocks.web12.bodyLines}
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
          x={arrow49.x}
          y={arrow49.y}
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
          x={arrow78.x}
          y={arrow78.y}
          width={VERTICAL_ARROW.width}
          height={VERTICAL_ARROW.height}
          preserveAspectRatio="none"
        />
        <image
          href="/pager/pink-arrow-transparent.png"
          x={arrow810.x}
          y={arrow810.y}
          width={VERTICAL_ARROW.width}
          height={VERTICAL_ARROW.height}
          preserveAspectRatio="none"
        />
        <image
          href="/pager/cyan-arrow-transparent.png"
          x={arrow1011.x}
          y={arrow1011.y}
          width={HORIZONTAL_ARROW.width}
          height={HORIZONTAL_ARROW.height}
          preserveAspectRatio="none"
          transform={arrow1011.transform}
        />
        <image
          href="/pager/cyan-arrow-transparent.png"
          x={arrow1112.x}
          y={arrow1112.y}
          width={VERTICAL_ARROW.width}
          height={VERTICAL_ARROW.height}
          preserveAspectRatio="none"
        />
      </svg>
    </div>
  );
}
