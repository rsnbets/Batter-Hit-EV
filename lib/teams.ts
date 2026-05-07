// MLB team full-name → standard abbreviation. Used to compress "Game" cells
// from "St. Louis Cardinals @ San Diego Padres" → "STL @ SD".

const MLB_TEAM_ABBREV: Record<string, string> = {
  "Arizona Diamondbacks": "ARI",
  "Atlanta Braves": "ATL",
  "Baltimore Orioles": "BAL",
  "Boston Red Sox": "BOS",
  "Chicago Cubs": "CHC",
  "Chicago White Sox": "CWS",
  "Cincinnati Reds": "CIN",
  "Cleveland Guardians": "CLE",
  "Colorado Rockies": "COL",
  "Detroit Tigers": "DET",
  "Houston Astros": "HOU",
  "Kansas City Royals": "KC",
  "Los Angeles Angels": "LAA",
  "Los Angeles Dodgers": "LAD",
  "Miami Marlins": "MIA",
  "Milwaukee Brewers": "MIL",
  "Minnesota Twins": "MIN",
  "New York Mets": "NYM",
  "New York Yankees": "NYY",
  "Athletics": "ATH",
  "Oakland Athletics": "OAK",
  "Philadelphia Phillies": "PHI",
  "Pittsburgh Pirates": "PIT",
  "San Diego Padres": "SD",
  "San Francisco Giants": "SF",
  "Seattle Mariners": "SEA",
  "St. Louis Cardinals": "STL",
  "Tampa Bay Rays": "TB",
  "Texas Rangers": "TEX",
  "Toronto Blue Jays": "TOR",
  "Washington Nationals": "WSH",
};

function teamAbbrev(name: string): string {
  if (MLB_TEAM_ABBREV[name]) return MLB_TEAM_ABBREV[name];
  // Fallback for unrecognized names: take the first 3 letters of the last word.
  const last = name.trim().split(/\s+/).pop() ?? name;
  return last.slice(0, 3).toUpperCase();
}

/**
 * Convert "Away Team @ Home Team" → "AWY @ HOM".
 * Returns the original string if the format isn't recognized.
 */
export function abbreviateGame(fullGame: string): string {
  const parts = fullGame.split(" @ ");
  if (parts.length !== 2) return fullGame;
  return `${teamAbbrev(parts[0])} @ ${teamAbbrev(parts[1])}`;
}
