# Stock Picker — Filters Reference

## How a filter actually works (the mechanic)

1. **Pick the pool** — the Watchlist choice (NIFTY50 / NIFTY500 / a Batch) + Sector decides *which* stocks are even considered.
2. **Each stock is tested one at a time.** For every filter you added, the system computes that stock's indicator value and compares it to your input using the operator (`>`, `<`, `=`, `between`, or a true/false toggle).
3. **All filters must pass (AND logic).** A stock survives only if it satisfies *every* filter. Fail one → dropped.
4. **Survivors → Results table.**

**Value types**
- **number** → compared with `>`, `>=`, `<`, `<=`, `=`, `between` (e.g. `RSI 14 < 30`).
- **boolean** → a yes/no condition you set to `= true` or `= false` (e.g. `20D Breakout = true`).
- **enum** → pick from a fixed list (e.g. `Market Regime = BULL`).

> ⚠️ Today the indicator numbers are **simulated** (seeded mock values) until the Kite historical pipeline is wired into the strategy runner. The comparison logic below is real; only the input data is mocked for now.

---

## Price Momentum
Multi-timeframe price returns and acceleration.

| Filter | What it measures |
|---|---|
| 1/3/5/10/20/40/60/120/252-Day Return | % price change over that many trading days. |
| 252D Return ex-21D | 1-year return excluding the most recent month (classic momentum, skips short-term reversal). |
| Acceleration 5D vs 20D / 10D vs 60D | Whether recent momentum is speeding up vs the longer window. |
| Momentum Percentile / Return Percentile | Where this stock's momentum/return ranks vs the whole universe (0–100). |

## Relative Strength
Performance vs Nifty, its sector, and its peers.

| Filter | What it measures |
|---|---|
| RS vs Nifty 1D…120D | Out/under-performance vs the Nifty index over that window. |
| RS vs Sector 5D…120D | Out/under-performance vs its own sector. |
| RS vs Peer Group | Strength vs a defined peer basket. |
| RS Ratio | Ratio of stock strength to benchmark (>1 = stronger). |
| RS Slope 5D/20D/60D | Whether relative strength is rising or falling. |
| RS Acceleration 5D/20D | Whether relative strength is speeding up. |
| RS Breakout (bool) | RS line broke to a new high. |
| RS New High (bool) | RS made a fresh high (leadership). |
| RS Percentile | RS rank vs universe (0–100). |

## Moving Averages
SMA/EMA levels, price-vs-MA, crossovers, slopes.

| Filter | What it measures |
|---|---|
| SMA 5…200 / EMA 9…200 | The moving-average price level (₹). |
| Price vs SMA/EMA (20/50/100/200) | How far price is above/below that MA (%). |
| SMA20 vs SMA50, SMA50 vs SMA200, EMA20 vs EMA50, EMA50 vs EMA200 | Gap between two MAs (crossover / alignment). |
| …Slope (SMA/EMA 20…200) | Whether that MA is trending up or down. |
| MA Alignment Score | How well all MAs are stacked in trend order. |

## Trend Structure
Swing highs/lows and trend duration.

| Filter | What it measures |
|---|---|
| Higher High / Higher Low / Lower High / Lower Low Count | Count of each swing type (uptrend vs downtrend evidence). |
| Swing High/Low Strength | How pronounced the recent swings are. |
| Trend Structure Score | Composite health of the trend structure. |
| Distance from Swing High/Low | % away from the last swing pivot. |
| Consecutive Up/Down Days | Current run of up or down closes. |
| Trend Duration | How many days the current trend has lasted. |
| Days Since Last High/Low | Freshness of the most recent extreme. |

## Breakout
Breakouts, strength, volume confirmation, follow-through.

| Filter | What it measures |
|---|---|
| Distance from 20D/50D/100D/200D/52W High | % below the recent high (near breakout = close to 0). |
| Distance from 20D/50D Low | % above the recent low. |
| 20D / 50D / 52W Breakout (bool) | Price broke above that high. |
| Breakout % / Strength | Size and conviction of the breakout. |
| Breakout Volume Ratio | Volume on breakout vs normal (confirmation). |
| Breakout Close Strength | Where it closed within the breakout candle. |
| Follow-Through 1D/3D/5D | Continuation after the breakout. |
| Failure Rate / False Breakout Count | How often breakouts failed historically. |
| Retest Success | Success rate of retests holding. |
| Resistance Test/Break Count | How often resistance was tested/broken. |
| Support Distance | % distance to nearest support. |

## Volume
Volume levels, ratios, trend, relative volume.

