export default function BrandFooter() {
  return (
    <footer className="border-t border-neutral-900 bg-neutral-950 mt-12">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-6 text-xs text-neutral-500">
        <a
          href="https://profit-path-sports.vercel.app/"
          className="font-[family-name:var(--font-orbitron)] tracking-widest text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1.5"
        >
          <span className="text-amber-400">⚡</span>
          PROFIT PATH SPORTS
          <span className="text-amber-400">⚡</span>
        </a>
        <div className="flex flex-wrap gap-4">
          <a
            href="https://profit-path-sports.vercel.app/"
            className="hover:text-neutral-300"
          >
            Toolbox
          </a>
          <a
            href="https://profit-path-sports.vercel.app/#sportsbooks"
            className="hover:text-neutral-300"
          >
            Sportsbook offers
          </a>
        </div>
        <div className="sm:ml-auto text-neutral-600">
          Tools, education &amp; edge — never a paywall.
        </div>
      </div>
    </footer>
  );
}
