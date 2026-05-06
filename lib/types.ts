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
  overAmerican: number;
  underAmerican: number;
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

  // Three fair-odds estimates
  marketAvgRaw: FairEstimate;       // current method: plain avg of raw implied probs (vig in)
  marketAvgDevig: FairEstimate;     // de-vigged then averaged (no Pinnacle weighting)
  pinnacleWeighted: FairEstimate;   // de-vigged + Pinnacle-weighted (recommended)

  // Best book info (same for all methods — best price doesn't change)
  bestBook: string;
  bestBookKey: string;
  bestAmerican: number;
  bestDecimal: number;

  numBooks: number;
  pinnacleUsed: boolean;
  sharpCount: number;

  // Per-book snapshot — used for "Single Book" / target-book EV mode in the UI
  allBookOffers: BookOfferSnapshot[];
}
