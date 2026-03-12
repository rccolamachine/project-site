const TEXT_LINE_HEIGHT = 12;
const TEXT_PADDING_LEFT = 20;
const TEXT_PADDING_RIGHT = 20;
const TITLE_CHAR_PX = 7.5;
const BODY_CHAR_PX = 7.5;
const TITLE_TOP_OFFSET = 24;
const TITLE_TO_BODY_GAP = 14;
const BLOCK_BOTTOM_PADDING = 12;

export const VERTICAL_ARROW = Object.freeze({ width: 22, height: 32 });
export const HORIZONTAL_ARROW = Object.freeze({ width: 22, height: 68 });
const HORIZONTAL_IMAGE_X_OFFSET = 23;
const HORIZONTAL_IMAGE_CENTER_X_OFFSET = 34;
const HORIZONTAL_IMAGE_CENTER_Y_OFFSET = 34;

function chunkWord(word, maxChars) {
  if (!word) return [];
  if (word.length <= maxChars) return [word];

  const chunks = [];
  let start = 0;
  while (start < word.length) {
    chunks.push(word.slice(start, start + maxChars));
    start += maxChars;
  }
  return chunks;
}

function normalizeWords(text, maxChars) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .flatMap((word) => chunkWord(word, maxChars))
    .filter(Boolean);
}

function wrapText(text, maxChars) {
  const words = normalizeWords(text, maxChars);
  if (words.length === 0) return [];

  const lines = [];
  let current = words[0];

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
          key={`${className}-${x}-${y}-${line}-${index}`}
          x={x}
          dy={index === 0 ? 0 : TEXT_LINE_HEIGHT}
        >
          {line}
        </tspan>
      ))}
    </text>
  );
}

export function DiagramBlock({
  idPrefix,
  x,
  y,
  width,
  height,
  boxClassName,
  title,
  bodyLines,
  titleClassName,
  bodyClassName,
}) {
  const numericX = Number(x);
  const numericY = Number(y);
  const numericWidth = Number(width);
  const numericHeight = Number(height);
  const usableWidth = Math.max(
    112,
    numericWidth - TEXT_PADDING_LEFT - TEXT_PADDING_RIGHT,
  );
  const titleMaxChars = Math.max(12, Math.floor(usableWidth / TITLE_CHAR_PX));
  const bodyMaxChars = Math.max(14, Math.floor(usableWidth / BODY_CHAR_PX));
  const sourceBodyLines = Array.isArray(bodyLines) ? bodyLines : [bodyLines];

  const titleLines = wrapText(title, titleMaxChars);
  const bodyLinesToRender = sourceBodyLines.flatMap((line) =>
    wrapText(line, bodyMaxChars),
  );

  const titleY = numericY + TITLE_TOP_OFFSET;
  const titleBottomY = titleY + (titleLines.length - 1) * TEXT_LINE_HEIGHT;
  const bodyY = titleBottomY + TITLE_TO_BODY_GAP;

  const clipId = `${idPrefix || "diagram"}-clip-${numericX}-${numericY}-${numericWidth}-${numericHeight}`;

  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <rect
            x={numericX + 1}
            y={numericY + 1}
            width={Math.max(0, numericWidth - 2)}
            height={Math.max(0, numericHeight - 2)}
            rx="13"
          />
        </clipPath>
      </defs>
      <rect
        x={numericX}
        y={numericY}
        width={numericWidth}
        height={numericHeight}
        rx="14"
        className={boxClassName}
      />
      <g clipPath={`url(#${clipId})`}>
        <WrappedText
          x={numericX + TEXT_PADDING_LEFT}
          y={titleY}
          className={titleClassName}
          lines={titleLines}
        />
        <WrappedText
          x={numericX + TEXT_PADDING_LEFT}
          y={bodyY}
          className={bodyClassName}
          lines={bodyLinesToRender}
        />
      </g>
    </>
  );
}

export function measureBlockHeight({ width, title, bodyLines, minHeight = 0 }) {
  const numericWidth = Number(width);
  const usableWidth = Math.max(
    112,
    numericWidth - TEXT_PADDING_LEFT - TEXT_PADDING_RIGHT,
  );
  const titleMaxChars = Math.max(12, Math.floor(usableWidth / TITLE_CHAR_PX));
  const bodyMaxChars = Math.max(14, Math.floor(usableWidth / BODY_CHAR_PX));
  const sourceBodyLines = Array.isArray(bodyLines) ? bodyLines : [bodyLines];

  const wrappedTitleLines = wrapText(title, titleMaxChars);
  const wrappedBodyLines = sourceBodyLines.flatMap((line) =>
    wrapText(line, bodyMaxChars),
  );

  const titleBottomY =
    TITLE_TOP_OFFSET + (wrappedTitleLines.length - 1) * TEXT_LINE_HEIGHT;
  const bodyY = titleBottomY + TITLE_TO_BODY_GAP;
  const bodyBottomY =
    bodyY + (Math.max(1, wrappedBodyLines.length) - 1) * TEXT_LINE_HEIGHT;
  const computedHeight = Math.ceil(bodyBottomY + BLOCK_BOTTOM_PADDING);

  return Math.max(minHeight, computedHeight);
}

export function verticalArrowBetween(sourceBlock) {
  return {
    x: sourceBlock.x + sourceBlock.width / 2 - VERTICAL_ARROW.width / 2,
    y: sourceBlock.y + sourceBlock.height,
  };
}

export function horizontalArrowLeftToRight(sourceBlock, yCenter) {
  const centerY = yCenter ?? sourceBlock.y + sourceBlock.height / 2;
  return {
    x: sourceBlock.x + sourceBlock.width + HORIZONTAL_IMAGE_X_OFFSET,
    y: centerY - HORIZONTAL_IMAGE_CENTER_Y_OFFSET,
    transform: `rotate(-90 ${sourceBlock.x + sourceBlock.width + HORIZONTAL_IMAGE_CENTER_X_OFFSET} ${centerY})`,
  };
}

export function horizontalArrowRightToLeft(sourceBlock, yCenter) {
  const centerY = yCenter ?? sourceBlock.y + sourceBlock.height / 2;
  return {
    x: sourceBlock.x - (HORIZONTAL_ARROW.height - HORIZONTAL_IMAGE_X_OFFSET),
    y: centerY - HORIZONTAL_IMAGE_CENTER_Y_OFFSET,
    transform: `rotate(90 ${sourceBlock.x - HORIZONTAL_ARROW.height / 2} ${centerY})`,
  };
}
