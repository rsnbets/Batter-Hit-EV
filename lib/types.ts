// Types matching The Odds API v4 player props response shape

export interface OddsApiOutcome {
  name: "Over" | "Under";
  description: string; // player name
  price: number; // American odds
  point: number; // line (e.g. 0.5, 1.5)
}

export interface OddsApiMarket {
  key: string;
  outcomes: OddsApiOutcome[];
}

export interface OddsApiBookmaker {
  key: string;
  title: string;
  markets: OddsApiMarket[];
}

export interface OddsApiEvent {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: OddsApiBookmaker[];
}

// Our derived/computed types

export interface BookOffer {
  bookKey: string;
  bookTitle: string;
  overAmerican: number;
  underAmerican: number;
  overImplied: number; // raw implied prob from price (vig included)
  underImplied: number;
  overDevigged: number; // power-method de-vigged
  underDevigged: number;
}

export interface BookOfferSnapshot {
  bookKey: string;
  bookTitle: string;
  // null = book did not quote that side at this line (only happens for
  // one-sided alternate-market entries from books like FanDuel/Caesars)
  overAmerican: number | null;
  underAmerican: number | null;
  // true if this book contributed to the de-vig fair calc (had both sides)
  devigged: boolean;
}

/**
 * Fair-odds estimate using one specific methodology.
 * We compute three of these per play so you can compare them.
 */
export interface FairEstimate {
  fairProb: number;
  fairAmerican: number;
  evPercent: number; // vs the best price available
}

export interface PlayProw {
  player: string;
  market: string;
  line: number;
  side: "Over" | "Under";
  game: string;
  commenceTime: string;
  eventId: string;

  // Three fair-odds estimates
  marketAvgRaw: FairEstimate;       // current method: plain avg of raw implied probs (vig in)
  marketAvgDevig: FairEstimate;     // de-vigged then averaged (no Pinnacle weighting)
  pinnacleWeighted: FairEstimate;   // de-vigged + Pinnacle-weighted (recommended)

  // Best book info (same for all methods — best price doesn't change)
  bestBook: string;
  bestBookKey: string;
  bestAmerican: number;
  bestDecimal: number;

  numBooks: number;        // total books quoting this side (de-vig + one-sided)
  numDevigBooks: number;   // subset that contributed to the de-vig fair calc
  pinnacleUsed: boolean;
  sharpCount: number;

  // Per-book snapshot — used for "Single Book" / target-book EV mode in the UI
  // Includes both two-sided and one-sided offers (with null for missing side).
  allBookOffers: BookOfferSnapshot[];
}

// CLV tracking

export interface BetRow {
  id: string;
  created_at: string;

  player: string;
  market: string;
  line: number;
  side: "Over" | "Under";

  bet_book_key: string;
  bet_book_title: string;
  bet_american: number;
  stake: number;

  event_id: string;
  game: string;
  commence_time: string;

  fair_devigged_american: number | null;
  fair_pinnacle_weighted_american: number | null;
  ev_at_bet_pct: number | null;

  closing_captured_at: string | null;
  close_best_book: string | null;
  close_best_american: number | null;
  close_pinnacle_american: number | null;
  close_sharp_consensus_american: number | null;
  close_devigged_market_american: number | null;

  result: "win" | "loss" | "push" | "void" | null;
}

export interface BetWithCLV extends BetRow {
  clv_vs_best_pct: number | null;
  clv_vs_pinnacle_pct: number | null;
  clv_vs_sharp_consensus_pct: number | null;
  clv_vs_devigged_market_pct: number | null;
}
