"use client";

import Link from "next/link";
import { Fragment, useEffect, useState, useMemo } from "react";
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
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [trackPlay, setTrackPlay] = useState<PlayProw | null>(null);
  // Tracks remaining credits at the moment the page was first loaded so we
  // can show "credits used this session". Set on the first successful load.
  const [sessionStartCredits, setSessionStartCredits] = useState<number | null>(
    null
  );

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
      const remNum = json.remainingRequests
        ? Number(json.remainingRequests)
        : NaN;
      if (
        Number.isFinite(remNum) &&
        sessionStartCredits === null &&
        !json.cached
      ) {
        // Anchor the session counter to the first non-cached response we see.
        setSessionStartCredits(remNum);
      }
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
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            MLB Batter Hits — +EV Finder
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Three fair-odds methods side-by-side. Compare and pick what works for you.
          </p>
        </div>
        <Link
          href="/bets"
          className="text-sm text-emerald-400 hover:text-emerald-300"
        >
          View Bet Log →
        </Link>
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
          <div className="text-xs text-neutral-500 ml-auto text-right">
            {data.cached ? "Cached • " : ""}
            Fetched {new Date(data.fetchedAt).toLocaleTimeString()} •{" "}
            {filteredPlays.length}/{data.plays.length} rows
            {data.remainingRequests && (() => {
              const rem = Number(data.remainingRequests);
              const used =
                sessionStartCredits !== null
                  ? Math.max(0, sessionStartCredits - rem)
                  : null;
              const lowColor =
                rem < 500
                  ? "text-red-400"
                  : rem < 2000
                  ? "text-amber-400"
                  : "text-neutral-500";
              return (
                <>
                  {" "}• <span className={lowColor}>API credits left: {rem.toLocaleString()}</span>
                  {used !== null && used > 0 && (
                    <> <span className="text-neutral-600">(used {used} this session)</span></>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {data?.remainingRequests && Number(data.remainingRequests) < 2000 && (
        <div
          className={`rounded p-3 mb-4 text-sm ${
            Number(data.remainingRequests) < 500
              ? "bg-red-950/60 border border-red-800 text-red-200"
              : "bg-amber-950/50 border border-amber-800/60 text-amber-200"
          }`}
        >
          ⚠️ Only <strong>{Number(data.remainingRequests).toLocaleString()}</strong> API credits remaining.
          {" "}Each manual Refresh now costs ~90 credits (15 events × 3 regions × 2 markets).
          {" "}Avoid hitting Refresh repeatedly.
        </div>
      )}

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
              <Th>Track</Th>
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
              <FilterTd />
            </tr>
          </thead>
          <tbody>
            {filteredPlays.length === 0 && !loading && (
              <tr>
                <td colSpan={15} className="text-center text-neutral-500 py-8">
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
              const rowKey = `${p.player}-${p.line}-${p.side}-${i}`;
              const expanded = expandedKey === rowKey;
              const extras = p.numBooks - p.numDevigBooks;
              return (
                <Fragment key={rowKey}>
                  <tr
                    onClick={() => setExpandedKey(expanded ? null : rowKey)}
                    className={`border-t border-neutral-800 cursor-pointer hover:bg-neutral-900/60 ${
                      expanded ? "bg-neutral-900/40" : ""
                    }`}
                    title="Click to see all books for this line"
                  >
                    <Td className="font-medium">
                      <span className="text-neutral-500 mr-1 select-none">
                        {expanded ? "▾" : "▸"}
                      </span>
                      {p.player}
                    </Td>
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
                    <Td
                      className="text-neutral-500 text-xs"
                      title={`${p.numDevigBooks} de-vig + ${extras} one-sided`}
                    >
                      {p.numBooks}
                      {extras > 0 && (
                        <span className="text-amber-500/70">+{extras}</span>
                      )}
                    </Td>
                    <Td>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTrackPlay(p);
                        }}
                        className="px-2 py-0.5 bg-emerald-700 hover:bg-emerald-600 rounded text-xs font-medium"
                      >
                        Track
                      </button>
                    </Td>
                  </tr>
                  {expanded && (
                    <tr className="bg-neutral-950">
                      <td
                        colSpan={15}
                        className="px-3 py-3 border-t border-neutral-800"
                      >
                        <BookBreakdown play={p} />
                      </td>
                    </tr>
                  )}
                </Fragment>
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

      {trackPlay && (
        <TrackModal
          play={trackPlay}
          onClose={() => setTrackPlay(null)}
        />
      )}
    </main>
  );
}

function TrackModal({
  play,
  onClose,
}: {
  play: PlayProw;
  onClose: () => void;
}) {
  // Books that quoted this side at this line — what the user could realistically
  // have bet at. Sorted best price first.
  const offers = useMemo(() => {
    const isOver = play.side === "Over";
    return play.allBookOffers
      .map((o) => ({
        bookKey: o.bookKey,
        bookTitle: o.bookTitle,
        american: isOver ? o.overAmerican : o.underAmerican,
      }))
      .filter((o): o is { bookKey: string; bookTitle: string; american: number } => o.american !== null)
      .sort((a, b) => b.american - a.american);
  }, [play]);

  const [bookKey, setBookKey] = useState(play.bestBookKey);
  const [american, setAmerican] = useState<number>(play.bestAmerican);
  const [stake, setStake] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onBookChange = (key: string) => {
    setBookKey(key);
    const match = offers.find((o) => o.bookKey === key);
    if (match) setAmerican(match.american);
  };

  const submit = async () => {
    setSubmitting(true);
    setErr(null);
    try {
      const book = offers.find((o) => o.bookKey === bookKey);
      if (!book) throw new Error("Book not found");
      const res = await fetch("/api/bets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          player: play.player,
          line: play.line,
          side: play.side,
          bet_book_key: book.bookKey,
          bet_book_title: book.bookTitle,
          bet_american: american,
          stake,
          event_id: play.eventId,
          game: play.game,
          commence_time: play.commenceTime,
          fair_devigged_american: play.marketAvgDevig.fairAmerican,
          fair_pinnacle_weighted_american: play.pinnacleWeighted.fairAmerican,
          ev_at_bet_pct: play.pinnacleWeighted.evPercent,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
      setDone(true);
      setTimeout(onClose, 900);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="bg-neutral-950 border border-neutral-800 rounded-lg p-5 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold">Track bet</h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              {play.player} — {play.side} {play.line}
            </p>
            <p className="text-xs text-neutral-500">{play.game}</p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-300 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <div className="text-xs text-neutral-400 mb-1">Book</div>
            <select
              value={bookKey}
              onChange={(e) => onBookChange(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm"
            >
              {offers.map((o) => (
                <option key={o.bookKey} value={o.bookKey}>
                  {o.bookTitle} ({o.american > 0 ? `+${o.american}` : o.american})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className="text-xs text-neutral-400 mb-1">
              American odds (override if you got a different price)
            </div>
            <input
              type="number"
              value={american}
              onChange={(e) => setAmerican(Number(e.target.value))}
              className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm"
            />
          </label>

          <label className="block">
            <div className="text-xs text-neutral-400 mb-1">Stake (units)</div>
            <input
              type="number"
              step="0.1"
              value={stake}
              onChange={(e) => setStake(Number(e.target.value))}
              className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-sm"
            />
          </label>
        </div>

        {err && (
          <div className="mt-3 bg-red-950/60 border border-red-800 text-red-200 rounded p-2 text-xs">
            {err}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-sm"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting || done}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded text-sm font-medium"
          >
            {done ? "Tracked ✓" : submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
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
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <td className={`px-3 py-2 ${className}`} title={title}>
      {children}
    </td>
  );
}

function FilterTd({
  children,
  className = "",
}: {
  children?: React.ReactNode;
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

function fmtAmerican(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return n > 0 ? `+${n}` : String(n);
}

function BookBreakdown({ play }: { play: PlayProw }) {
  const isOver = play.side === "Over";
  // Sort by the side this row is for (best at top), then by book name
  const offers = [...play.allBookOffers].sort((a, b) => {
    const av = isOver ? a.overAmerican : a.underAmerican;
    const bv = isOver ? b.overAmerican : b.underAmerican;
    const aHas = av !== null;
    const bHas = bv !== null;
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    if (aHas && bHas && av !== bv) return (bv as number) - (av as number);
    return a.bookTitle.localeCompare(b.bookTitle);
  });
  return (
    <div>
      <div className="text-xs text-neutral-400 mb-2">
        {play.player} — {play.side} {play.line} —{" "}
        <span className="text-neutral-500">
          {play.numDevigBooks} books de-vigged, {play.numBooks - play.numDevigBooks} one-sided
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse">
          <thead className="text-neutral-500">
            <tr>
              <th className="text-left pr-6 pb-1">Book</th>
              <th className="text-right pr-6 pb-1">Over</th>
              <th className="text-right pr-6 pb-1">Under</th>
              <th className="text-left pl-2 pb-1">Source</th>
            </tr>
          </thead>
          <tbody>
            {offers.map((o) => {
              const sideHighlight = isOver
                ? o.overAmerican === play.bestAmerican
                : o.underAmerican === play.bestAmerican;
              return (
                <tr
                  key={o.bookKey}
                  className="border-t border-neutral-800/60"
                >
                  <td
                    className={`pr-6 py-0.5 ${
                      sideHighlight ? "text-emerald-400 font-semibold" : "text-neutral-300"
                    }`}
                  >
                    {o.bookTitle}
                  </td>
                  <td
                    className={`text-right pr-6 py-0.5 ${
                      isOver && sideHighlight ? "text-emerald-400 font-semibold" : "text-neutral-300"
                    }`}
                  >
                    {fmtAmerican(o.overAmerican)}
                  </td>
                  <td
                    className={`text-right pr-6 py-0.5 ${
                      !isOver && sideHighlight ? "text-emerald-400 font-semibold" : "text-neutral-300"
                    }`}
                  >
                    {fmtAmerican(o.underAmerican)}
                  </td>
                  <td className="pl-2 py-0.5 text-neutral-500">
                    {o.devigged ? "de-vig" : "one-sided"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
