"use client";

import { useEffect, useState, useMemo } from "react";
import type { PlayProw } from "@/lib/types";

interface ApiResponse {
  plays: PlayProw[];
  remainingRequests: string | null;
  usedRequests: string | null;
  fetchedAt: string;
  errors: string[];
  cached?: boolean;
  error?: string;
}

type SortKey =
  | "player"
  | "side"
  | "line"
  | "game"
  | "bestBook"
  | "bestAmerican"
  | "delta"
  | "books"
  | "rawFair"
  | "rawEv"
  | "devigFair"
  | "devigEv"
  | "pinFair"
  | "pinEv";

interface ColFilters {
  player: string;
  side: "all" | "Over" | "Under";
  line: string; // "all" or a numeric string
  game: string;
  bestBook: string;
  bestOddsMin: string;
  rawFairMin: string;
  rawEvMin: string;
  devigFairMin: string;
  devigEvMin: string;
  pinFairMin: string;
  pinEvMin: string;
  deltaMin: string;
  booksMin: string;
}

const EMPTY_FILTERS: ColFilters = {
  player: "",
  side: "all",
  line: "all",
  game: "",
  bestBook: "",
  bestOddsMin: "",
  rawFairMin: "",
  rawEvMin: "",
  devigFairMin: "",
  devigEvMin: "",
  pinFairMin: "",
  pinEvMin: "",
  deltaMin: "",
  booksMin: "",
};

