export default function PixelHouseIcon({
  size = 14,
  className = "",
  swapped = false,
}) {
  const classes = ["farm-pixel-icon", className].filter(Boolean).join(" ");
  const colorA = swapped ? "#ff4fd8" : "#2de2e6";
  const colorB = swapped ? "#2de2e6" : "#ff4fd8";
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      className={classes}
      aria-hidden="true"
    >
      <rect x="3" y="7" width="10" height="7" fill={colorA} />
      <rect x="6" y="10" width="3" height="4" fill={colorB} />
      <rect x="10" y="10" width="2" height="2" fill={colorB} />
      <rect x="1" y="6" width="14" height="1" fill={colorB} />
      <rect x="2" y="5" width="12" height="1" fill={colorB} />
      <rect x="3" y="4" width="10" height="1" fill={colorB} />
      <rect x="4" y="3" width="8" height="1" fill={colorB} />
    </svg>
  );
}
