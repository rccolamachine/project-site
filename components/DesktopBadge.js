export default function DesktopBadge({ small = false }) {
  return (
    <div className={`ui-desktopBadge${small ? " ui-desktopBadgeSmall" : ""}`}>
      Best experienced on desktop
    </div>
  );
}
