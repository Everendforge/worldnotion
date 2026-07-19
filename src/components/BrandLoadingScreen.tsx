import worldnotionIcon from "../assets/worldnotion-icon.png";

export function BrandLoadingScreen({ message = "Preparing your workspace…" }: { message?: string }) {
  return (
    <main className="brand-loading brand-loading-worldnotion" role="status" aria-live="polite" aria-busy="true">
      <div className="brand-loading-orbit" aria-hidden="true" />
      <div className="brand-loading-content">
        <div className="brand-loading-mark" aria-hidden="true">
          <span className="brand-loading-mark-glow" />
          <img src={worldnotionIcon} alt="" />
        </div>
        <h1>Worldnotion</h1>
        <p>Universe-first Markdown workspace</p>
        <div className="brand-loading-status">
          <span className="brand-loading-pulse" aria-hidden="true" />
          <span>{message}</span>
        </div>
      </div>
    </main>
  );
}
