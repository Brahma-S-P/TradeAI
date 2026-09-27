# Daily Snapshot Engine — Design & Data Spec

How the Stock Picker turns **live Kite data** into filterable indicator values, once per day.

---

## 1. The core idea

Instead of computing indicators live every time you click **Run** (slow, hits Kite rate limits, repeats work), we do it **once per day**:

```
First app open of the day
        │
        ▼
Is there a snapshot for today?  ──yes──►  do nothing (already have it)
        │ no
        ▼
Pull daily candles for every stock in the tracked indices from Kite
        │
        ▼
Compute ALL indicators per stock  →  compute cross-sectional ranks/breadth
        │
        ▼
Save one row per stock into `indicator_snapshot` (date, symbol, values JSON)
        │
        ▼
Filters just READ from the DB  →  Run is instant, no Kite calls
```

**Result:** Filtering becomes a simple DB read + numeric comparison. Kite is touched only once per day, in one batched job.

---

## 2. What is pulled from Kite

| Data | Kite call | When | Frequency |
|---|---|---|---|
| Instrument master (tokens, symbols) | `get_instruments("NSE")` | On setup / weekly | Rare |
| **Daily OHLCV candles** (the main input) | `get_historical_data(token, from, to, "day")` | Daily snapshot job | Once/day per stock |
| Latest quote / LTP (optional intraday refresh) | `get_ltp([...])` / `get_quote([...])` | On demand | Live |

Everything downstream is **computed from the daily OHLCV candles** — we do not pull a separate feed per indicator.

---

## 3. How many values (candles) are considered — the lookback

Every indicator needs *N* past daily candles. We pull **one window large enough for the most demanding indicator**, then each indicator slices what it needs from that window.

**The most demanding indicators set the floor:**

| Indicator | Trading days needed |
|---|---|
| 252-Day Return, Beta 252D, 52-week High/Low | 252 |
| **252D Return excluding last 21D** | 252 + 21 = **273** |
| SMA/EMA 200, SMA200 slope | 200 (+ a few for slope) |
| Historical Volatility 120D, Max Drawdown 120D | 120 |

**→ Pulling ~400 calendar days ≈ 275 trading sessions covers every daily-based indicator** (with a safety buffer for holidays/weekends).

**Configurable knob:** `lookback_days` (default **400**). Raise it only if you add an indicator needing more history.

Per-indicator windows (how many of those candles each one uses):

| Window family | Values used |
|---|---|
| Returns | last 1, 3, 5, 10, 20, 40, 60, 120, 252 closes |
| SMA / EMA | last 5 / 10 / 20 / 50 / 100 / 200 closes |
| RSI | 14 (also 7, 21) closes |
| MACD | 12 & 26 EMA + 9 signal |
| ATR / ADX / DI | 14 (also 20/50) candles (H, L, C) |
| Bollinger | 20 closes + 2σ |
| Volatility (HV) | 5 / 10 / 20 / 60 / 120 daily returns |
| Beta / Correlation | 20 / 60 / 120 / 252 paired daily returns (stock vs Nifty) |
| Drawdown | rolling 20 / 60 / 120 highs |

---

## 4. Indicator tiers — what we can compute, and from what

Not every filter in the catalog can come from daily candles. Be honest about sources:

### Tier 1 — Computable **now** from daily OHLCV ✅ (the bulk, ~60%)
Price Momentum, Moving Averages, RSI/MACD/ADX, ATR & Volatility, Bollinger, Breakout, Trend Structure, Trend Quality, Drawdown, Pullback Quality, Price Action, Gap Momentum, Volume, Return Distribution, Autocorrelation, Statistical Momentum, Risk-Adjusted Momentum (Sharpe/Sortino), Beta & Correlation (vs Nifty), Money Flow (OBV/CMF/MFI — need volume, which daily candles carry).

### Tier 2 — Computable **after** all stocks are pulled (cross-sectional pass) ✅
These rank a stock **against the whole universe**, so they run in a second pass once every stock's Tier-1 values exist: Cross-Sectional Ranking (percentiles), Market Breadth, Market Regime (from Nifty index candles), Sector Momentum, Peer Momentum, RS Percentile, all `*_percentile` fields.

### Tier 3 — Needs **intraday** data (not in the daily snapshot) ⚠️
Intraday Momentum, intraday VWAP, First-15m/30m/Hour return, Opening Range Breakout. → Pulled live on demand with `interval="minute"`, **not** stored in the daily snapshot.

### Tier 4 — Needs **external / paid** feeds (out of scope for v1) ❌
Derivatives (OI, IV, PCR, Max Pain), Delivery %, Event Momentum (news/sentiment/earnings), Bid-Ask Spread, ASM/GSM/circuit status. → These stay mocked or blank until a data source is added. The MD flags them so nobody trusts a fake number.

> **v1 scope = Tier 1 + Tier 2.** That already powers the vast majority of momentum filters with real data.

---

## 5. How each Tier-1 indicator is calculated

Notation: `C` = closes, `H`/`L` = highs/lows, `V` = volume, `r_t` = daily return.

**Returns** — `return_Nd = (C[today] / C[today-N] − 1) × 100`. `252d_ex_21d = (C[t-21]/C[t-273] − 1) × 100`.

**Moving averages** — `SMA_N = mean(C[-N:])`; `EMA_N` = exponential MA, α = 2/(N+1). `price_vs_smaN = (C[today]/SMA_N − 1) × 100`. Slope = `(MA[today] − MA[today-5]) / MA[today-5]`.

**RSI_N** — average gain ÷ average loss over N days → `100 − 100/(1+RS)`. Default N = 14.

**MACD** — `EMA12 − EMA26`; signal = `EMA9(MACD)`; histogram = MACD − signal.