| Filter | What it measures |
|---|---|
| Volume 1D / 5D/20D/50D Avg | Traded shares now vs average. |
| Volume Ratio 1D/5D/20D/50D | Current volume ÷ average (spike detection). |
| Up / Down Volume, Up/Down Volume Ratio | Volume on up days vs down days (accumulation). |
| Volume Trend / Slope | Whether volume is rising over time. |
| RVOL / Time-Adjusted RVOL | Relative volume vs typical (time-of-day aware). |
| Volume Percentile / Z-Score | How unusual today's volume is statistically. |

## Volume-Price Confirmation
Does volume confirm the price move?

| Filter | What it measures |
|---|---|
| Price Change × Volume Ratio | Strength of move weighted by volume. |
| Up/Down Day High/Low Volume (bool) | Whether the day's direction came with heavy/light volume. |
| Close Near Day High/Low | Where the close sat in the day's range (%). |
| Volume Price Trend | Cumulative volume-weighted price direction. |
| Confirmation Score | Composite of how well volume backs price. |

## Liquidity
Tradability by turnover and spread.

| Filter | What it measures |
|---|---|
| Avg Volume 20D/50D | Average shares traded. |
| Avg ₹ Volume 20D/50D/120D | Average rupee turnover (size you can trade). |
| Bid-Ask Spread / Spread % | Cost to cross the spread. |
| Liquidity Percentile | Liquidity rank vs universe. |
| Turnover Ratio | Volume relative to float. |

## Volatility
ATR and historical volatility, expansion/contraction.

| Filter | What it measures |
|---|---|
| ATR 14/20/50 / ATR % | Average daily range (₹ and % of price). |
| HV 5D…120D | Historical (realised) volatility over the window. |
| Volatility Expansion / Contraction (bool) | Whether volatility is rising or squeezing. |
| ATR14 vs ATR50 / ATR Slope | Short vs long volatility, direction. |
| Volatility Percentile / Z-Score | How extreme current volatility is. |
| Relative Volatility / ATR / Percentile | Volatility vs the market. |

## Bollinger Bands
Band levels, width, %B, squeeze.

| Filter | What it measures |
|---|---|
| BB Middle/Upper/Lower | The band price levels (₹). |
| BB Width / Width Percentile | Band width (volatility) and its rank. |
| %B | Where price sits within the bands (0 = lower, 1 = upper). |
| BB Squeeze / Expansion (bool) | Bands tightening (coil) or widening. |
| Above Upper / Below Lower Band (bool) | Price outside the bands. |

## Trend Quality
How clean/efficient the trend is.

| Filter | What it measures |
|---|---|
| Efficiency Ratio 10D/20D/50D | Directness of the move (straight-line vs choppy). |
| LR Slope 10D/20D/50D | Linear-regression trend slope. |
| LR R² 20D/50D | How well the trend fits a straight line (0–1). |
| Trend T-Stat | Statistical significance of the trend. |
| Positive Days 5D…50D / Up Days Ratio | Count/share of up days. |

## Drawdown
How far off highs, and recovery.

| Filter | What it measures |
|---|---|
| DD from 20D/50D/100D/200D/52W High | % below that reference high. |
| Max DD 20D/60D/120D | Worst peak-to-trough drop in the window. |
| Recovery from DD | How much of the drawdown has been recovered. |
| DD Duration | Days spent in the drawdown. |

## Pullback Quality
Health of a dip within an uptrend.

| Filter | What it measures |
|---|---|
| Distance from EMA20/EMA50 | % away from the moving average. |
| Pullback Depth / Duration | Size and length of the dip. |
| Recovery Speed / Strength | How fast/strong the bounce is. |
| PB Volume Contraction | Whether volume dried up on the dip (healthy). |
| PB to ATR Ratio | Pullback size relative to normal range. |
| PB Hold EMA20/EMA50 (bool) | Whether the dip held above the MA. |

## Momentum Indicators
RSI, MACD, ADX.

| Filter | What it measures |
|---|---|
| RSI 7/14/21 | Overbought/oversold oscillator (0–100). |
| RSI Slope / Change 5D/10D | Direction and speed of RSI. |
| RSI > 50 / 60 / 70 (bool) | RSI above a strength threshold. |
| RSI Persist > 60/70 | Days RSI stayed above the level. |
| RSI Percentile | RSI rank vs universe. |
| MACD / Signal / Histogram | Trend-momentum lines and their gap. |
| MACD Hist Slope/Change | Momentum of the histogram. |
| MACD > 0 / Bull Crossover (bool) | Bullish MACD conditions. |
| ADX 14/20 | Trend strength (not direction). |
| DI+ / DI- / DI Difference | Directional strength up vs down. |
| ADX Slope | Whether trend strength is building. |

## Price Action
Candle anatomy.

| Filter | What it measures |
|---|---|
| Body Size / Upper Wick / Lower Wick | Candle proportions (%). |
| Candle Range / Body to Range | Total range and body share. |
| Close Position | Where price closed in the day's range (%). |
| Positive Close Ratio 5D/10D/20D | Share of positive closes. |
| Avg Body/Range 5D/20D | Typical candle size. |
| Bullish / Bearish Candle Ratio | Balance of green vs red candles. |

