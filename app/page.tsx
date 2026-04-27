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

type Method = "marketAvgRaw" | "marketAvgDevig" | "pinnacleWeighted";
type SortKey = "ev" | "player" | "line" | "bestAmerican" | "delta";

const METHOD_LABELS: Record<Method, string> = {
  marketAvgRaw: "Market Avg (raw)",
  marketAvgDevig: "Market Avg (de-vigged)",
  pinnacleWeighted: "Pinnacle-weighted",
};

export default function Home() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [minEV, setMinEV] = useState(3);
  const [filterMethod, setFilterMethod] = useState<Method>("pinnacleWeighted");
  const [sortKey, setSortKey] = useState<SortKey>("ev");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [sideFilter, setSideFilter] = useState<"all" | "Over" | "Under">("all");

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

  const filteredPlays = useMemo(() => {
    if (!data) return [];
    let plays = data.plays.filter(
      (p) => p[filterMethod].evPercent * 100 >= minEV
    );
    if (sideFilter !== "all") {
      plays = plays.filter((p) => p.side === sideFilter);
    }
    plays = [...plays].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "ev") {
        cmp = a[filterMethod].evPercent - b[filterMethod].evPercent;
      } else if (sortKey === "delta") {
        cmp = playWithDelta(a) - playWithDelta(b);
      } else if (sortKey === "player") {
        cmp = a.player.localeCompare(b.player);
      } else if (sortKey === "line") {
        cmp = a.line - b.line;
      } else if (sortKey === "bestAmerican") {
        cmp = a.bestAmerican - b.bestAmerican;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return plays;
  }, [data, minEV, sortKey, sortDir, sideFilter, filterMethod]);

  const setSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir(k === "player" ? "asc" : "desc");
    }
  };

  const sortIndicator = (k: SortKey) =>
    sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : "";

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

        <label className="flex items-center gap-2 text-sm">
          <span className="text-neutral-400">Filter by</span>
          <select
            value={filterMethod}
            onChange={(e) => setFilterMethod(e.target.value as Method)}
            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1"
          >
            <option value="pinnacleWeighted">{METHOD_LABELS.pinnacleWeighted}</option>
            <option value="marketAvgDevig">{METHOD_LABELS.marketAvgDevig}</option>
            <option value="marketAvgRaw">{METHOD_LABELS.marketAvgRaw}</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-neutral-400">Min EV%</span>
          <input
            type="number"
            value={minEV}
            step={0.5}
            onChange={(e) => setMinEV(Number(e.target.value))}
            className="w-20 bg-neutral-900 border border-neutral-700 rounded px-2 py-1"
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-neutral-400">Side</span>
          <select
            value={sideFilter}
            onChange={(e) =>
              setSideFilter(e.target.value as "all" | "Over" | "Under")
            }
            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1"
          >
            <option value="all">All</option>
            <option value="Over">Over</option>
            <option value="Under">Under</option>
          </select>
        </label>

        {data && (
          <div className="text-xs text-neutral-500 ml-auto">
            {data.cached ? "Cached • " : ""}
            Fetched {new Date(data.fetchedAt).toLocaleTimeString()} •{" "}
            {data.plays.length} total rows
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
              <Th>Side</Th>
              <Th onClick={() => setSort("line")}>
                Line{sortIndicator("line")}
              </Th>
              <Th>Game</Th>
              <Th>Best Book</Th>
              <Th onClick={() => setSort("bestAmerican")}>
                Best Odds{sortIndicator("bestAmerican")}
              </Th>
              <Th className="border-l border-neutral-800">Fair: Avg (raw)</Th>
              <Th>EV %</Th>
              <Th className="border-l border-neutral-800">Fair: Devig</Th>
              <Th>EV %</Th>
              <Th className="border-l border-neutral-800 bg-emerald-950/40">Fair: Pin-wt</Th>
              <Th
                onClick={() => setSort("ev")}
                className="bg-emerald-950/40"
              >
                EV %{sortKey === "ev" ? sortIndicator("ev") : ""}
              </Th>
              <Th onClick={() => setSort("delta")} className="border-l border-neutral-800">
                Δ{sortIndicator("delta")}
              </Th>
              <Th>Books</Th>
            </tr>
          </thead>
          <tbody>
            {filteredPlays.length === 0 && !loading && (
              <tr>
                <td colSpan={14} className="text-center text-neutral-500 py-8">
                  {data
                    ? `No plays at or above ${minEV}% EV by ${METHOD_LABELS[filterMethod]}. Try lowering the threshold or switching method.`
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
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <th
      onClick={onClick}
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
