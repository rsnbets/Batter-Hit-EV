export default function BrandHeader() {
  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 pt-5">
      <div className="flex items-center gap-2.5 text-[10px] tracking-[2px] uppercase text-dim">
        <a
          href="https://www.profitpathsports.com/"
          className="text-muted hover:text-ppcyan transition-colors"
        >
          ← Profit Path Sports
        </a>
        <span className="text-ppborder2">/</span>
        <span>MLB Batter Hits +EV</span>
      </div>
    </div>
  );
}
