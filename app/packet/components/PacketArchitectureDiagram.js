import {
  DiagramBlock,
  HORIZONTAL_ARROW,
  VERTICAL_ARROW,
  horizontalArrowLeftToRight,
  measureBlockHeight,
  verticalArrowBetween,
} from "../../components/architecture/ArchitectureDiagramPrimitives";
import diagramStyles from "../../components/architecture/architectureDiagram.module.css";

export default function PacketArchitectureDiagram() {
  const LEFT_LANE_X = 36;
  const RIGHT_LANE_X = 560;
  const BLOCK_WIDTH = 460;
  const leftLaneCenterX = LEFT_LANE_X + BLOCK_WIDTH / 2;
  const rightLaneCenterX = RIGHT_LANE_X + BLOCK_WIDTH / 2;
  const ARROW_GAP = VERTICAL_ARROW.height;
  const MIN_BLOCK_HEIGHT = 52;

  const radio1 = {
    x: LEFT_LANE_X,
    y: 136,
    width: BLOCK_WIDTH,
    title: "1) KY4ZO radio sends position packet",
    bodyLines: "GPS-equipped station transmits APRS packet over radio frequencies (RF).",
  };
  radio1.height = measureBlockHeight({
    width: radio1.width,
    title: radio1.title,
    bodyLines: radio1.bodyLines,
    minHeight: MIN_BLOCK_HEIGHT,
  });

  const radio2 = {
    x: LEFT_LANE_X,
    y: radio1.y + radio1.height + ARROW_GAP,
    width: BLOCK_WIDTH,
    title: "2) iGate bridges RF packet to APRS-IS",
    bodyLines:
      "Internet-connected iGate receives the radio packet, converts it to internet traffic, and uploads it to APRS-IS.",
  };
  radio2.height = measureBlockHeight({
    width: radio2.width,
    title: radio2.title,
    bodyLines: radio2.bodyLines,
    minHeight: MIN_BLOCK_HEIGHT,
  });

  const web3 = {
    x: RIGHT_LANE_X,
    y: 56,
    width: BLOCK_WIDTH,
    title: "3) Packets UI (/packet)",
    bodyLines: "Opening the page or clicking Refresh starts the fetch flow.",
  };
  web3.height = measureBlockHeight({
    width: web3.width,
    title: web3.title,
    bodyLines: web3.bodyLines,
    minHeight: MIN_BLOCK_HEIGHT,
  });

  const web4 = {
    x: RIGHT_LANE_X,
    y: web3.y + web3.height + ARROW_GAP,
    width: BLOCK_WIDTH,
    title: "4) GET /api/packet/ky4zo",
    bodyLines: "Browser requests the latest snapshot from the server route.",
  };
  web4.height = measureBlockHeight({
    width: web4.width,
    title: web4.title,
    bodyLines: web4.bodyLines,
    minHeight: MIN_BLOCK_HEIGHT,
  });

  const web5 = {
    x: RIGHT_LANE_X,
    y: web4.y + web4.height + ARROW_GAP,
    width: BLOCK_WIDTH,
    title: "5) Upstream call to aprs.fi API",
    bodyLines:
      "Server queries the latest KY4ZO records using a secure upstream access token.",
  };
  web5.height = measureBlockHeight({
    width: web5.width,
    title: web5.title,
    bodyLines: web5.bodyLines,
    minHeight: MIN_BLOCK_HEIGHT,
  });

  const web6 = {
    x: RIGHT_LANE_X,
    y: web5.y + web5.height + ARROW_GAP,
    width: BLOCK_WIDTH,
    title: "6) API response to browser",
    bodyLines: "Normalized data drives map and table rendering.",
  };
  web6.height = measureBlockHeight({
    width: web6.width,
    title: web6.title,
    bodyLines: web6.bodyLines,
    minHeight: MIN_BLOCK_HEIGHT,
  });

  const blocks = {
    radio1,
    radio2,
    web3,
    web4,
    web5,
    web6,
  };

  const diagramHeight =
    Math.max(radio2.y + radio2.height, web6.y + web6.height) + 24;

  const arrow12 = verticalArrowBetween(blocks.radio1);
  const arrow34 = verticalArrowBetween(blocks.web3);
  const arrow45 = verticalArrowBetween(blocks.web4);
  const arrow56 = verticalArrowBetween(blocks.web5);
  const arrow25 = horizontalArrowLeftToRight(
    blocks.radio2,
    blocks.web5.y + blocks.web5.height / 2,
  );

  return (
    <div className={diagramStyles.diagramWrap}>
      <svg
        viewBox={`0 0 1060 ${diagramHeight}`}
        className={diagramStyles.diagramSvg}
        role="img"
        aria-label="Simplified two-lane architecture diagram for Packets feature"
        shapeRendering="crispEdges"
      >
        <text x={leftLaneCenterX} y="24" className={diagramStyles.diagramLaneLabel}>
          Radio delivery lane
        </text>
        <text x={rightLaneCenterX} y="24" className={diagramStyles.diagramLaneLabel}>
          Web/API lane
        </text>

        <DiagramBlock
          idPrefix="packet"
          x={blocks.radio1.x}
          y={blocks.radio1.y}
          width={blocks.radio1.width}
          height={blocks.radio1.height}
          boxClassName={diagramStyles.diagramBoxRadio}
          title={blocks.radio1.title}
          bodyLines={blocks.radio1.bodyLines}
          titleClassName={diagramStyles.diagramStepTitle}
          bodyClassName={diagramStyles.diagramStepBody}
        />

        <DiagramBlock
          idPrefix="packet"
          x={blocks.radio2.x}
          y={blocks.radio2.y}
          width={blocks.radio2.width}
          height={blocks.radio2.height}
          boxClassName={diagramStyles.diagramBoxRadio}
          title={blocks.radio2.title}
          bodyLines={blocks.radio2.bodyLines}
          titleClassName={diagramStyles.diagramStepTitle}
          bodyClassName={diagramStyles.diagramStepBody}
        />

        <DiagramBlock
          idPrefix="packet"
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
          idPrefix="packet"
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
          idPrefix="packet"
          x={blocks.web5.x}
          y={blocks.web5.y}
          width={blocks.web5.width}
          height={blocks.web5.height}
          boxClassName={diagramStyles.diagramBoxWeb}
          title={blocks.web5.title}
          bodyLines={blocks.web5.bodyLines}
          titleClassName={diagramStyles.diagramStepTitle}
          bodyClassName={diagramStyles.diagramStepBody}
        />

        <DiagramBlock
          idPrefix="packet"
          x={blocks.web6.x}
          y={blocks.web6.y}
          width={blocks.web6.width}
          height={blocks.web6.height}
          boxClassName={diagramStyles.diagramBoxWeb}
          title={blocks.web6.title}
          bodyLines={blocks.web6.bodyLines}
          titleClassName={diagramStyles.diagramStepTitle}
          bodyClassName={diagramStyles.diagramStepBody}
        />

        <image
          href="/pager/pink-arrow-transparent.png"
          x={arrow12.x}
          y={arrow12.y}
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
          width={VERTICAL_ARROW.width}
          height={VERTICAL_ARROW.height}
          preserveAspectRatio="none"
        />
        <image
          href="/pager/cyan-arrow-transparent.png"
          x={arrow56.x}
          y={arrow56.y}
          width={VERTICAL_ARROW.width}
          height={VERTICAL_ARROW.height}
          preserveAspectRatio="none"
        />

        <image
          href="/pager/cyan-arrow-transparent.png"
          x={arrow25.x}
          y={arrow25.y}
          width={HORIZONTAL_ARROW.width}
          height={HORIZONTAL_ARROW.height}
          preserveAspectRatio="none"
          transform={arrow25.transform}
        />
      </svg>
    </div>
  );
}
