"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { BetWithCLV } from "@/lib/types";
import UserBadge from "../UserBadge";

type ClvKey = "best" | "pinnacle" | "sharp" | "devigged";

const CLV_LABELS: Record<ClvKey, string> = {
  best: "vs Best Close",
  pinnacle: "vs Pinnacle",
  sharp: "vs Sharp Consensus",
  devigged: "vs De-vigged Market",
};

const CLV_FIELD: Record<ClvKey, keyof BetWithCLV> = {
  best: "clv_vs_best_pct",
  pinnacle: "clv_vs_pinnacle_pct",
  sharp: "clv_vs_sharp_consensus_pct",
  devigged: "clv_vs_devigged_market_pct",
};

const CLOSE_FIELD: Record<ClvKey, keyof BetWithCLV> = {
  best: "close_best_american",
  pinnacle: "close_pinnacle_american",
  sharp: "close_sharp_consensus_american",
  devigged: "close_devigged_market_american",
};

export default function BetsPage() {
  const [bets, setBets] = useState<BetWithCLV[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [clvKey, setClvKey] = useState<ClvKey>("best");

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
    const captured = bets.filter((b) => b.closing_captured_at !== null);
    const field = CLV_FIELD[clvKey];
    const clvs = captured
      .map((b) => b[field] as number | null)
      .filter((v): v is number => v !== null);
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
  }, [bets, clvKey]);

  return (
    <main className="max-w-[1400px] mx-auto p-4 sm:p-6">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Bet Log — CLV Tracking
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Closing-line value vs. four reference benchmarks. Closing prices
            captured ~2 min before each game starts.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-sm text-emerald-400 hover:text-emerald-300"
          >
            ← Back to +EV Finder
          </Link>
          <UserBadge />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          onClick={load}
          disabled={loading}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded font-medium text-sm"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>

        <div className="flex items-center gap-1 ml-2">
          <span className="text-xs text-neutral-500 mr-1">CLV view:</span>
          {(Object.keys(CLV_LABELS) as ClvKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setClvKey(k)}
              className={`px-2 py-1 rounded text-xs ${
                clvKey === k
                  ? "bg-emerald-700 text-white"
                  : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
              }`}
            >
              {CLV_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Stat label="Total bets" value={stats.total.toString()} />
        <Stat
          label="Closes captured"
          value={`${stats.captured} / ${stats.total}`}
        />
        <Stat
          label={`Avg CLV (${CLV_LABELS[clvKey]})`}
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

      {err && (
        <div className="bg-red-950/60 border border-red-800 text-red-200 rounded p-3 mb-4 text-sm">
          {err}
        </div>
      )}

      <div className="overflow-x-auto rounded border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900 text-neutral-400 text-xs uppercase">
            <tr>
              <Th>Game</Th>
              <Th>Player</Th>
              <Th>Side</Th>
              <Th>Line</Th>
              <Th>Book</Th>
              <Th>Bet Odds</Th>
              <Th>Close Odds</Th>
              <Th>CLV ({CLV_LABELS[clvKey]})</Th>
              <Th>EV @ bet</Th>
              <Th>Result</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {bets.length === 0 && !loading && (
              <tr>
                <td
                  colSpan={11}
                  className="text-center text-neutral-500 py-8"
                >
                  No bets logged yet. Click <strong>Track</strong> on a play in
                  the +EV Finder to log one.
                </td>
              </tr>
            )}
            {bets.map((b) => {
              const clv = b[CLV_FIELD[clvKey]] as number | null;
              const closeAm = b[CLOSE_FIELD[clvKey]] as number | null;
              const captured = b.closing_captured_at !== null;
              const startMs = new Date(b.commence_time).getTime();
              const pending = !captured && startMs > Date.now();
              return (
                <tr
                  key={b.id}
                  className="border-t border-neutral-800 hover:bg-neutral-900/60"
                >
                  <Td className="text-neutral-400 text-xs">
                    {b.game}
                    <div className="text-neutral-600">
                      {new Date(b.commence_time).toLocaleString()}
                    </div>
                  </Td>
                  <Td className="font-medium">{b.player}</Td>
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
                  <Td className="text-xs text-neutral-300">
                    {b.bet_book_title}
                  </Td>
                  <Td className="font-medium">
                    {fmtAmerican(b.bet_american)}
                  </Td>
                  <Td>
                    {captured ? (
                      <>
                        {fmtAmerican(closeAm)}
                        {b.close_best_book && clvKey === "best" && (
                          <div className="text-[10px] text-neutral-500">
                            {b.close_best_book}
                          </div>
                        )}
                      </>
                    ) : pending ? (
                      <span className="text-amber-500/80 text-xs">
                        pending
                      </span>
                    ) : (
                      <span className="text-neutral-500 text-xs">—</span>
                    )}
                  </Td>
                  <Td>
                    <ClvCell value={clv} />
                  </Td>
                  <Td className="text-right">
                    {b.ev_at_bet_pct !== null ? (
                      <EvCell ev={b.ev_at_bet_pct} />
                    ) : (
                      <span className="text-neutral-600">—</span>
                    )}
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
                      className="bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 text-xs"
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
                      className="text-xs text-red-400/70 hover:text-red-300"
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

      <div className="text-xs text-neutral-500 mt-4 space-y-1">
        <p>
          <strong>CLV</strong> = (your decimal odds ÷ closing decimal odds) − 1.
          Positive means you got better than the close.
        </p>
        <p>
          <strong>vs Best Close</strong>: highest available price across all
          tracked books at close. Default and most intuitive.
        </p>
        <p>
          <strong>vs Pinnacle</strong>: Pinnacle&apos;s de-vigged price.
          Pinnacle does not currently quote MLB <code>batter_hits</code> via
          the Odds API, so this is usually empty.
        </p>
        <p>
          <strong>vs Sharp Consensus</strong>: average of de-vigged sharp books
          (Pinnacle, Novig, ProphetX). In practice = Novig + ProphetX.
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
    <th className={`px-3 py-2 text-left font-medium ${className}`}>
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
      ? "text-emerald-400"
      : color === "red"
      ? "text-red-400"
      : "text-neutral-100";
  return (
    <div className="rounded border border-neutral-800 bg-neutral-900/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      <div className={`text-lg font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}

function ClvCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-neutral-600">—</span>;
  const pct = value * 100;
  const cls =
    pct > 0 ? "text-emerald-400" : pct < 0 ? "text-red-400" : "text-neutral-300";
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
      ? "text-emerald-400"
      : pct >= 2
      ? "text-emerald-500/80"
      : pct >= 0
      ? "text-neutral-300"
      : "text-red-400/70";
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