## Gap Momentum
Opening gaps behaviour.

| Filter | What it measures |
|---|---|
| Gap Up / Down % | Size of the opening gap. |
| Gap Frequency | How often the stock gaps. |
| Gap Hold / Fill Rate | Whether gaps hold or get filled. |
| Gap Up High Volume / Close Near High (bool) | Quality of a gap-up. |
| Gap vs ATR / Gap Volume Ratio | Gap size vs normal range and volume. |

## VWAP
Volume-weighted average price levels.

| Filter | What it measures |
|---|---|
| VWAP / Price vs VWAP / VWAP Distance | The level and how far price is from it. |
| VWAP Slope | Direction of VWAP. |
| Price Above VWAP (bool) | Trading above the fair-value line. |
| Anchored VWAP 20D/50D/from Breakout/from Swing Low | VWAP anchored to a key event. |
| VWAP Reclaim / Rejection (bool) | Price reclaimed or was rejected at VWAP. |

## Money Flow
Buying/selling pressure via volume.

| Filter | What it measures |
|---|---|
| OBV / OBV Slope / 20D Slope | Cumulative volume flow and its direction. |
| CMF 20/50 | Chaikin Money Flow (accumulation vs distribution). |
| MFI 14 / MFI Slope | Volume-weighted RSI. |
| A/D Line / Slope | Accumulation-distribution trend. |
| Force Index / Ease of Movement | Strength of moves relative to volume. |

## Volume Profile
Where volume concentrated by price.

| Filter | What it measures |
|---|---|
| POC / Price vs POC | Price with most traded volume, and distance to it. |
| HVN / LVN Distance | Distance to high/low volume nodes. |
| Volume Concentration / Distribution Skew | How clustered the volume is. |

## Statistical Momentum
Z-scores and percentiles.

| Filter | What it measures |
|---|---|
| Return Z-Score 5D/20D/60D | How extreme the return is vs its own history. |
| Price Z-Score 20D/50D | How stretched price is from its mean. |
| Volume / Momentum Z-Score | Statistical extremity of volume/momentum. |
| Return / Momentum Percentile | Cross-universe rank. |

## Autocorrelation
Does momentum persist?

| Filter | What it measures |
|---|---|
| Autocorrelation 5D/10D/20D | Tendency of returns to repeat direction. |
| Sign Autocorrelation | Persistence of up/down sign. |

## Mean Reversion Risk
Is the stock over-extended?

| Filter | What it measures |
|---|---|
| Distance from Mean | % away from average price. |
| SMA20/SMA50/EMA20 Z-Score | How many std-devs above the MA. |
| RSI Extreme (bool) | RSI at an extreme (snap-back risk). |
| Extension / Mean Reversion Risk Score | Composite over-extension risk. |

## Market Regime
State of the overall market (Nifty).

| Filter | What it measures |
|---|---|
| Nifty Return 1D…200D | Index performance over the window. |
| Nifty > SMA20/50/200 (bool) | Index above key MAs (risk-on). |
| Nifty SMA Slopes / ADX / ATR / Volatility | Index trend and volatility. |
| Market Regime (enum) | BULL / NEUTRAL / BEAR / HIGH_VOLATILITY. |

## Market Breadth
How broad the market move is.

| Filter | What it measures |
|---|---|
| A/D Ratio / Line | Advancers vs decliners. |
| Market Breadth Score | Composite breadth. |
| Stocks > SMA20/50/200 % | Share of stocks in uptrends. |
| New Highs / Lows / NH-NL Ratio | New extremes across the market. |
| 52W High/Low % | Share near yearly extremes. |

## Sector Momentum
Strength of the stock's sector.

| Filter | What it measures |
|---|---|
| Sector Return 1D…120D | Sector performance. |
| Sector RS / Rank / Percentile | Sector strength vs other sectors. |
| Sector Momentum / Breadth Score | Composite sector momentum & participation. |
| Sector Stocks > SMA20/50/200 | Share of sector in uptrend. |
| Sector New Highs / Lows | Sector-level extremes. |

## Peer Momentum
Rank within a peer group.

| Filter | What it measures |
|---|---|
| Peer Return 5D/20D/60D | Return vs peers. |
| Peer Rank / Percentile | Position within the peer basket. |
| Peer Momentum Score | Composite peer strength. |

## Intraday Momentum
Within-day behaviour (needs intraday data).

| Filter | What it measures |
|---|---|
| Open to Current Return | Move since the open. |
| High-Low Position | Where price sits in the day's range. |
| Intraday VWAP Distance / Slope | Position vs and direction of intraday VWAP. |
| First 15min/30min/Hour Return | Early-session momentum. |
| Intraday Vol vs Avg | Intraday volume pace. |
| Intraday RS Nifty/Sector/Slope | Intraday relative strength. |
| Intraday High Break / Low Breakdown (bool) | Broke the day's extreme. |
| ORB / OR High/Low Break (bool) | Opening-range breakout signals. |

