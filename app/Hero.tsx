/**
 * Wordmark hero matching the kprop-tool sister site. Each page sets its own
 * `tagline` (the tool name) and an optional `meta` slot for things like
 * "Fetched X at HH:MM • N rows • Y credits left".
 */
export default function Hero({
  tagline,
  meta,
}: {
  tagline: string;
  meta?: React.ReactNode;
}) {
  return (
    <div
      className="mt-[18px] mb-[22px] rounded-[18px] border border-ppborder bg-panel px-6 py-7 text-center"
      style={{
        boxShadow:
          "0 20px 60px rgba(0, 0, 0, 0.4), inset 0 0 0 1px rgba(255,255,255,0.02)",
      }}
    >
      <div
        className="font-brand text-pptext font-extrabold leading-[0.92] tracking-[-0.03em] mb-1"
        style={{ fontSize: "clamp(36px, 7vw, 56px)" }}
      >
        PROFIT<span className="text-ppgreen">PATH</span>
      </div>
      <span className="block font-brand text-[11px] font-normal tracking-[0.5em] uppercase text-dim mb-[18px]">
        Sports
      </span>
      <div
        className="font-brand text-ppcyan font-extrabold uppercase mb-[14px]"
        style={{
          fontSize: "clamp(18px, 2.8vw, 24px)",
          letterSpacing: "4px",
        }}
      >
        {tagline}
      </div>
      {meta && (
        <div className="font-mono text-xs text-muted">{meta}</div>
      )}
    </div>
  );
}
