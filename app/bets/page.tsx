"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { BetWithCLV, ReferenceBookKey } from "@/lib/types";
import { REFERENCE_BOOK_OPTIONS } from "@/lib/types";
import { americanToDecimal } from "@/lib/math";
import { abbreviateGame } from "@/lib/teams";
import UserBadge from "../UserBadge";
import ReferenceBookSelect from "../ReferenceBookSelect";
import { useReferenceBook } from "../useReferenceBook";
import Hero from "../Hero";

type ClvKey = "best" | "ref" | "sharp" | "devigged";

const CLV_LABELS: Record<ClvKey, string> = {
  best: "vs Best Close",
  ref: "vs Reference",
  sharp: "vs Sharp Consensus",
  devigged: "vs De-vigged Market",
};

// "EV @ bet" column tracks the same fair-odds method you're judging close-line
// value against. Sharp pool views use pin-weighted EV. De-vigged Market view
// uses devig-average EV. Existing bets logged before ev_at_bet_devig_pct was
// added show "—" on the De-vigged view.
const EV_FIELD: Record<ClvKey, keyof BetWithCLV> = {
  best: "ev_at_bet_pct",
  ref: "ev_at_bet_pct",
  sharp: "ev_at_bet_pct",
  devigged: "ev_at_bet_devig_pct",
};

const EV_LABEL: Record<ClvKey, string> = {
  best: "Sharp",
  ref: "Sharp",
  sharp: "Sharp",
  devigged: "Devig",
};