## Risk-Adjusted Momentum
Return per unit of risk.

| Filter | What it measures |
|---|---|
| Sharpe 20D/60D/120D | Return per unit of total volatility. |
| Sortino 20D/60D/120D | Return per unit of downside volatility. |
| Return / Volatility | Simple risk-adjusted return. |
| Return / Drawdown | Return relative to worst drop. |

## Return Distribution
Shape of the return series.

| Filter | What it measures |
|---|---|
| Mean / Median / Std Daily Return | Central tendency and spread of daily returns. |
| Skewness / Kurtosis | Asymmetry and fat-tails of returns. |
| Best / Worst Day | Largest single-day moves. |
| Large Positive / Negative Days | Count of outsized moves. |

## Beta & Correlation
Sensitivity to the market.

| Filter | What it measures |
|---|---|
| Beta 20D…252D / Rolling Beta | Move per 1% market move. |
| Upside / Downside Beta | Beta in up vs down markets. |
| Corr Nifty/Sector/Peer | How closely it tracks each. |

## Derivatives
Futures & options signals (F&O stocks).

| Filter | What it measures |
|---|---|
| Open Interest / OI Change / OI Change % | Outstanding contracts and their change. |
| Volume/OI Ratio | Trading activity vs positions. |
| Price-OI Relationship | Long/short buildup interpretation. |
| Futures Basis / Premium-Discount | Futures vs spot pricing. |
| Put-Call Ratio | Options sentiment. |
| IV / IV Percentile / IV Change | Implied volatility level and shift. |
| Call/Put OI Change & Ratio | Option positioning. |
| Max Pain | Strike where most options expire worthless. |
| Option Volume / OI Concentration | Options activity clustering. |

## Delivery
Real delivery vs intraday churn.

| Filter | What it measures |
|---|---|
| Delivery Quantity / % | Shares actually delivered (not squared off). |
| Delivery vs 20D Avg / Trend | Delivery pace vs normal. |
| Delivery Price Confirmation (bool) | Delivery backing the price move. |

## Event Momentum
News, sentiment, earnings.

| Filter | What it measures |
|---|---|
| News Count 24H / 7D | Volume of news flow. |
| Positive / Negative News Ratio | Tone of coverage. |
| Sentiment Score | Aggregate sentiment. |
| Earnings Days Away / Recent Earnings (bool) | Proximity to earnings. |
| Earnings Surprise | Beat/miss vs estimate. |

## Tradability Filters
Practical "can I trade this" checks.

| Filter | What it measures |
|---|---|
| Market Cap / Price / Avg ₹ Volume | Size, price, liquidity gates. |
| Bid-Ask Spread / ATR % | Cost and volatility gates. |
| Circuit Status / Upper-Lower Circuit Distance | Circuit-limit proximity. |
| ASM / GSM Status (bool) | Under surveillance frameworks. |
| F&O Available (bool) | Has derivatives. |

## Cross-Sectional Ranking
Percentile ranks across the universe.

| Filter | What it measures |
|---|---|
| Return 5D/20D/60D/120D Pctl | Return rank vs all stocks. |
| RS / Volume / Breakout / Trend / Volatility Pctl | Rank on each dimension. |
| Sector Strength / Momentum / Liquidity Pctl | Rank on those dimensions. |

## Hard Filters
Minimum thresholds that exclude stocks outright.

| Filter | What it measures |
|---|---|
| Min Market Cap / Min Avg Daily Value / Min Price | Floors to exclude tiny/illiquid names. |
| Max Bid-Ask Spread / Max ATR % | Ceilings on cost and volatility. |
| Exclude Circuit / Illiquid / Restricted (bool) | Drop untradeable stocks. |

## Scoring Weights
Not filters — weights for a composite momentum score (used when ranking rather than pass/fail).

| Filter | What it measures |
|---|---|
| Price Momentum / RS / Trend Structure / Breakout / Volume / Trend Quality / Volatility / Momentum Indicator Weight | % weight each category contributes to the final score. |

## Forward Return Labels
Not filters — **future** returns used to label/evaluate a strategy (for backtesting/ML), never as a live pick condition.

| Filter | What it measures |
|---|---|
| Fwd Return 1D…20D | Return *after* the pick date. |
| Fwd Max Return 5D/10D | Best case ahead. |
| Fwd Max DD 5D/10D/20D | Worst drawdown ahead. |

---

### Quick mental model
> **Watchlist = the pool. Filters = the pass/fail checklist (all must pass). Results = the survivors.**
> Numbers use math operators, booleans are yes/no toggles, enums pick from a list.
