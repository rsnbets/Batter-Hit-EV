# MLB Batter Hits +EV Finder

A Next.js app that pulls MLB batter hits prop odds from [The Odds API](https://the-odds-api.com/), computes Pinnacle-weighted de-vigged "fair" odds, and surfaces the +EV plays at the best available book.

## How it works

For every (player, line, side) it computes **three** different "fair odds" estimates side-by-side, so you can compare and decide which methodology you trust:

1. **Market Avg (raw)** — Plain average of implied probabilities across books, vig included. This is approximately what most people do by default. Tends to inflate fair % because the vig is still baked in.
2. **Market Avg (de-vigged)** — Each book's Over/Under is de-vigged with the **power method** first, then averaged equally. Removes the vig bias.
3. **Pinnacle-weighted** — Same de-vigging, but Pinnacle gets 50% of the total weight when present (other books split the other 50%). Reflects that Pinnacle is sharper than the rest. Falls back to method #2 if Pinnacle isn't offering the line.

The table shows EV% for all three methods plus a **Δ column** (delta = max − min EV across methods). Big delta = methods disagree, those plays are the most informative to study and will show you which method best matches reality over time.

`EV% = fair_prob × best_decimal_odds − 1` for each method. The "best book" is whichever bookmaker has the highest American payout for that side — same for all three methods.

The ★ indicator means Pinnacle was present and used in the Pin-weighted calc.

## Which method should you use?

Run it for a week or two. Track results. Some patterns to watch for:

- The **raw average** method will surface the most plays but a chunk of them are phantom edge (vig dressed up as EV). Plays under ~3% raw EV are usually nothing.
- The **de-vigged** methods are stricter; expect roughly 2-4 percentage points lower EV than raw on average for two-sided markets.
- **Pin-weighted** is the most opinionated. When it agrees with de-vigged average, you have strong confidence. When it disagrees noticeably, Pinnacle is telling you something the rest of the market hasn't priced in yet — often a sign of either real edge or a stale line at the best book.

## Setup

### 1. Get an Odds API key
Sign up at [the-odds-api.com](https://the-odds-api.com/) and copy your key. Player props are in the "additional markets" tier — verify your plan supports them.

### 2. Local dev (optional but recommended for first run)
```bash
git clone <your-repo-url>
cd mlb-batter-ev
npm install
cp .env.local.example .env.local
# Edit .env.local and paste your ODDS_API_KEY
npm run dev
```
Open http://localhost:3000 and click Refresh.

### 3. Deploy to Vercel via GitHub

1. Create a new GitHub repo (private is fine).
2. Push this code:
   ```bash
   git init
   git add .
   git commit -m "initial commit"
   git branch -M main
   git remote add origin git@github.com:YOUR_USERNAME/mlb-batter-ev.git
   git push -u origin main
   ```
3. Go to [vercel.com](https://vercel.com), click **Add New → Project**, and import your GitHub repo.
4. In the import screen, expand **Environment Variables** and add:
   - Name: `ODDS_API_KEY`
   - Value: your key
5. Click **Deploy**. Done — Vercel will auto-deploy on every push to `main`.

### 4. Vercel plan note
The API route is configured with `maxDuration = 60` (seconds), which requires Vercel **Pro**. If you're on the free Hobby plan, edit `app/api/odds/route.ts` and change to `maxDuration = 10`. With ~15 MLB games and parallel fetching, 10s is usually enough but tight — you may occasionally see timeouts on slow API days.

## Credit usage

Each refresh costs roughly:
- 1 credit for the events list
- 30 credits per game (10 per region × 3 regions: us, us2, eu) for `batter_hits`

A typical 15-game slate ≈ **~450 credits per refresh**. The app caches results for 60 seconds to prevent accidental double-fetching.

If you don't want Pinnacle, drop `eu` from `REGIONS` in `lib/oddsApi.ts` to cut cost by ~33%.

## Tuning

All knobs are in `lib/`:
- `lib/math.ts` → `PINNACLE_WEIGHT` (default 0.5). Try 0.4 or 0.6 to taste.
- `lib/oddsApi.ts` → `TARGET_BOOKS` set. Add/remove books here.
- `lib/oddsApi.ts` → 36-hour event horizon. Adjust if you want today-only.
- `app/api/odds/route.ts` → `CACHE_TTL_MS`.

## Adding more markets later

To add e.g. home runs, total bases:
1. In `lib/oddsApi.ts`, change `MARKET` to a list (`["batter_hits", "batter_home_runs", ...]`) and request them all in one API call (comma-separated `markets=` param — same credit cost as one).
2. Update `buildBookOffers` and `buildPlaysForEvent` to loop over markets.
3. Add a market filter to the UI.

This is wired so it's a small change. Happy to add it when you're ready.

## Disclaimer

This is a tool. Lines move, books limit, sharp money exists. +EV in theory ≠ guaranteed profit. Bet responsibly.
