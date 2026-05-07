export default function BrandHeader() {
  return (
    <div className="border-b border-neutral-900 bg-neutral-950">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
        <a
          href="https://profit-path-sports.vercel.app/"
          className="font-[family-name:var(--font-orbitron)] tracking-widest text-blue-400 hover:text-blue-300 text-sm sm:text-base font-bold flex items-center gap-2"
        >
          <span className="text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.7)]">
            ⚡
          </span>
          PROFIT PATH SPORTS
          <span className="text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.7)]">
            ⚡
          </span>
        </a>
        <a
          href="https://profit-path-sports.vercel.app/"
          className="text-xs text-neutral-500 hover:text-neutral-300"
        >
          ← Toolbox
        </a>
      </div>
    </div>
  );
}
