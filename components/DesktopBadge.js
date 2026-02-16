const badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  marginBottom: 12,
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid rgba(255, 207, 92, 0.55)",
  background: "rgba(52, 36, 16, 0.58)",
  color: "#ffe4a8",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.2,
};

const smallBadgeStyle = {
  marginBottom: 0,
  padding: "4px 8px",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: 0.1,
};

export default function DesktopBadge({ small = false }) {
  return (
    <div style={small ? { ...badgeStyle, ...smallBadgeStyle } : badgeStyle}>
      Best experienced on desktop
    </div>
  );
}