export default function Home() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("pinEv");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filters, setFilters] = useState<ColFilters>(EMPTY_FILTERS);

  const setF = <K extends keyof ColFilters>(key: K, value: ColFilters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const clearFilters = () => setFilters(EMPTY_FILTERS);

  const load = async (force = false) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/odds${force ? "?refresh=1" : ""}`);
      const json: ApiResponse = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(false);
  }, []);

  const playWithDelta = (p: PlayProw) => {
    const evs = [
      p.marketAvgRaw.evPercent,
      p.marketAvgDevig.evPercent,
      p.pinnacleWeighted.evPercent,
    ];
    return Math.max(...evs) - Math.min(...evs);
  };

  const lineOptions = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.plays.map((p) => p.line))).sort(
      (a, b) => a - b
    );
  }, [data]);

  const filteredPlays = useMemo(() => {
    if (!data) return [];
    const f = filters;
    const numOrNull = (s: string) => (s === "" ? null : Number(s));

    const playerNeedle = f.player.toLowerCase();
    const gameNeedle = f.game.toLowerCase();
    const bookNeedle = f.bestBook.toLowerCase();
    const lineNum = f.line === "all" ? null : Number(f.line);
    const bestOddsMin = numOrNull(f.bestOddsMin);
    const rawFairMin = numOrNull(f.rawFairMin);
    const rawEvMin = numOrNull(f.rawEvMin);
    const devigFairMin = numOrNull(f.devigFairMin);
    const devigEvMin = numOrNull(f.devigEvMin);
    const pinFairMin = numOrNull(f.pinFairMin);
    const pinEvMin = numOrNull(f.pinEvMin);
    const deltaMin = numOrNull(f.deltaMin);
    const booksMin = numOrNull(f.booksMin);

    let plays = data.plays.filter((p) => {
      if (playerNeedle && !p.player.toLowerCase().includes(playerNeedle)) return false;
      if (f.side !== "all" && p.side !== f.side) return false;
      if (lineNum !== null && p.line !== lineNum) return false;
      if (gameNeedle && !p.game.toLowerCase().includes(gameNeedle)) return false;
      if (bookNeedle && !p.bestBook.toLowerCase().includes(bookNeedle)) return false;
      if (bestOddsMin !== null && p.bestAmerican < bestOddsMin) return false;
      if (rawFairMin !== null && p.marketAvgRaw.fairAmerican < rawFairMin) return false;
      if (rawEvMin !== null && p.marketAvgRaw.evPercent * 100 < rawEvMin) return false;
      if (devigFairMin !== null && p.marketAvgDevig.fairAmerican < devigFairMin) return false;
      if (devigEvMin !== null && p.marketAvgDevig.evPercent * 100 < devigEvMin) return false;
      if (pinFairMin !== null && p.pinnacleWeighted.fairAmerican < pinFairMin) return false;
      if (pinEvMin !== null && p.pinnacleWeighted.evPercent * 100 < pinEvMin) return false;
      if (deltaMin !== null && playWithDelta(p) * 100 < deltaMin) return false;
      if (booksMin !== null && p.numBooks < booksMin) return false;
      return true;
    });

    plays = [...plays].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "delta":
          cmp = playWithDelta(a) - playWithDelta(b);
          break;
        case "player":
          cmp = a.player.localeCompare(b.player);
          break;
        case "side":
          cmp = a.side.localeCompare(b.side);
          break;
        case "line":
          cmp = a.line - b.line;
          break;
        case "game":
          cmp = a.game.localeCompare(b.game);
          break;
        case "bestBook":
          cmp = a.bestBook.localeCompare(b.bestBook);
          break;
        case "bestAmerican":
          cmp = a.bestAmerican - b.bestAmerican;
          break;
        case "books":
          cmp = a.numBooks - b.numBooks;
          break;
        case "rawFair":
          cmp = a.marketAvgRaw.fairAmerican - b.marketAvgRaw.fairAmerican;
          break;
        case "rawEv":
          cmp = a.marketAvgRaw.evPercent - b.marketAvgRaw.evPercent;
          break;
        case "devigFair":
          cmp = a.marketAvgDevig.fairAmerican - b.marketAvgDevig.fairAmerican;
          break;
        case "devigEv":
          cmp = a.marketAvgDevig.evPercent - b.marketAvgDevig.evPercent;
          break;
        case "pinFair":
          cmp = a.pinnacleWeighted.fairAmerican - b.pinnacleWeighted.fairAmerican;
          break;
        case "pinEv":
          cmp = a.pinnacleWeighted.evPercent - b.pinnacleWeighted.evPercent;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return plays;
  }, [data, filters, sortKey, sortDir]);

  const ALPHA_KEYS: SortKey[] = ["player", "side", "game", "bestBook"];
  const setSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir(ALPHA_KEYS.includes(k) ? "asc" : "desc");
    }
  };

  const sortIndicator = (k: SortKey) =>
    sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  const activeFilterCount = useMemo(() => {
    let n = 0;
    for (const [k, v] of Object.entries(filters) as [keyof ColFilters, string][]) {
      if (k === "side" || k === "line") {
        if (v !== "all") n++;
      } else if (v !== "") {
        n++;
      }
    }
    return n;
  }, [filters]);

  return (
    <main className="max-w-[1400px] mx-auto p-4 sm:p-6">
      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          MLB Batter Hits — +EV Finder
        </h1>
        <p className="text-sm text-neutral-400 mt-1">
          Three fair-odds methods side-by-side. Compare and pick what works for you.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded font-medium text-sm"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>

        <button
          onClick={clearFilters}
          disabled={activeFilterCount === 0}
          className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:hover:bg-neutral-800 rounded text-xs"
          title="Clear all column filters"
        >
          Clear filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </button>

        {data && (
          <div className="text-xs text-neutral-500 ml-auto">
            {data.cached ? "Cached • " : ""}
            Fetched {new Date(data.fetchedAt).toLocaleTimeString()} •{" "}
            {filteredPlays.length}/{data.plays.length} rows
            {data.remainingRequests && (
              <> • API credits left: {data.remainingRequests}</>
            )}
          </div>
        )}
      </div>

      {err && (
        <div className="bg-red-950/60 border border-red-800 text-red-200 rounded p-3 mb-4 text-sm">
          {err}
        </div>
      )}

      {data?.errors && data.errors.length > 0 && (
        <details className="bg-amber-950/40 border border-amber-800/60 rounded p-3 mb-4 text-xs text-amber-200">
          <summary className="cursor-pointer">
            {data.errors.length} per-event error(s)
          </summary>
          <ul className="mt-2 space-y-1">
            {data.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="overflow-x-auto rounded border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-neutral-400 text-xs uppercase">
            <tr>
              <Th onClick={() => setSort("player")}>
                Player{sortIndicator("player")}
              </Th>
              <Th onClick={() => setSort("side")}>
                Side{sortIndicator("side")}
              </Th>
              <Th onClick={() => setSort("line")}>
                Line{sortIndicator("line")}
              </Th>
              <Th onClick={() => setSort("game")}>
                Game{sortIndicator("game")}
              </Th>
              <Th onClick={() => setSort("bestBook")}>
                Best Book{sortIndicator("bestBook")}
              </Th>
              <Th onClick={() => setSort("bestAmerican")}>
                Best Odds{sortIndicator("bestAmerican")}
              </Th>
              <Th
                onClick={() => setSort("rawFair")}
                className="border-l border-neutral-800"
              >
                Fair: Avg (raw){sortIndicator("rawFair")}
              </Th>
              <Th onClick={() => setSort("rawEv")}>
                EV %{sortIndicator("rawEv")}
              </Th>
              <Th
                onClick={() => setSort("devigFair")}
                className="border-l border-neutral-800"
              >
                Fair: Devig{sortIndicator("devigFair")}
              </Th>
              <Th onClick={() => setSort("devigEv")}>
                EV %{sortIndicator("devigEv")}
              </Th>
              <Th
                onClick={() => setSort("pinFair")}
                className="border-l border-neutral-800 bg-emerald-950/40"
              >
                Fair: Pin-wt{sortIndicator("pinFair")}
              </Th>
              <Th
                onClick={() => setSort("pinEv")}
                className="bg-emerald-950/40"
              >
                EV %{sortIndicator("pinEv")}
              </Th>
              <Th
                onClick={() => setSort("delta")}
                className="border-l border-neutral-800"
              >
                Δ{sortIndicator("delta")}
              </Th>
              <Th onClick={() => setSort("books")}>
                Books{sortIndicator("books")}
              </Th>
            </tr>
            {/* Per-column filter row */}
            <tr className="bg-neutral-950 border-t border-neutral-800">
              <FilterTd>
                <TextFilter
                  value={filters.player}
                  onChange={(v) => setF("player", v)}
                  placeholder="contains…"
                />
              </FilterTd>
              <FilterTd>
                <select
                  value={filters.side}
                  onChange={(e) => setF("side", e.target.value as ColFilters["side"])}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 text-xs"
                >
                  <option value="all">All</option>
                  <option value="Over">Over</option>
                  <option value="Under">Under</option>
                </select>
              </FilterTd>
              <FilterTd>
                <select
                  value={filters.line}
                  onChange={(e) => setF("line", e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 text-xs"
                >
                  <option value="all">All</option>
                  {lineOptions.map((l) => (
                    <option key={l} value={String(l)}>
                      {l}
                    </option>
                  ))}
                </select>
              </FilterTd>
              <FilterTd>
                <TextFilter
                  value={filters.game}
                  onChange={(v) => setF("game", v)}
                  placeholder="team…"
                />
              </FilterTd>
              <FilterTd>
                <TextFilter
                  value={filters.bestBook}
                  onChange={(v) => setF("bestBook", v)}
                  placeholder="book…"
                />
              </FilterTd>
              <FilterTd>
                <NumFilter
                  value={filters.bestOddsMin}
                  onChange={(v) => setF("bestOddsMin", v)}
                  placeholder="≥ odds"
                />
              </FilterTd>
              <FilterTd className="border-l border-neutral-800">
                <NumFilter
                  value={filters.rawFairMin}
                  onChange={(v) => setF("rawFairMin", v)}
                  placeholder="≥ fair"
                />
              </FilterTd>
              <FilterTd>
                <NumFilter
                  value={filters.rawEvMin}
                  onChange={(v) => setF("rawEvMin", v)}
                  placeholder="≥ %"
                />
              </FilterTd>
              <FilterTd className="border-l border-neutral-800">
                <NumFilter
                  value={filters.devigFairMin}
                  onChange={(v) => setF("devigFairMin", v)}
                  placeholder="≥ fair"
                />
              </FilterTd>
              <FilterTd>
                <NumFilter
                  value={filters.devigEvMin}
                  onChange={(v) => setF("devigEvMin", v)}
                  placeholder="≥ %"
                />
              </FilterTd>
              <FilterTd className="border-l border-neutral-800 bg-emerald-950/20">
                <NumFilter
                  value={filters.pinFairMin}
                  onChange={(v) => setF("pinFairMin", v)}
                  placeholder="≥ fair"
                />
              </FilterTd>
              <FilterTd className="bg-emerald-950/20">
                <NumFilter
                  value={filters.pinEvMin}
                  onChange={(v) => setF("pinEvMin", v)}
                  placeholder="≥ %"
                />
              </FilterTd>
              <FilterTd className="border-l border-neutral-800">
                <NumFilter
                  value={filters.deltaMin}
                  onChange={(v) => setF("deltaMin", v)}
                  placeholder="≥ %"
                />
              </FilterTd>
              <FilterTd>
                <NumFilter
                  value={filters.booksMin}
                  onChange={(v) => setF("booksMin", v)}
                  placeholder="≥ #"
                />
              </FilterTd>
            </tr>
          </thead>
          <tbody>
            {filteredPlays.length === 0 && !loading && (
              <tr>
                <td colSpan={14} className="text-center text-neutral-500 py-8">
                  {data
                    ? activeFilterCount > 0
                      ? "No rows match your column filters. Clear some filters to see more."
                      : "No plays returned."
                    : "Click Refresh to load."}
                </td>
              </tr>
            )}
            {filteredPlays.map((p, i) => {
              const delta = playWithDelta(p);
              return (
                <tr
                  key={`${p.player}-${p.line}-${p.side}-${i}`}
                  className="border-t border-neutral-800 hover:bg-neutral-900/60"
                >
                  <Td className="font-medium">{p.player}</Td>
                  <Td>
                    <span
                      className={
                        p.side === "Over" ? "text-sky-400" : "text-orange-400"
                      }
                    >
                      {p.side}
                    </span>
                  </Td>
                  <Td>{p.line}</Td>
                  <Td className="text-neutral-400 text-xs">{p.game}</Td>
                  <Td>
                    {p.bestBook}
                    {p.pinnacleUsed && (
                      <span
                        title="Pinnacle was available and used in pin-weighted calc"
                        className="ml-1 text-emerald-500"
                      >
                        ★
                      </span>
                    )}
                  </Td>
                  <Td className="font-medium">{fmtAmerican(p.bestAmerican)}</Td>

                  <Td className="border-l border-neutral-800 text-right text-neutral-300">
                    {fmtAmerican(p.marketAvgRaw.fairAmerican)}
                  </Td>
                  <Td className="text-right">
                    <EvCell ev={p.marketAvgRaw.evPercent} />
                  </Td>

                  <Td className="border-l border-neutral-800 text-right text-neutral-300">
                    {fmtAmerican(p.marketAvgDevig.fairAmerican)}
                  </Td>
                  <Td className="text-right">
                    <EvCell ev={p.marketAvgDevig.evPercent} />
                  </Td>

                  <Td className="border-l border-neutral-800 text-right bg-emerald-950/20 text-neutral-200">
                    {fmtAmerican(p.pinnacleWeighted.fairAmerican)}
                  </Td>
                  <Td className="text-right bg-emerald-950/20 font-bold">
                    <EvCell ev={p.pinnacleWeighted.evPercent} />
                  </Td>

                  <Td className="border-l border-neutral-800 text-right text-neutral-400 text-xs">
                    {(delta * 100).toFixed(1)}%
                  </Td>
                  <Td className="text-neutral-500 text-xs">{p.numBooks}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-neutral-500 mt-4 space-y-1">
        <p>
          <strong>Tip</strong>: every column has a filter under its header. Text fields use &quot;contains&quot;; numeric fields use &quot;≥&quot;. Click a header to sort.
        </p>
        <p>
          <strong>Avg (raw)</strong>: simple average of implied probabilities across books — vig included. This is roughly your current method.
        </p>
        <p>
          <strong>Devig</strong>: each book&apos;s Over/Under is de-vigged with the power method first, then averaged equally.
        </p>
        <p>
          <strong>Pin-weighted</strong>: same de-vigging, but Pinnacle gets 50% of the weight when available; other books split the other 50%.
        </p>
        <p>
          <strong>Δ</strong>: spread between the highest and lowest EV across methods. Big delta = methods disagree — those are the ones to study.
        </p>
        <p>
          ★ = Pinnacle was available and included in the Pin-weighted calc.
        </p>
      </div>
    </main>
  );
}

function Th({
  children,
  onClick,
  className = "",
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  title?: string;
}) {
  return (
    <th
      onClick={onClick}
      title={title}
      className={`px-3 py-2 text-left font-medium ${
        onClick ? "cursor-pointer hover:text-neutral-200" : ""
      } ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}

function FilterTd({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-2 py-1 align-middle ${className}`}>{children}</td>;
}

function TextFilter({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 text-xs placeholder:text-neutral-600"
    />
  );
}

function NumFilter({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      step="any"
      className="w-full bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 text-xs placeholder:text-neutral-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    />
  );
}

function EvCell({ ev }: { ev: number }) {
  const pct = ev * 100;
  const cls =
    pct >= 5
      ? "text-emerald-400"
      : pct >= 2
      ? "text-emerald-500/80"
      : pct >= 0
      ? "text-neutral-300"
      : "text-red-400/70";
  const sign = pct >= 0 ? "+" : "";
  return <span className={cls}>{sign}{pct.toFixed(2)}%</span>;
}

function fmtAmerican(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n > 0 ? `+${n}` : String(n);
}