**ATR_N** — mean True Range over N; `atr_% = ATR/C × 100`. **ADX/DI** — Wilder's directional movement over 14.

**Bollinger** — mid = SMA20, upper/lower = mid ± 2·σ(20); `%B = (C − lower)/(upper − lower)`; width = (upper − lower)/mid.

**Historical Volatility_N** — `std(daily log returns, N) × √252 × 100`.

**Breakout / Distance from high** — `distance_from_Nd_high = (C/max(H[-N:]) − 1) × 100`; `breakout_Nd = C > max(H[-N:-1])`.

**Drawdown** — `dd = (C/rolling_max − 1) × 100`; max DD = worst dd in window.

**Volume** — `volume_ratio_Nd = V[today]/mean(V[-N:])`; `rvol`, z-scores from V distribution.

**Beta / Correlation** — regress stock daily returns on Nifty daily returns over N days; β = cov/var, corr = Pearson r.

**Sharpe/Sortino_N** — `mean(r)/std(r) × √252` (Sortino uses downside std). Risk-free rate = config `risk_free_rate`.

**Cross-sectional percentile (Tier 2)** — for metric M, `percentile(stock) = rank(M) / count × 100` across the universe that day.

Full one-line meaning of every filter lives in **[FILTERS.md](FILTERS.md)**; this section defines the math for the Tier-1/2 ones we compute.

---

## 6. Database design (configurable)

### `snapshot_config` — one row, the knobs
| Column | Meaning | Default |
|---|---|---|
| `tracked_indices` | JSON list of indices to snapshot | `["NIFTY50","NIFTY200","NIFTY500"]` |
| `lookback_days` | Calendar days of history to pull | `400` |
| `refresh_mode` | `on_first_open` \| `manual` \| `scheduled` | `on_first_open` |
| `scheduled_time` | IST time for scheduled mode | `08:30` |
| `risk_free_rate` | Annual %, for Sharpe/Sortino | `7.0` |
| `benchmark_symbol` | Index for RS/Beta | `NIFTY 50` |
| `auto_refresh_enabled` | Master on/off | `true` |

### `indicator_snapshot` — the daily data (one row per stock per day)
| Column | Type | Notes |
|---|---|---|
| `id` | PK | |
| `snapshot_date` | DATE | indexed |
| `symbol` | TEXT | indexed |
| `values` | JSON | **all indicator values for that stock** |
| `ltp` | REAL | close used |
| `created_at` | TIMESTAMP | |

Unique index on `(snapshot_date, symbol)`. Storing the ~200 indicators as a single **JSON blob** keeps the schema stable when indicators are added/removed — no migration per indicator. A handful of hot filters (price, market cap, return_1d, rsi_14) can also be promoted to real indexed columns later if query speed needs it.

### `snapshot_run` — job log (so the app knows if today is done)
| Column | Meaning |
|---|---|
| `snapshot_date`, `status` (`running`/`done`/`failed`), `stocks_processed`, `started_at`, `finished_at`, `error` |

---

## 7. Daily job lifecycle

1. **Trigger** — on first API call of the day (or scheduled), check `snapshot_run` for today's `done` row.
2. **Resolve universe** — union of stocks across `tracked_indices`.
3. **Pull** — for each stock, `get_historical_data(token, today−lookback, today, "day")`. Batched with throttling (see §8).
4. **Compute Tier 1** per stock → dict of indicator values.
5. **Compute Tier 2** cross-sectionally (percentiles, breadth, sector/peer ranks) once all Tier-1 dicts exist.
6. **Store** one `indicator_snapshot` row per stock; mark `snapshot_run` done.
7. **Filters read** from `indicator_snapshot WHERE snapshot_date = today` — pure DB, no Kite.

Fallback: if Kite is disconnected or the pull fails, the runner keeps using the existing mock so the UI still works, and the results are labelled as mock.

---

## 8. Kite API constraints (why batching matters)

- **Historical API** is **one instrument per call**. NIFTY500 = 500 calls per snapshot.
- Kite rate limit ≈ **3 requests/sec** for historical. → 500 stocks ≈ **~3 minutes** with throttling.
- Run the job **once/day** off the first open (or a scheduled 08:30 IST pre-market run) so the user never waits on it interactively — it populates in the background, and a progress state is shown via `snapshot_run`.
- Instruments master is cached (changes rarely); only re-fetched weekly or on demand.

---

## 9. What "Run" looks like after this

```
User: return_1d > 5  AND  rsi_14 < 60   on NIFTY500
        │
        ▼
SELECT symbol, values FROM indicator_snapshot WHERE snapshot_date = today
        │  (in-memory numeric compare, same AND logic as today)
        ▼
Results — now backed by REAL values, computed from Kite daily candles
```

The filtering code (`run_manual_strategy`) barely changes — it just reads each stock's value from the snapshot dict instead of `_mock_numeric_value`.

---

## 10. Build order (proposed)

1. `snapshot_config`, `indicator_snapshot`, `snapshot_run` tables + config API.
2. Indicator compute module (Tier 1) — pure functions over an OHLCV array, unit-testable against known values.
3. Snapshot job (pull → compute → store) with throttling + `snapshot_run` tracking.
4. Tier 2 cross-sectional pass.
5. Point `run_manual_strategy` / screener at the snapshot, mock as fallback.
6. Trigger on first-open + a manual "Refresh snapshot" button showing progress.

---

## 11. Explicitly NOT real in v1 (still mocked / blank)
Derivatives (OI/IV/PCR/Max Pain), Delivery %, News/Sentiment/Earnings, Bid-Ask Spread, ASM/GSM/Circuit, all Intraday-only filters (unless you open the intraday live path). These are labelled so no one trades on a fake value.