export default function BetsPage() {
  const [bets, setBets] = useState<BetWithCLV[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [clvKey, setClvKey] = useState<ClvKey>("best");
  const [referenceBook, setReferenceBook] = useReferenceBook();

  // Resolve the close + CLV for a given bet under the active view + reference.
  // Returns nulls when the chosen book/benchmark didn't have data at close.
  const resolveCloseAndClv = (
    b: BetWithCLV
  ): { close: number | null; clv: number | null; sourceLabel: string | null } => {
    const betDecimal = americanToDecimal(b.bet_american);
    let close: number | null = null;
    let sourceLabel: string | null = null;

    if (clvKey === "best") {
      close = b.close_best_american;
      sourceLabel = b.close_best_book ?? null;
    } else if (clvKey === "sharp") {
      close = b.close_sharp_consensus_american;
    } else if (clvKey === "devigged") {
      close = b.close_devigged_market_american;
    } else {
      // "ref" view — depends on which reference book is selected.
      if (referenceBook === "pool") {
        close = b.close_sharp_consensus_american;
        sourceLabel = "Sharp Pool Avg";
      } else {
        close = b.close_per_book?.[referenceBook] ?? null;
        sourceLabel =
          REFERENCE_BOOK_OPTIONS.find((o) => o.key === referenceBook)?.label ??
          referenceBook;
      }
    }

    if (close === null) return { close: null, clv: null, sourceLabel };
    const closeDecimal = americanToDecimal(close);
    return { close, clv: betDecimal / closeDecimal - 1, sourceLabel };
  };

  const refLabel =
    REFERENCE_BOOK_OPTIONS.find((o) => o.key === referenceBook)?.label ??
    "Sharp";

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/bets", { cache: "no-store" });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setBets(json.bets || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onDelete = async (id: string) => {
    if (!confirm("Delete this bet?")) return;
    const res = await fetch(`/api/bets/${id}`, { method: "DELETE" });
    if (res.ok) setBets((bs) => bs.filter((b) => b.id !== id));
  };

  const onResult = async (id: string, result: BetWithCLV["result"]) => {
    const res = await fetch(`/api/bets/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ result }),
    });
    if (res.ok) {
      const json = await res.json();
      setBets((bs) => bs.map((b) => (b.id === id ? { ...b, ...json.bet } : b)));
    }
  };

  const stats = useMemo(() => {
    const clvs: number[] = [];
    for (const b of bets) {
      if (b.closing_captured_at === null) continue;
      const { clv } = resolveCloseAndClv(b);
      if (clv !== null) clvs.push(clv);
    }
    if (clvs.length === 0) {
      return { total: bets.length, captured: 0, avgClv: null, posPct: null };
    }
    const avg = clvs.reduce((s, v) => s + v, 0) / clvs.length;
    const pos = clvs.filter((v) => v > 0).length;
    return {
      total: bets.length,
      captured: clvs.length,
      avgClv: avg,
      posPct: pos / clvs.length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bets, clvKey, referenceBook]);

  // Settlement stats: W-L record, units P/L, win rate, ROI.
  // Excludes pushes and voids from win-rate / staked totals (they're return-of-stake).
  const settlement = useMemo(() => {
    let wins = 0;
    let losses = 0;
    let pushes = 0;
    let voids = 0;
    let units = 0; // net P/L in units
    let staked = 0; // total stake on settled (W/L only) bets
    for (const b of bets) {
      const stake = Number(b.stake) || 0;
      if (b.result === "win") {
        wins++;
        staked += stake;
        units += stake * (americanToDecimal(b.bet_american) - 1);
      } else if (b.result === "loss") {
        losses++;
        staked += stake;
        units -= stake;
      } else if (b.result === "push") {
        pushes++;
      } else if (b.result === "void") {
        voids++;
      }
    }
    const settled = wins + losses;
    return {
      wins,
      losses,
      pushes,
      voids,
      settled,
      units,
      staked,
      winRate: settled > 0 ? wins / settled : null,
      roi: staked > 0 ? units / staked : null,
    };
  }, [bets]);

  const heroMeta = (
    <>
      <Link href="/" className="text-ppcyan hover:opacity-80">
        ← +EV Finder
      </Link>
      <span className="mx-2 text-ppborder2">·</span>
      Closing-line value vs. four reference benchmarks
    </>
  );

  return (
    <main className="max-w-[1400px] mx-auto px-4 sm:px-6 pb-12">
      <div className="flex justify-end pt-2">
        <UserBadge />
      </div>

      <Hero tagline="Bet Log — CLV Tracking" meta={heroMeta} />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          onClick={load}
          disabled={loading}
          className="px-3.5 py-2 bg-ppcyan border border-ppcyan text-[#06101e] rounded-[10px] text-[11px] font-bold tracking-[1.5px] uppercase hover:opacity-90 disabled:opacity-50 transition-opacity"
          style={{ boxShadow: "0 0 16px rgba(0,212,255,0.25)" }}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>

        <div className="flex items-center gap-1.5 ml-2 flex-wrap">
          <span className="text-[10px] tracking-[1.5px] uppercase text-dim mr-1">
            CLV
          </span>
          {(Object.keys(CLV_LABELS) as ClvKey[]).map((k) => {
            const label =
              k === "ref" ? `vs ${refLabel}` : CLV_LABELS[k];
            const active = clvKey === k;
            return (
              <button
                key={k}
                onClick={() => setClvKey(k)}
                className={`px-3 py-1.5 rounded-[10px] text-[10px] font-bold tracking-[1.5px] uppercase transition-colors ${
                  active
                    ? "bg-ppcyan border border-ppcyan text-[#06101e]"
                    : "border border-ppborder2 bg-panel text-pptext hover:border-ppcyan hover:text-ppcyan"
                }`}
                style={
                  active
                    ? { boxShadow: "0 0 16px rgba(0,212,255,0.25)" }
                    : undefined
                }
              >
                {label}
              </button>
            );
          })}
        </div>

        <ReferenceBookSelect
          value={referenceBook}
          onChange={setReferenceBook}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Stat label="Total bets" value={stats.total.toString()} />
        <Stat
          label="Closes captured"
          value={`${stats.captured} / ${stats.total}`}
        />
        <Stat
          label={`Avg CLV (${
            clvKey === "ref" ? `vs ${refLabel}` : CLV_LABELS[clvKey]
          })`}
          value={
            stats.avgClv === null ? "—" : `${(stats.avgClv * 100).toFixed(2)}%`
          }
          color={
            stats.avgClv === null
              ? "neutral"
              : stats.avgClv > 0
              ? "green"
              : "red"
          }
        />
        <Stat
          label="% positive CLV"
          value={
            stats.posPct === null ? "—" : `${(stats.posPct * 100).toFixed(0)}%`
          }
          color={
            stats.posPct === null
              ? "neutral"
              : stats.posPct >= 0.55
              ? "green"
              : stats.posPct < 0.45
              ? "red"
              : "neutral"
          }
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Stat
          label="Record (W-L-P)"
          value={`${settlement.wins}-${settlement.losses}-${settlement.pushes}`}
        />
        <Stat
          label="Net P/L (units)"
          value={
            settlement.settled === 0
              ? "—"
              : `${settlement.units >= 0 ? "+" : ""}${settlement.units.toFixed(2)}u`
          }
          color={
            settlement.settled === 0
              ? "neutral"
              : settlement.units > 0
              ? "green"
              : settlement.units < 0
              ? "red"
              : "neutral"
          }
        />
        <Stat
          label="Win rate"
          value={
            settlement.winRate === null
              ? "—"
              : `${(settlement.winRate * 100).toFixed(0)}%`
          }
        />
        <Stat
          label="ROI"
          value={
            settlement.roi === null
              ? "—"
              : `${settlement.roi >= 0 ? "+" : ""}${(settlement.roi * 100).toFixed(1)}%`
          }
          color={
            settlement.roi === null
              ? "neutral"
              : settlement.roi > 0
              ? "green"
              : settlement.roi < 0
              ? "red"
              : "neutral"
          }
        />
      </div>

      {err && (
        <div className="bg-[var(--red-dim)] border border-ppred/40 text-ppred rounded p-3 mb-4 text-sm">
          {err}
        </div>
      )}

      <div className="overflow-x-auto rounded-[14px] border border-ppborder bg-panel">
        <table className="w-full text-sm">
          <thead className="bg-surface2 text-muted text-[10px] tracking-[1.5px] font-bold uppercase border-b border-ppborder2">
            <tr>
              <Th>Game</Th>
              <Th>Player</Th>
              <Th>Side</Th>
              <Th>Line</Th>
              <Th>Book</Th>
              <Th>Bet Odds</Th>
              <Th>Stake</Th>
              <Th>Close Odds</Th>
              <Th>CLV ({clvKey === "ref" ? `vs ${refLabel}` : CLV_LABELS[clvKey]})</Th>
              <Th>EV @ bet ({EV_LABEL[clvKey]})</Th>
              <Th>Result</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {bets.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={12}
                  className="text-center text-muted py-8"
                >
                  No bets logged yet. Click <strong>Track</strong> on a play in
                  the +EV Finder to log one.
                </td>
              </tr>
            )}
            {bets.map((b) => {
              const resolved = resolveCloseAndClv(b);
              const clv = resolved.clv;
              const closeAm = resolved.close;
              const captured = b.closing_captured_at !== null;
              const startMs = new Date(b.commence_time).getTime();
              const pending = !captured && startMs > Date.now();
              return (
                <tr
                  key={b.id}
                  className="border-t border-ppborder hover:bg-surface2"
                >
                  <Td className="text-muted text-xs whitespace-nowrap" title={b.game}>
                    {abbreviateGame(b.game)}
                    <div className="text-dim">
                      {new Date(b.commence_time).toLocaleString()}
                    </div>
                  </Td>
                  <Td className="font-medium whitespace-nowrap">{b.player}</Td>
                  <Td>
                    <span
                      className={
                        b.side === "Over"
                          ? "text-sky-400"
                          : "text-orange-400"
                      }
                    >
                      {b.side}
                    </span>
                  </Td>
                  <Td>{b.line}</Td>
                  <Td className="text-xs text-pptext">
                    {b.bet_book_title}
                  </Td>
                  <Td className="font-medium">
                    {fmtAmerican(b.bet_american)}
                  </Td>
                  <Td className="text-pptext">
                    {Number(b.stake).toFixed(b.stake % 1 === 0 ? 0 : 2)}u
                  </Td>
                  <Td>
                    {captured ? (
                      <>
                        {fmtAmerican(closeAm)}
                        {resolved.sourceLabel && (
                          <div className="text-[10px] text-muted">
                            {resolved.sourceLabel}
                          </div>
                        )}
                      </>
                    ) : pending ? (
                      <span className="text-ppyellow text-xs">
                        pending
                      </span>
                    ) : (
                      <span className="text-muted text-xs">—</span>
                    )}
                  </Td>
                  <Td>
                    <ClvCell value={clv} />
                  </Td>
                  <Td className="text-right">
                    {(() => {
                      const ev = b[EV_FIELD[clvKey]] as number | null;
                      return ev !== null ? (
                        <EvCell ev={ev} />
                      ) : (
                        <span className="text-dim">—</span>
                      );
                    })()}
                  </Td>
                  <Td>
                    <select
                      value={b.result ?? ""}
                      onChange={(e) =>
                        onResult(
                          b.id,
                          (e.target.value || null) as BetWithCLV["result"]
                        )
                      }
                      className="bg-surface2 border border-ppborder2 rounded px-1 py-0.5 text-xs text-pptext"
                    >
                      <option value="">—</option>
                      <option value="win">Win</option>
                      <option value="loss">Loss</option>
                      <option value="push">Push</option>
                      <option value="void">Void</option>
                    </select>
                  </Td>
                  <Td>
                    <button
                      onClick={() => onDelete(b.id)}
                      className="text-xs text-ppred/70 hover:text-red-300"
                      title="Delete bet"
                    >
                      ✕
                    </button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-muted mt-4 space-y-1">
        <p>
          <strong>CLV</strong> = (your decimal odds ÷ closing decimal odds) − 1.
          Positive means you got better than the close.
        </p>
        <p>
          <strong>vs Best Close</strong>: highest available price across all
          tracked books at close. Most intuitive.
        </p>
        <p>
          <strong>vs Reference</strong>: your selected reference book&apos;s
          de-vigged closing price (set via the &quot;Reference&quot; dropdown).
          Use &quot;Sharp Pool Avg&quot; for an aggregate; pick a specific book
          (Novig, ProphetX, etc.) to anchor against that one.
        </p>
        <p>
          <strong>vs Sharp Consensus</strong>: average of de-vigged sharp books.
          Pinnacle, Novig, ProphetX qualify; Pinnacle doesn&apos;t quote MLB
          batter_hits, so in practice this is Novig + ProphetX.
        </p>
        <p>
          <strong>vs De-vigged Market</strong>: average of every de-vigged
          book&apos;s implied probability for that side.
        </p>
      </div>
    </main>
  );
}

function Th({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`px-2 py-2 text-left font-medium whitespace-nowrap ${className}`}
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
    <td className={`px-2 py-2 ${className}`} title={title}>
      {children}
    </td>
  );
}

function Stat({
  label,
  value,
  color = "neutral",
}: {
  label: string;
  value: string;
  color?: "neutral" | "green" | "red";
}) {
  const valueClass =
    color === "green"
      ? "text-ppgreen"
      : color === "red"
      ? "text-ppred"
      : "text-pptext";
  return (
    <div className="rounded-[10px] border border-ppborder bg-panel px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className={`text-lg font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}

function ClvCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-dim">—</span>;
  const pct = value * 100;
  const cls =
    pct > 0 ? "text-ppgreen" : pct < 0 ? "text-ppred" : "text-pptext";
  const sign = pct > 0 ? "+" : "";
  return (
    <span className={cls}>
      {sign}
      {pct.toFixed(2)}%
    </span>
  );
}

function EvCell({ ev }: { ev: number }) {
  const pct = ev * 100;
  const cls =
    pct >= 5
      ? "text-ppgreen"
      : pct >= 2
      ? "text-ppgreen/80"
      : pct >= 0
      ? "text-pptext"
      : "text-ppred/70";
  const sign = pct >= 0 ? "+" : "";
  return (
    <span className={cls}>
      {sign}
      {pct.toFixed(2)}%
    </span>
  );
}

function fmtAmerican(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return n > 0 ? `+${n}` : String(n);
}
