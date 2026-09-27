"""Full indicator computation engine from daily OHLCV series.

Covers all Tier-1 (single-stock OHLCV-derivable) indicators from the catalog.
Tier-2 (cross-sectional) indicators that need index/sector context are computed
by `compute_cross_sectional()`.

Every function is pure (no I/O) and operates on a chronological list of candles:
[{date, open, high, low, close, volume}, ...] (oldest -> newest).
"""
from __future__ import annotations

import math
from statistics import median


# ─── helpers ────────────────────────────────────────────────────────────────

def _closes(c): return [x["close"] for x in c]
def _opens(c): return [x["open"] for x in c]
def _highs(c): return [x["high"] for x in c]
def _lows(c): return [x["low"] for x in c]
def _vols(c): return [x["volume"] for x in c]


def _ret(closes, n):
    if len(closes) <= n or closes[-1 - n] == 0:
        return None
    return (closes[-1] / closes[-1 - n] - 1) * 100


def _sma(vals, n):
    if len(vals) < n:
        return None
    return sum(vals[-n:]) / n


def _ema(vals, n):
    if len(vals) < n:
        return None
    k = 2 / (n + 1)
    e = sum(vals[:n]) / n
    for v in vals[n:]:
        e = v * k + e * (1 - k)
    return e


def _rsi(closes, n=14):
    if len(closes) <= n:
        return None
    gains = losses = 0.0
    for i in range(len(closes) - n, len(closes)):
        d = closes[i] - closes[i - 1]
        if d >= 0:
            gains += d
        else:
            losses -= d
    if losses == 0:
        return 100.0
    rs = (gains / n) / (losses / n)
    return 100 - 100 / (1 + rs)


def _rsi_series(closes, n=14):
    """Return list of RSI values for the last portion of closes."""
    if len(closes) <= n + 1:
        return []
    series = []
    avg_gain = avg_loss = 0.0
    for i in range(1, n + 1):
        d = closes[i] - closes[i - 1]
        if d >= 0:
            avg_gain += d
        else:
            avg_loss -= d
    avg_gain /= n
    avg_loss /= n
    if avg_loss == 0:
        series.append(100.0)
    else:
        series.append(100 - 100 / (1 + avg_gain / avg_loss))
    for i in range(n + 1, len(closes)):
        d = closes[i] - closes[i - 1]
        g = d if d > 0 else 0
        l = -d if d < 0 else 0
        avg_gain = (avg_gain * (n - 1) + g) / n
        avg_loss = (avg_loss * (n - 1) + l) / n
        if avg_loss == 0:
            series.append(100.0)
        else:
            series.append(100 - 100 / (1 + avg_gain / avg_loss))
    return series


def _true_ranges(c):
    tr = []
    for i in range(1, len(c)):
        h, l, pc = c[i]["high"], c[i]["low"], c[i - 1]["close"]
        tr.append(max(h - l, abs(h - pc), abs(l - pc)))
    return tr


def _atr(c, n=14):
    tr = _true_ranges(c)
    if len(tr) < n:
        return None
    return sum(tr[-n:]) / n


def _stdev(vals):
    if len(vals) < 2:
        return None
    m = sum(vals) / len(vals)
    return math.sqrt(sum((v - m) ** 2 for v in vals) / (len(vals) - 1))


def _daily_returns(closes):
    return [
        (closes[i] / closes[i - 1] - 1)
        for i in range(1, len(closes))
        if closes[i - 1] != 0
    ]


def _hist_vol(closes, n):
    rets = _daily_returns(closes)
    if len(rets) < n:
        return None
    s = _stdev(rets[-n:])
    return None if s is None else s * math.sqrt(252) * 100


def _slope(vals, n):
    """Least-squares slope of last n values, normalized per bar."""
    if len(vals) < n:
        return None
    segment = vals[-n:]
    x_mean = (n - 1) / 2
    y_mean = sum(segment) / n
    num = sum((i - x_mean) * (segment[i] - y_mean) for i in range(n))
    den = sum((i - x_mean) ** 2 for i in range(n))
    return num / den if den != 0 else 0


def _linreg(vals, n):
    """Linear regression slope and R² for last n values."""
    if len(vals) < n:
        return None, None
    segment = vals[-n:]
    x_mean = (n - 1) / 2
    y_mean = sum(segment) / n
    ss_xy = sum((i - x_mean) * (segment[i] - y_mean) for i in range(n))
    ss_xx = sum((i - x_mean) ** 2 for i in range(n))
    ss_yy = sum((segment[i] - y_mean) ** 2 for i in range(n))
    if ss_xx == 0:
        return 0, 0
    slope = ss_xy / ss_xx
    r2 = (ss_xy ** 2 / (ss_xx * ss_yy)) if ss_yy != 0 else 0
    return slope, r2


def _efficiency_ratio(closes, n):
    if len(closes) <= n:
        return None
    net_change = abs(closes[-1] - closes[-1 - n])
    path = sum(abs(closes[i] - closes[i - 1])
               for i in range(len(closes) - n, len(closes)))
    return net_change / path if path != 0 else 0


def _zscore(val, vals):
    if len(vals) < 2 or val is None:
        return None
    m = sum(vals) / len(vals)
    s = _stdev(vals)
    return (val - m) / s if s and s != 0 else 0


def _percentile_rank(val, vals):
    if not vals or val is None:
        return None
    below = sum(1 for v in vals if v < val)
    return below / len(vals) * 100


def _skewness(vals):
    n = len(vals)
    if n < 3:
        return None
    m = sum(vals) / n
    s = _stdev(vals)
    if not s or s == 0:
        return 0
    return (n / ((n - 1) * (n - 2))) * sum(((v - m) / s) ** 3 for v in vals)


def _kurtosis(vals):
    n = len(vals)
    if n < 4:
        return None
    m = sum(vals) / n
    s = _stdev(vals)
    if not s or s == 0:
        return 0
    k4 = sum(((v - m) / s) ** 4 for v in vals) / n
    return k4 - 3  # excess kurtosis


def _autocorrelation(vals, lag):
    n = len(vals)
    if n <= lag + 1:
        return None
    x = vals[:-lag]
    y = vals[lag:]
    mn = min(len(x), len(y))
    x, y = x[-mn:], y[-mn:]
    mx = sum(x) / mn
    my = sum(y) / mn
    cov = sum((x[i] - mx) * (y[i] - my) for i in range(mn))
    vx = sum((xi - mx) ** 2 for xi in x)
    vy = sum((yi - my) ** 2 for yi in y)
    d = math.sqrt(vx * vy)
    return cov / d if d != 0 else 0


# ─── composite indicators ──────────────────────────────────────────────────

def _supertrend(candles, period=10, multiplier=3):
    if len(candles) < period + 1:
        return None, None
    atr_vals = []
    for i in range(1, len(candles)):
        h, l, pc = candles[i]["high"], candles[i]["low"], candles[i - 1]["close"]
        atr_vals.append(max(h - l, abs(h - pc), abs(l - pc)))
    st_up = st_dn = 0.0
    direction = 1
    for i in range(period, len(atr_vals)):
        atr_avg = sum(atr_vals[i - period + 1: i + 1]) / period
        hl2 = (candles[i + 1]["high"] + candles[i + 1]["low"]) / 2
        basic_up = hl2 - multiplier * atr_avg
        basic_dn = hl2 + multiplier * atr_avg
        st_up = max(basic_up, st_up) if candles[i]["close"] > st_up else basic_up
        st_dn = min(basic_dn, st_dn) if candles[i]["close"] < st_dn else basic_dn
        if direction == 1:
            if candles[i + 1]["close"] < st_up:
                direction = -1
        else:
            if candles[i + 1]["close"] > st_dn:
                direction = 1
    value = st_up if direction == 1 else st_dn
    return value, direction


def _adx_full(candles, period=14):
    """Return (adx, +DI, -DI) or (None, None, None)."""
    if len(candles) < period * 2 + 1:
        return None, None, None
    plus_dm, minus_dm, tr = [], [], []
    for i in range(1, len(candles)):
        h, l, pc = candles[i]["high"], candles[i]["low"], candles[i - 1]["close"]
        tr.append(max(h - l, abs(h - pc), abs(l - pc)))
        up_move = h - candles[i - 1]["high"]
        dn_move = candles[i - 1]["low"] - l
        plus_dm.append(up_move if up_move > dn_move and up_move > 0 else 0)
        minus_dm.append(dn_move if dn_move > up_move and dn_move > 0 else 0)
    k = 2 / (period + 1)
    atr_e = sum(tr[:period]) / period
    pdm_e = sum(plus_dm[:period]) / period
    mdm_e = sum(minus_dm[:period]) / period
    dx_vals = []
    last_pdi = last_mdi = 0
    for i in range(period, len(tr)):
        atr_e = tr[i] * k + atr_e * (1 - k)
        pdm_e = plus_dm[i] * k + pdm_e * (1 - k)
        mdm_e = minus_dm[i] * k + mdm_e * (1 - k)
        if atr_e == 0:
            dx_vals.append(0)
            continue
        last_pdi = pdm_e / atr_e * 100
        last_mdi = mdm_e / atr_e * 100
        di_sum = last_pdi + last_mdi
        dx_vals.append(abs(last_pdi - last_mdi) / di_sum * 100 if di_sum else 0)
    if len(dx_vals) < period:
        return None, None, None
    adx = sum(dx_vals[:period]) / period
    for i in range(period, len(dx_vals)):
        adx = dx_vals[i] * k + adx * (1 - k)
    return adx, last_pdi, last_mdi


def _stochastic(candles, k_period=14, d_period=3):
    if len(candles) < k_period:
        return None, None
    highs = [x["high"] for x in candles]
    lows = [x["low"] for x in candles]
    closes = [x["close"] for x in candles]
    k_vals = []
    for i in range(k_period - 1, len(candles)):
        hh = max(highs[i - k_period + 1: i + 1])
        ll = min(lows[i - k_period + 1: i + 1])
        k_vals.append((closes[i] - ll) / (hh - ll) * 100 if hh != ll else 50)
    if len(k_vals) < d_period:
        return k_vals[-1] if k_vals else None, None
    d_val = sum(k_vals[-d_period:]) / d_period
    return k_vals[-1], d_val


def _roc(closes, period=12):
    if len(closes) <= period or closes[-1 - period] == 0:
        return None
    return (closes[-1] / closes[-1 - period] - 1) * 100


def _obv(candles):
    if len(candles) < 2:
        return None
    obv = 0
    for i in range(1, len(candles)):
        if candles[i]["close"] > candles[i - 1]["close"]:
            obv += candles[i]["volume"]
        elif candles[i]["close"] < candles[i - 1]["close"]:
            obv -= candles[i]["volume"]
    return obv


def _obv_series(candles):
    if len(candles) < 2:
        return []
    series = [0]
    for i in range(1, len(candles)):
        if candles[i]["close"] > candles[i - 1]["close"]:
            series.append(series[-1] + candles[i]["volume"])
        elif candles[i]["close"] < candles[i - 1]["close"]:
            series.append(series[-1] - candles[i]["volume"])
        else:
            series.append(series[-1])
    return series


def _cmf(candles, n=20):
    """Chaikin Money Flow."""
    if len(candles) < n:
        return None
    mfv_sum = vol_sum = 0
    for bar in candles[-n:]:
        h, l, c, v = bar["high"], bar["low"], bar["close"], bar["volume"]
        rng = h - l
        mf_mult = ((c - l) - (h - c)) / rng if rng != 0 else 0
        mfv_sum += mf_mult * v
        vol_sum += v
    return mfv_sum / vol_sum if vol_sum != 0 else 0


def _mfi(candles, n=14):
    """Money Flow Index."""
    if len(candles) <= n:
        return None
    pos_flow = neg_flow = 0
    for i in range(len(candles) - n, len(candles)):
        tp = (candles[i]["high"] + candles[i]["low"] + candles[i]["close"]) / 3
        tp_prev = (candles[i - 1]["high"] + candles[i - 1]["low"] + candles[i - 1]["close"]) / 3
        mf = tp * candles[i]["volume"]
        if tp > tp_prev:
            pos_flow += mf
        else:
            neg_flow += mf
    if neg_flow == 0:
        return 100.0
    ratio = pos_flow / neg_flow
    return 100 - 100 / (1 + ratio)


def _ad_line(candles):
    """Accumulation/Distribution line (last value + slope)."""
    if len(candles) < 2:
        return None, None
    ad = 0
    ad_series = []
    for bar in candles:
        h, l, c, v = bar["high"], bar["low"], bar["close"], bar["volume"]
        rng = h - l
        mf = ((c - l) - (h - c)) / rng if rng != 0 else 0
        ad += mf * v
        ad_series.append(ad)
    slope_val = _slope(ad_series, min(20, len(ad_series))) if len(ad_series) >= 5 else None
    return ad, slope_val


def _force_index(candles, n=13):
    if len(candles) < n + 1:
        return None
    fi = []
    for i in range(1, len(candles)):
        fi.append((candles[i]["close"] - candles[i - 1]["close"]) * candles[i]["volume"])
    return _ema(fi, n)


def _ease_of_movement(candles, n=14):
    if len(candles) < n + 1:
        return None
    emv = []
    for i in range(1, len(candles)):
        h, l, v = candles[i]["high"], candles[i]["low"], candles[i]["volume"]
        ph, pl = candles[i - 1]["high"], candles[i - 1]["low"]
        dm = ((h + l) / 2) - ((ph + pl) / 2)
        br = (v / 1e6) / (h - l) if (h - l) != 0 else 0
        emv.append(dm / br if br != 0 else 0)
    return _sma(emv, n)


def _vwap_daily(candles, n=20):
    """Volume-weighted average price over last n bars."""
    if len(candles) < n:
        return None
    tp_vol = vol = 0
    for bar in candles[-n:]:
        tp = (bar["high"] + bar["low"] + bar["close"]) / 3
        tp_vol += tp * bar["volume"]
        vol += bar["volume"]
    return tp_vol / vol if vol != 0 else None


def _bollinger(closes, n=20, k=2):
    if len(closes) < n:
        return None, None, None
    mid = sum(closes[-n:]) / n
    sd = _stdev(closes[-n:])
    if sd is None:
        return mid, mid, mid
    return mid, mid + k * sd, mid - k * sd


def _bb_width_series(closes, n=20, k=2):
    """Bollinger bandwidth series for percentile computation."""
    if len(closes) < n + 20:
        return []
    widths = []
    for i in range(n - 1, len(closes)):
        segment = closes[i - n + 1: i + 1]
        mid = sum(segment) / n
        if mid == 0:
            widths.append(0)
            continue
        sd = _stdev(segment)
        if sd is None:
            widths.append(0)
        else:
            widths.append(2 * k * sd / mid * 100)
    return widths


# ─── swing detection helpers ────────────────────────────────────────────────

def _find_swings(highs, lows, closes, lookback=5):
    """Find swing highs/lows in the series."""
    swing_highs = []
    swing_lows = []
    for i in range(lookback, len(highs) - lookback):
        if highs[i] == max(highs[i - lookback: i + lookback + 1]):
            swing_highs.append((i, highs[i]))
        if lows[i] == min(lows[i - lookback: i + lookback + 1]):
            swing_lows.append((i, lows[i]))
    return swing_highs, swing_lows


# ─── gap helpers ────────────────────────────────────────────────────────────

def _gap_analysis(candles, lookback=20):
    """Analyze gaps in the last `lookback` bars."""
    if len(candles) < lookback + 1:
        lookback = len(candles) - 1
    if lookback < 1:
        return {}
    gaps_up = gaps_down = 0
    gap_held = gap_filled = 0
    total_gaps = 0
    last_gap_pct = 0
    last_gap_vol_ratio = 0
    last_gap_close_near_high = False

    atr = _atr(candles, min(14, len(candles) - 1))
    for i in range(len(candles) - lookback, len(candles)):
        if i < 1:
            continue
        prev_close = candles[i - 1]["close"]
        if prev_close == 0:
            continue
        gap = (candles[i]["open"] / prev_close - 1) * 100
        if abs(gap) > 0.3:
            total_gaps += 1
            if gap > 0:
                gaps_up += 1
                if candles[i]["close"] > candles[i]["open"]:
                    gap_held += 1
                if candles[i]["low"] <= prev_close:
                    gap_filled += 1
            else:
                gaps_down += 1

    last_bar = candles[-1]
    prev = candles[-2] if len(candles) > 1 else last_bar
    if prev["close"] != 0:
        last_gap_pct = (last_bar["open"] / prev["close"] - 1) * 100
    avg_vol = _sma(_vols(candles), 20) or 1
    last_gap_vol_ratio = last_bar["volume"] / avg_vol if avg_vol else 0
    rng = last_bar["high"] - last_bar["low"]
    last_gap_close_near_high = ((last_bar["close"] - last_bar["low"]) / rng > 0.7) if rng > 0 else False

    return {
        "gap_up_percentage": max(last_gap_pct, 0) if last_gap_pct > 0.3 else 0,
        "gap_down_percentage": abs(min(last_gap_pct, 0)) if last_gap_pct < -0.3 else 0,
        "gap_frequency": total_gaps,
        "gap_hold_rate": (gap_held / gaps_up * 100) if gaps_up > 0 else 0,
        "gap_fill_rate": (gap_filled / total_gaps * 100) if total_gaps > 0 else 0,
        "gap_up_high_volume": last_gap_pct > 0.3 and last_gap_vol_ratio > 1.5,
        "gap_up_close_near_high": last_gap_pct > 0.3 and last_gap_close_near_high,
        "gap_vs_atr": (abs(last_gap_pct) * candles[-1]["close"] / 100 / atr) if atr else 0,
        "gap_volume_ratio": round(last_gap_vol_ratio, 2),
    }


# ─── sharpe / sortino helpers ──────────────────────────────────────────────

def _sharpe(closes, n):
    rets = _daily_returns(closes)
    if len(rets) < n:
        return None
    r = rets[-n:]
    m = sum(r) / len(r)
    s = _stdev(r)
    return (m / s * math.sqrt(252)) if s and s != 0 else 0


def _sortino(closes, n):
    rets = _daily_returns(closes)
    if len(rets) < n:
        return None
    r = rets[-n:]
    m = sum(r) / len(r)
    down = [x for x in r if x < 0]
    if len(down) < 2:
        return 0 if m <= 0 else 10.0
    ds = _stdev(down)
    return (m / ds * math.sqrt(252)) if ds and ds != 0 else 0


# ═══════════════════════════════════════════════════════════════════════════
#  MAIN COMPUTATION
# ═══════════════════════════════════════════════════════════════════════════

def compute_indicators(candles: list[dict]) -> dict:
    """Return a dict of catalog-id -> value for one stock's daily series."""
    if not candles:
        return {}
    c = candles
    closes = _closes(c)
    opens = _opens(c)
    highs = _highs(c)
    lows = _lows(c)
    vols = _vols(c)
    last = closes[-1]
    n_bars = len(closes)
    out: dict[str, float | bool | None] = {}

    # ── Price Momentum ──────────────────────────────────────────────────
    for n in (1, 3, 5, 10, 20, 40, 60, 120, 252):
        out[f"return_{n}d"] = _ret(closes, n)
    if n_bars > 273:
        out["return_252d_ex_21d"] = (closes[-22] / closes[-274] - 1) * 100

    r5 = out.get("return_5d")
    r20 = out.get("return_20d")
    r10 = out.get("return_10d")
    r60 = out.get("return_60d")
    out["return_acceleration_5d_vs_20d"] = (r5 - r20) if r5 is not None and r20 is not None else None
    out["return_acceleration_10d_vs_60d"] = (r10 - r60) if r10 is not None and r60 is not None else None

    # ── Moving Averages ─────────────────────────────────────────────────
    for n in (5, 10, 20, 50, 100, 200):
        out[f"sma_{n}"] = _sma(closes, n)
    for n in (9, 20, 50, 100, 200):
        out[f"ema_{n}"] = _ema(closes, n)

    for n in (20, 50, 100, 200):
        s = out.get(f"sma_{n}")
        out[f"price_vs_sma{n}"] = ((last / s - 1) * 100) if s else None
    for n in (20, 50):
        e = out.get(f"ema_{n}")
        out[f"price_vs_ema{n}"] = ((last / e - 1) * 100) if e else None

    s20, s50, s100, s200 = out.get("sma_20"), out.get("sma_50"), out.get("sma_100"), out.get("sma_200")
    e20, e50, e200 = out.get("ema_20"), out.get("ema_50"), out.get("ema_200")

    out["sma20_vs_sma50"] = (s20 / s50 - 1) * 100 if s20 and s50 else None
    out["sma50_vs_sma200"] = (s50 / s200 - 1) * 100 if s50 and s200 else None
    out["ema20_vs_ema50"] = (e20 / e50 - 1) * 100 if e20 and e50 else None
    out["ema50_vs_ema200"] = (e50 / e200 - 1) * 100 if e50 and e200 else None

    # MA slopes (5-bar rate of change of the MA)
    for n, label in [(20, "sma20"), (50, "sma50"), (100, "sma100"), (200, "sma200")]:
        if n_bars >= n + 5:
            sma_now = _sma(closes, n)
            sma_prev = _sma(closes[:-5], n)
            out[f"{label}_slope"] = (sma_now / sma_prev - 1) * 100 if sma_prev and sma_now else None
        else:
            out[f"{label}_slope"] = None

    for n, label in [(20, "ema20"), (50, "ema50"), (200, "ema200")]:
        if n_bars >= n + 5:
            ema_now = _ema(closes, n)
            ema_prev = _ema(closes[:-5], n)
            out[f"{label}_slope"] = (ema_now / ema_prev - 1) * 100 if ema_prev and ema_now else None
        else:
            out[f"{label}_slope"] = None

    # MA alignment score: +1 for each bullish condition (price>ema20>ema50>sma100>sma200)
    alignment = 0
    chain = [last, e20, e50, s100, s200]
    if all(v is not None for v in chain):
        for i in range(len(chain) - 1):
            if chain[i] > chain[i + 1]:
                alignment += 1
            else:
                alignment -= 1
    out["moving_average_alignment_score"] = alignment

    # ── Momentum Indicators ─────────────────────────────────────────────
    out["rsi_7"] = _rsi(closes, 7)
    out["rsi_14"] = _rsi(closes, 14)
    out["rsi_21"] = _rsi(closes, 21)

    rsi_vals = _rsi_series(closes, 14)
    out["rsi_slope"] = _slope(rsi_vals, 5) if len(rsi_vals) >= 5 else None
    out["rsi_change_5d"] = (rsi_vals[-1] - rsi_vals[-6]) if len(rsi_vals) >= 6 else None
    out["rsi_change_10d"] = (rsi_vals[-1] - rsi_vals[-11]) if len(rsi_vals) >= 11 else None
    out["rsi_above_50"] = rsi_vals[-1] > 50 if rsi_vals else None
    out["rsi_above_60"] = rsi_vals[-1] > 60 if rsi_vals else None
    out["rsi_above_70"] = rsi_vals[-1] > 70 if rsi_vals else None

    # RSI persistence
    persist_60 = persist_70 = 0
    for v in reversed(rsi_vals):
        if v >= 60:
            persist_60 += 1
        else:
            break
    for v in reversed(rsi_vals):
        if v >= 70:
            persist_70 += 1
        else:
            break
    out["rsi_persistence_above_60"] = persist_60
    out["rsi_persistence_above_70"] = persist_70

    # RSI percentile within own history
    if len(rsi_vals) >= 60:
        out["rsi_percentile"] = _percentile_rank(rsi_vals[-1], rsi_vals[-252:]) if len(rsi_vals) >= 252 else _percentile_rank(rsi_vals[-1], rsi_vals)
    else:
        out["rsi_percentile"] = None

    # MACD
    ema12, ema26 = _ema(closes, 12), _ema(closes, 26)
    if ema12 is not None and ema26 is not None:
        macd_val = ema12 - ema26
        out["macd"] = macd_val
        out["macd_above_zero"] = macd_val > 0
        # MACD signal: need MACD series for EMA(9)
        macd_series = []
        if n_bars >= 35:
            for i in range(34, n_bars):
                e12 = _ema(closes[:i + 1], 12)
                e26 = _ema(closes[:i + 1], 26)
                if e12 is not None and e26 is not None:
                    macd_series.append(e12 - e26)
        if len(macd_series) >= 9:
            signal = _ema(macd_series, 9)
            out["macd_signal"] = signal
            hist = macd_val - signal if signal is not None else None
            out["macd_histogram"] = hist
            if len(macd_series) >= 2:
                prev_hist = macd_series[-2] - _ema(macd_series[:-1], 9) if _ema(macd_series[:-1], 9) is not None else None
                out["macd_histogram_slope"] = (hist - prev_hist) if hist is not None and prev_hist is not None else None
                out["macd_histogram_change"] = hist - prev_hist if hist is not None and prev_hist is not None else None
            out["macd_bullish_crossover"] = (macd_val > signal and macd_series[-2] <= _ema(macd_series[:-1], 9)) if signal is not None and len(macd_series) >= 10 and _ema(macd_series[:-1], 9) is not None else None
        else:
            out["macd_signal"] = None
            out["macd_histogram"] = None
            out["macd_histogram_slope"] = None
            out["macd_histogram_change"] = None
            out["macd_bullish_crossover"] = None
    else:
        for k in ("macd", "macd_above_zero", "macd_signal", "macd_histogram",
                   "macd_histogram_slope", "macd_histogram_change", "macd_bullish_crossover"):
            out[k] = None

    # ATR
    out["atr_14"] = _atr(c, 14)
    out["atr_20"] = _atr(c, 20)
    out["atr_50"] = _atr(c, 50)
    if out.get("atr_14") and last:
        out["atr_percentage"] = out["atr_14"] / last * 100
    else:
        out["atr_percentage"] = None
    a14, a50 = out.get("atr_14"), out.get("atr_50")
    out["atr_14_vs_atr_50"] = (a14 / a50) if a14 and a50 else None
    # ATR slope (5-bar)
    tr_vals = _true_ranges(c)
    if len(tr_vals) >= 19:
        atr_now = sum(tr_vals[-14:]) / 14
        atr_prev = sum(tr_vals[-19:-5]) / 14
        out["atr_slope"] = (atr_now - atr_prev) / atr_prev * 100 if atr_prev else None
    else:
        out["atr_slope"] = None

    # ADX with DI+/DI-
    adx14, di_plus, di_minus = _adx_full(c, 14)
    out["adx_14"] = adx14
    out["di_plus"] = di_plus
    out["di_minus"] = di_minus
    out["di_difference"] = (di_plus - di_minus) if di_plus is not None and di_minus is not None else None
    adx20, _, _ = _adx_full(c, 20)
    out["adx_20"] = adx20
    # ADX slope
    if n_bars >= 35:
        adx_prev, _, _ = _adx_full(c[:-5], 14)
        out["adx_slope"] = (adx14 - adx_prev) if adx14 is not None and adx_prev is not None else None
    else:
        out["adx_slope"] = None

    # Stochastic
    stoch_k, stoch_d = _stochastic(c)
    out["stochastic_k"] = stoch_k
    out["stochastic_d"] = stoch_d

    # ROC
    out["roc_12"] = _roc(closes, 12)
    out["roc_20"] = _roc(closes, 20)

    # Supertrend
    st_val, st_dir = _supertrend(c)
    out["supertrend"] = st_val
    out["supertrend_direction"] = st_dir

    # ── Volatility ──────────────────────────────────────────────────────
    for n in (5, 10, 20, 60, 120):
        out[f"historical_volatility_{n}d"] = _hist_vol(closes, n)

    hv20 = out.get("historical_volatility_20d")
    hv60 = out.get("historical_volatility_60d")
    out["volatility_expansion"] = (hv20 is not None and hv60 is not None and hv20 > hv60 * 1.2)
    out["volatility_contraction"] = (hv20 is not None and hv60 is not None and hv20 < hv60 * 0.8)

    # Volatility percentile/zscore within own history
    if n_bars >= 60:
        vol_hist = []
        for i in range(20, n_bars):
            v = _hist_vol(closes[:i + 1], 20)
            if v is not None:
                vol_hist.append(v)
        if hv20 is not None and vol_hist:
            out["volatility_percentile"] = _percentile_rank(hv20, vol_hist)
            out["volatility_zscore"] = _zscore(hv20, vol_hist)
        else:
            out["volatility_percentile"] = None
            out["volatility_zscore"] = None
    else:
        out["volatility_percentile"] = None
        out["volatility_zscore"] = None

    # ── Bollinger Bands ─────────────────────────────────────────────────
    bb_mid, bb_upper, bb_lower = _bollinger(closes, 20, 2)
    out["bb_middle"] = bb_mid
    out["bb_upper"] = bb_upper
    out["bb_lower"] = bb_lower
    if bb_mid and bb_upper and bb_lower:
        out["bb_width"] = (bb_upper - bb_lower) / bb_mid * 100 if bb_mid else None
        out["bb_percent_b"] = (last - bb_lower) / (bb_upper - bb_lower) if (bb_upper - bb_lower) != 0 else 0.5
        out["price_above_upper_band"] = last > bb_upper
        out["price_below_lower_band"] = last < bb_lower
        # BB squeeze/expansion
        bw_series = _bb_width_series(closes)
        if bw_series and len(bw_series) >= 20:
            current_bw = out["bb_width"]
            bw_pctile = _percentile_rank(current_bw, bw_series[-120:]) if current_bw is not None else None
            out["bb_width_percentile"] = bw_pctile
            out["bb_squeeze"] = bw_pctile is not None and bw_pctile < 20
            out["bb_expansion"] = bw_pctile is not None and bw_pctile > 80
        else:
            out["bb_width_percentile"] = None
            out["bb_squeeze"] = None
            out["bb_expansion"] = None
    else:
        for k in ("bb_width", "bb_percent_b", "bb_squeeze", "bb_expansion",
                   "bb_width_percentile", "price_above_upper_band", "price_below_lower_band"):
            out[k] = None

    # ── Volume ──────────────────────────────────────────────────────────
    out["volume_1d"] = vols[-1] if vols else None
    for n in (5, 20, 50):
        avg = _sma(vols, n)
        out[f"volume_{n}d_avg"] = avg
        out[f"volume_ratio_{n}d"] = (vols[-1] / avg) if avg else None
    out["rvol"] = out.get("volume_ratio_20d")
    out["volume_ratio_1d"] = out.get("volume_ratio_20d")

    # Up/down volume
    if n_bars >= 2:
        up_vol = sum(c[i]["volume"] for i in range(max(1, n_bars - 20), n_bars) if closes[i] > closes[i - 1])
        dn_vol = sum(c[i]["volume"] for i in range(max(1, n_bars - 20), n_bars) if closes[i] < closes[i - 1])
        out["up_volume"] = up_vol
        out["down_volume"] = dn_vol
        out["up_down_volume_ratio"] = (up_vol / dn_vol) if dn_vol > 0 else (10 if up_vol > 0 else 1)
    else:
        out["up_volume"] = out["down_volume"] = out["up_down_volume_ratio"] = None

    # Volume trend & slope
    if n_bars >= 20:
        out["volume_trend"] = _slope(vols, 20)
        out["volume_slope"] = _slope(vols, 10)
    else:
        out["volume_trend"] = out["volume_slope"] = None

    # Volume z-score
    if n_bars >= 20:
        vol_20 = vols[-20:]
        out["volume_zscore"] = _zscore(vols[-1], vol_20)
    else:
        out["volume_zscore"] = None

    # Time-adjusted RVOL (same as rvol for daily)
    out["time_adjusted_rvol"] = out.get("rvol")

    # ── Volume-Price Confirmation ───────────────────────────────────────
    if n_bars >= 2:
        ret1 = closes[-1] / closes[-2] - 1 if closes[-2] else 0
        vr = out.get("volume_ratio_20d") or 1
        out["price_change_x_volume_ratio"] = ret1 * 100 * vr
        out["up_day_high_volume"] = ret1 > 0 and vr > 1.5
        out["up_day_low_volume"] = ret1 > 0 and vr < 0.7
        out["down_day_high_volume"] = ret1 < 0 and vr > 1.5
        out["down_day_low_volume"] = ret1 < 0 and vr < 0.7
    else:
        for k in ("price_change_x_volume_ratio", "up_day_high_volume", "up_day_low_volume",
                   "down_day_high_volume", "down_day_low_volume"):
            out[k] = None

    rng = c[-1]["high"] - c[-1]["low"]
    out["close_near_day_high"] = ((c[-1]["close"] - c[-1]["low"]) / rng * 100) if rng > 0 else 50
    out["close_near_day_low"] = ((c[-1]["high"] - c[-1]["close"]) / rng * 100) if rng > 0 else 50

    # Volume-price trend (OBV-like but price-weighted)
    if n_bars >= 20:
        vpt = 0
        for i in range(max(1, n_bars - 20), n_bars):
            if closes[i - 1] != 0:
                vpt += vols[i] * (closes[i] / closes[i - 1] - 1)
        out["volume_price_trend"] = vpt
    else:
        out["volume_price_trend"] = None

    # Price-volume confirmation score (composite)
    pvc_score = 0
    if out.get("up_day_high_volume"):
        pvc_score += 2
    if out.get("up_day_low_volume"):
        pvc_score -= 1
    if out.get("down_day_high_volume"):
        pvc_score -= 2
    if out.get("close_near_day_high") and out["close_near_day_high"] > 70:
        pvc_score += 1
    out["price_volume_confirmation_score"] = pvc_score

    # ── Liquidity ───────────────────────────────────────────────────────
    out["average_volume_20d"] = _sma(vols, 20)
    out["average_volume_50d"] = _sma(vols, 50)
    for n in (20, 50, 120):
        if n_bars >= n:
            dv = [closes[i] * vols[i] for i in range(n_bars - n, n_bars)]
            out[f"average_dollar_volume_{n}d"] = sum(dv) / n
        else:
            out[f"average_dollar_volume_{n}d"] = None
    out["turnover_ratio"] = (vols[-1] * last) if last else None

    # ── Breakout ────────────────────────────────────────────────────────
    for n in (20, 50, 100, 200):
        if n_bars >= n:
            hi = max(highs[-n:])
            out[f"distance_from_{n}d_high"] = (last / hi - 1) * 100 if hi else None
            prior_hi = max(highs[-n:-1]) if n_bars > n else hi
            out[f"breakout_{n}d"] = last > prior_hi
        else:
            out[f"distance_from_{n}d_high"] = None
            out[f"breakout_{n}d"] = None

    for n in (20, 50):
        if n_bars >= n:
            lo = min(lows[-n:])
            out[f"distance_from_{n}d_low"] = (last / lo - 1) * 100 if lo else None
        else:
            out[f"distance_from_{n}d_low"] = None

    if n_bars >= 252:
        h252 = max(highs[-252:])
        out["distance_from_52w_high"] = (last / h252 - 1) * 100
        out["breakout_52w"] = last > max(highs[-252:-1])
    else:
        out["distance_from_52w_high"] = None
        out["breakout_52w"] = None

    # Breakout quality metrics
    if n_bars >= 21 and out.get("breakout_20d"):
        prev_hi = max(highs[-21:-1])
        out["breakout_percentage"] = (last / prev_hi - 1) * 100 if prev_hi else 0
        vr_bo = out.get("volume_ratio_20d") or 1
        out["breakout_volume_ratio"] = vr_bo
        rng_bo = c[-1]["high"] - c[-1]["low"]
        out["breakout_close_strength"] = (c[-1]["close"] - c[-1]["low"]) / rng_bo if rng_bo > 0 else 0.5
        out["breakout_strength"] = (out["breakout_percentage"] or 0) * vr_bo
    else:
        out["breakout_percentage"] = out["breakout_volume_ratio"] = None
        out["breakout_close_strength"] = out["breakout_strength"] = None

    # Follow-through after breakout
    for ft_n in (1, 3, 5):
        if n_bars > ft_n + 1 and out.get(f"breakout_20d") is not None:
            out[f"breakout_follow_through_{ft_n}d"] = _ret(closes, ft_n)
        else:
            out[f"breakout_follow_through_{ft_n}d"] = None

    # Breakout failure analysis
    if n_bars >= 50:
        bo_count = fail_count = 0
        for i in range(30, n_bars - 1):
            if closes[i] > max(highs[i - 20:i]):
                bo_count += 1
                if closes[min(i + 3, n_bars - 1)] < closes[i]:
                    fail_count += 1
        out["false_breakout_count"] = fail_count
        out["breakout_failure_rate"] = (fail_count / bo_count * 100) if bo_count > 0 else 0
        out["breakout_retest_success"] = ((bo_count - fail_count) / bo_count * 100) if bo_count > 0 else 0
    else:
        out["false_breakout_count"] = out["breakout_failure_rate"] = out["breakout_retest_success"] = None

    # Resistance/support
    if n_bars >= 50:
        recent_high = max(highs[-20:])
        tests = sum(1 for i in range(n_bars - 50, n_bars) if abs(highs[i] / recent_high - 1) < 0.01)
        breaks = sum(1 for i in range(n_bars - 50, n_bars) if closes[i] > recent_high)
        out["resistance_test_count"] = tests
        out["resistance_break_count"] = breaks
        recent_low = min(lows[-20:])
        out["support_distance"] = (last / recent_low - 1) * 100 if recent_low else None
    else:
        out["resistance_test_count"] = out["resistance_break_count"] = out["support_distance"] = None

    # ── Drawdown ────────────────────────────────────────────────────────
    for n in (20, 50, 100, 200):
        if n_bars >= n:
            peak = max(closes[-n:])
            out[f"drawdown_from_{n}d_high"] = (last / peak - 1) * 100 if peak else None
        else:
            out[f"drawdown_from_{n}d_high"] = None

    if n_bars >= 252:
        out["drawdown_from_52w_high"] = (last / max(closes[-252:]) - 1) * 100

    # Max drawdown over periods
    for n in (20, 60, 120):
        if n_bars >= n:
            peak = closes[-n]
            max_dd = 0
            for i in range(n_bars - n, n_bars):
                peak = max(peak, closes[i])
                dd = (closes[i] / peak - 1) * 100
                max_dd = min(max_dd, dd)
            out[f"max_drawdown_{n}d"] = max_dd
        else:
            out[f"max_drawdown_{n}d"] = None

    # Recovery from drawdown
    if n_bars >= 60:
        peak60 = max(closes[-60:])
        trough = min(closes[-20:])
        if peak60 != trough:
            out["recovery_from_drawdown"] = (last - trough) / (peak60 - trough) * 100
        else:
            out["recovery_from_drawdown"] = 100
    else:
        out["recovery_from_drawdown"] = None

    # Drawdown duration
    if n_bars >= 20:
        peak_val = closes[-1]
        dd_dur = 0
        for i in range(n_bars - 1, -1, -1):
            if closes[i] >= peak_val:
                break
            dd_dur += 1
            peak_val = max(peak_val, closes[i])
        out["drawdown_duration"] = dd_dur
    else:
        out["drawdown_duration"] = None

    # ── Trend Structure ─────────────────────────────────────────────────
    up = dn = 0
    for i in range(n_bars - 1, 0, -1):
        if closes[i] > closes[i - 1] and dn == 0:
            up += 1
        else:
            break
    for i in range(n_bars - 1, 0, -1):
        if closes[i] < closes[i - 1] and up == 0:
            dn += 1
        else:
            break
    out["consecutive_up_days"] = up
    out["consecutive_down_days"] = dn

    # Swing analysis
    if n_bars >= 30:
        swing_highs, swing_lows = _find_swings(highs, lows, closes, 5)
        hh_count = ll_count = hl_count = lh_count = 0
        for i in range(1, len(swing_highs)):
            if swing_highs[i][1] > swing_highs[i - 1][1]:
                hh_count += 1
            else:
                lh_count += 1
        for i in range(1, len(swing_lows)):
            if swing_lows[i][1] > swing_lows[i - 1][1]:
                hl_count += 1
            else:
                ll_count += 1
        out["higher_high_count"] = hh_count
        out["higher_low_count"] = hl_count
        out["lower_high_count"] = lh_count
        out["lower_low_count"] = ll_count

        # Swing strength
        out["swing_high_strength"] = swing_highs[-1][1] / last - 1 if swing_highs and last else None
        out["swing_low_strength"] = 1 - swing_lows[-1][1] / last if swing_lows and last else None

        # Trend structure score: HH+HL positive, LH+LL negative
        out["trend_structure_score"] = hh_count + hl_count - lh_count - ll_count

        # Distance from swings
        if swing_highs:
            out["distance_from_swing_high"] = (last / swing_highs[-1][1] - 1) * 100
            out["days_since_last_high"] = n_bars - 1 - swing_highs[-1][0]
        else:
            out["distance_from_swing_high"] = out["days_since_last_high"] = None
        if swing_lows:
            out["distance_from_swing_low"] = (last / swing_lows[-1][1] - 1) * 100
            out["days_since_last_low"] = n_bars - 1 - swing_lows[-1][0]
        else:
            out["distance_from_swing_low"] = out["days_since_last_low"] = None

        # Trend duration
        td = 0
        if hh_count + hl_count > lh_count + ll_count:
            for i in range(n_bars - 1, 0, -1):
                if closes[i] >= closes[i - 1]:
                    td += 1
                elif td > 3:
                    break
                else:
                    td = 0
        out["trend_duration_days"] = td
    else:
        for k in ("higher_high_count", "higher_low_count", "lower_high_count", "lower_low_count",
                   "swing_high_strength", "swing_low_strength", "trend_structure_score",
                   "distance_from_swing_high", "distance_from_swing_low",
                   "days_since_last_high", "days_since_last_low", "trend_duration_days"):
            out[k] = None

    # ── Price Action ────────────────────────────────────────────────────
    o, h, l, cl = c[-1]["open"], c[-1]["high"], c[-1]["low"], c[-1]["close"]
    rng = h - l
    out["close_position"] = ((cl - l) / rng * 100) if rng else None
    out["body_size"] = (abs(cl - o) / o * 100) if o else None
    out["candle_range"] = rng
    out["body_to_range"] = (abs(cl - o) / rng * 100) if rng else None
    out["upper_wick"] = ((h - max(o, cl)) / rng * 100) if rng else None
    out["lower_wick"] = ((min(o, cl) - l) / rng * 100) if rng else None

    # Multi-day price action
    for n in (5, 10, 20):
        if n_bars >= n:
            positive = sum(1 for i in range(n_bars - n, n_bars) if closes[i] > opens[i])
            out[f"positive_close_ratio_{n}d"] = positive / n * 100
        else:
            out[f"positive_close_ratio_{n}d"] = None

    if n_bars >= 5:
        out["average_body_5d"] = sum(abs(closes[i] - opens[i]) / opens[i] * 100
                                     for i in range(n_bars - 5, n_bars) if opens[i]) / 5
        out["average_range_5d"] = sum(highs[i] - lows[i] for i in range(n_bars - 5, n_bars)) / 5
    else:
        out["average_body_5d"] = out["average_range_5d"] = None
    if n_bars >= 20:
        out["average_range_20d"] = sum(highs[i] - lows[i] for i in range(n_bars - 20, n_bars)) / 20
    else:
        out["average_range_20d"] = None

    # Bullish/bearish candle ratio over 20 days
    if n_bars >= 20:
        bull = sum(1 for i in range(n_bars - 20, n_bars) if closes[i] > opens[i])
        bear = 20 - bull
        out["bullish_candle_ratio"] = bull / 20 * 100
        out["bearish_candle_ratio"] = bear / 20 * 100
    else:
        out["bullish_candle_ratio"] = out["bearish_candle_ratio"] = None

    # ── Gap Momentum ────────────────────────────────────────────────────
    gap_data = _gap_analysis(c)
    out.update(gap_data)

    # ── VWAP ────────────────────────────────────────────────────────────
    out["vwap"] = _vwap_daily(c, 1)  # intraday approximation for daily: typical price
    for n in (20, 50):
        vw = _vwap_daily(c, n)
        out[f"anchored_vwap_{n}d"] = vw
    if out.get("vwap") and last:
        out["price_vs_vwap"] = (last / out["vwap"] - 1) * 100
        out["vwap_distance"] = (last / out["vwap"] - 1) * 100
        out["price_above_vwap"] = last > out["vwap"]
    else:
        out["price_vs_vwap"] = out["vwap_distance"] = out["price_above_vwap"] = None

    # VWAP slope
    if n_bars >= 6:
        vwap_now = _vwap_daily(c, 1)
        vwap_5ago = _vwap_daily(c[:-5], 1) if n_bars > 5 else None
        out["vwap_slope"] = (vwap_now / vwap_5ago - 1) * 100 if vwap_now and vwap_5ago else None
    else:
        out["vwap_slope"] = None

    # Anchored VWAP from breakout/swing low
    if n_bars >= 50:
        swing_highs, swing_lows = _find_swings(highs, lows, closes, 5)
        if swing_lows:
            sl_idx = swing_lows[-1][0]
            out["anchored_vwap_from_swing_low"] = _vwap_daily(c[sl_idx:], len(c) - sl_idx)
        else:
            out["anchored_vwap_from_swing_low"] = None
        # From breakout point
        bo_idx = None
        for i in range(n_bars - 1, max(0, n_bars - 50), -1):
            if i >= 20 and closes[i] > max(highs[i - 20:i]):
                bo_idx = i
                break
        out["anchored_vwap_from_breakout"] = _vwap_daily(c[bo_idx:], n_bars - bo_idx) if bo_idx else None
    else:
        out["anchored_vwap_from_swing_low"] = out["anchored_vwap_from_breakout"] = None

    if out.get("anchored_vwap_20d") and last:
        out["anchored_vwap_distance"] = (last / out["anchored_vwap_20d"] - 1) * 100
    else:
        out["anchored_vwap_distance"] = None

    # VWAP reclaim/rejection
    if n_bars >= 3:
        vw = out.get("vwap")
        if vw:
            out["vwap_reclaim"] = closes[-2] < vw and closes[-1] > vw
            out["vwap_rejection"] = closes[-2] > vw and closes[-1] < vw
        else:
            out["vwap_reclaim"] = out["vwap_rejection"] = None
    else:
        out["vwap_reclaim"] = out["vwap_rejection"] = None

    # ── Money Flow ──────────────────────────────────────────────────────
    out["obv"] = _obv(c)
    obv_series = _obv_series(c)
    out["obv_slope"] = _slope(obv_series, 5) if len(obv_series) >= 5 else None
    out["obv_20d_slope"] = _slope(obv_series, 20) if len(obv_series) >= 20 else None
    out["cmf_20"] = _cmf(c, 20)
    out["cmf_50"] = _cmf(c, 50)
    out["mfi_14"] = _mfi(c, 14)
    # MFI slope
    if n_bars >= 20:
        mfi_now = _mfi(c, 14)
        mfi_prev = _mfi(c[:-5], 14) if n_bars > 19 else None
        out["mfi_slope"] = (mfi_now - mfi_prev) if mfi_now is not None and mfi_prev is not None else None
    else:
        out["mfi_slope"] = None

    ad_val, ad_slope = _ad_line(c)
    out["ad_line"] = ad_val
    out["ad_line_slope"] = ad_slope
    out["force_index"] = _force_index(c, 13)
    out["ease_of_movement"] = _ease_of_movement(c, 14)

    # ── Trend Quality ───────────────────────────────────────────────────
    for n in (10, 20, 50):
        out[f"efficiency_ratio_{n}d"] = _efficiency_ratio(closes, n)

    for n in (10, 20, 50):
        sl, r2 = _linreg(closes, n)
        out[f"linear_regression_slope_{n}d"] = sl
        if n in (20, 50):
            out[f"linear_regression_r2_{n}d"] = r2

    # t-statistic for trend
    if n_bars >= 20:
        rets_20 = _daily_returns(closes)[-20:]
        if len(rets_20) >= 20:
            m = sum(rets_20) / len(rets_20)
            s = _stdev(rets_20)
            out["trend_t_stat"] = (m / (s / math.sqrt(20))) if s and s != 0 else 0
        else:
            out["trend_t_stat"] = None
    else:
        out["trend_t_stat"] = None

    # Positive days count
    for n in (5, 10, 20, 50):
        if n_bars >= n:
            pos = sum(1 for i in range(n_bars - n, n_bars) if closes[i] > closes[i - 1]) if n_bars > n else 0
            out[f"positive_days_{n}d"] = pos
        else:
            out[f"positive_days_{n}d"] = None

    for n in (10, 20, 50):
        pd = out.get(f"positive_days_{n}d")
        out[f"up_days_ratio_{n}d"] = (pd / n * 100) if pd is not None else None

    # ── Pullback Quality ────────────────────────────────────────────────
    out["distance_from_ema20"] = ((last / e20 - 1) * 100) if e20 else None
    out["distance_from_ema50"] = ((last / e50 - 1) * 100) if e50 else None

    if n_bars >= 20:
        peak20 = max(closes[-20:])
        trough20 = min(closes[-10:])
        out["pullback_depth"] = (trough20 / peak20 - 1) * 100 if peak20 else None
        # Duration: bars since peak
        peak_idx = closes[-20:].index(peak20)
        out["pullback_duration"] = 20 - peak_idx - 1
        # Recovery speed
        if trough20 < peak20 and last > trough20:
            out["recovery_speed"] = (last - trough20) / (peak20 - trough20)
        else:
            out["recovery_speed"] = 0
        # Volume contraction during pullback
        if peak_idx < 15:
            vol_before = _sma(vols[-20:-20 + peak_idx + 1], peak_idx + 1) if peak_idx > 0 else vols[-20]
            vol_during = _sma(vols[-20 + peak_idx + 1:], 20 - peak_idx - 1)
            out["pullback_volume_contraction"] = (vol_during / vol_before) if vol_before and vol_during else None
        else:
            out["pullback_volume_contraction"] = None
        # Pullback to ATR
        a14 = out.get("atr_14")
        out["pullback_to_atr_ratio"] = (abs(peak20 - trough20) / a14) if a14 else None
        out["pullback_hold_ema20"] = trough20 >= e20 if e20 and trough20 else None
        out["pullback_hold_ema50"] = trough20 >= e50 if e50 and trough20 else None
        out["pullback_recovery_strength"] = (last / trough20 - 1) * 100 if trough20 else None
    else:
        for k in ("pullback_depth", "pullback_duration", "recovery_speed",
                   "pullback_volume_contraction", "pullback_to_atr_ratio",
                   "pullback_hold_ema20", "pullback_hold_ema50", "pullback_recovery_strength"):
            out[k] = None

    # ── Statistical Momentum ────────────────────────────────────────────
    rets = _daily_returns(closes)
    for n in (5, 20, 60):
        if len(rets) >= n:
            r_n = rets[-n:]
            r_mean = sum(r_n) / n
            r_std = _stdev(r_n)
            out[f"return_zscore_{n}d"] = (r_n[-1] - r_mean) / r_std if r_std and r_std != 0 else 0
        else:
            out[f"return_zscore_{n}d"] = None

    for n in (20, 50):
        if n_bars >= n:
            segment = closes[-n:]
            m = sum(segment) / n
            s = _stdev(segment)
            out[f"price_zscore_{n}d"] = (last - m) / s if s and s != 0 else 0
        else:
            out[f"price_zscore_{n}d"] = None

    if n_bars >= 20:
        out["stat_volume_zscore"] = _zscore(vols[-1], vols[-20:])
    else:
        out["stat_volume_zscore"] = None

    # Composite stat z-scores
    r20 = out.get("return_20d")
    r60 = out.get("return_60d")
    if r20 is not None and len(rets) >= 20:
        ret_20d_vals = [sum(rets[i:i + 20]) * 100 for i in range(max(0, len(rets) - 120), len(rets) - 19)]
        out["stat_momentum_zscore"] = _zscore(r20, ret_20d_vals) if ret_20d_vals else None
        out["stat_return_percentile"] = _percentile_rank(r20, ret_20d_vals) if ret_20d_vals else None
        out["stat_momentum_percentile"] = out["stat_return_percentile"]
    else:
        out["stat_momentum_zscore"] = out["stat_return_percentile"] = out["stat_momentum_percentile"] = None
    out["stat_volatility_zscore"] = out.get("volatility_zscore")

    # ── Autocorrelation ─────────────────────────────────────────────────
    for n in (5, 10, 20):
        out[f"return_autocorrelation_{n}d"] = _autocorrelation(rets, n) if len(rets) > n + 10 else None

    # Sign autocorrelation
    if len(rets) >= 10:
        signs = [1 if r > 0 else -1 for r in rets]
        out["sign_autocorrelation"] = _autocorrelation(signs, 1)
    else:
        out["sign_autocorrelation"] = None

    # ── Mean Reversion Risk ─────────────────────────────────────────────
    out["distance_from_mean"] = out.get("price_vs_sma50")
    if s20 and n_bars >= 40:
        segment = closes[-40:]
        m = sum(segment) / len(segment)
        s = _stdev(segment)
        out["distance_from_sma20_zscore"] = (last - s20) / s if s and s != 0 else 0
    else:
        out["distance_from_sma20_zscore"] = None
    if s50 and n_bars >= 80:
        segment = closes[-80:]
        s = _stdev(segment)
        out["distance_from_sma50_zscore"] = (last - s50) / s if s and s != 0 else 0
    else:
        out["distance_from_sma50_zscore"] = None
    if e20 and n_bars >= 40:
        segment = closes[-40:]
        s = _stdev(segment)
        out["distance_from_ema20_zscore"] = (last - e20) / s if s and s != 0 else 0
    else:
        out["distance_from_ema20_zscore"] = None

    rsi14 = out.get("rsi_14")
    out["rsi_extreme"] = (rsi14 is not None and (rsi14 > 80 or rsi14 < 20))

    # Extension score: composite of how far from mean
    ext_components = []
    for z in ("distance_from_sma20_zscore", "distance_from_sma50_zscore"):
        v = out.get(z)
        if v is not None:
            ext_components.append(abs(v))
    out["extension_score"] = sum(ext_components) / len(ext_components) if ext_components else None

    # Mean reversion risk score (0-10)
    mr_score = 0
    if out.get("rsi_extreme"):
        mr_score += 3
    ext = out.get("extension_score")
    if ext is not None:
        mr_score += min(ext * 2, 5)
    bb_pb = out.get("bb_percent_b")
    if bb_pb is not None and (bb_pb > 1.0 or bb_pb < 0):
        mr_score += 2
    out["mean_reversion_risk_score"] = round(min(mr_score, 10), 1)

    # ── Risk-Adjusted Momentum ──────────────────────────────────────────
    for n in (20, 60, 120):
        out[f"sharpe_{n}d"] = _sharpe(closes, n)
        out[f"sortino_{n}d"] = _sortino(closes, n)

    r_vol = out.get("return_60d")
    hv60v = out.get("historical_volatility_60d")
    out["return_to_volatility"] = (r_vol / hv60v) if r_vol is not None and hv60v and hv60v != 0 else None

    dd60 = out.get("max_drawdown_60d")
    out["return_to_drawdown"] = (r_vol / abs(dd60)) if r_vol is not None and dd60 and dd60 != 0 else None

    # ── Return Distribution ─────────────────────────────────────────────
    if len(rets) >= 20:
        r_pct = [r * 100 for r in rets[-252:]] if len(rets) >= 252 else [r * 100 for r in rets]
        out["mean_daily_return"] = sum(r_pct) / len(r_pct)
        out["median_daily_return"] = median(r_pct)
        out["std_daily_return"] = _stdev(r_pct)
        out["skewness"] = _skewness(r_pct)
        out["kurtosis"] = _kurtosis(r_pct)
        out["best_day"] = max(r_pct)
        out["worst_day"] = min(r_pct)
        out["large_positive_days"] = sum(1 for r in r_pct if r > 3)
        out["large_negative_days"] = sum(1 for r in r_pct if r < -3)
    else:
        for k in ("mean_daily_return", "median_daily_return", "std_daily_return",
                   "skewness", "kurtosis", "best_day", "worst_day",
                   "large_positive_days", "large_negative_days"):
            out[k] = None

    # ── Volume Profile (simplified from daily data) ─────────────────────
    if n_bars >= 50:
        price_vol_bins: dict[int, int] = {}
        for i in range(n_bars - 50, n_bars):
            bin_price = round(closes[i], -1)  # round to nearest 10
            price_vol_bins[bin_price] = price_vol_bins.get(bin_price, 0) + vols[i]
        if price_vol_bins:
            poc = max(price_vol_bins, key=price_vol_bins.get)
            total_vol = sum(price_vol_bins.values())
            out["volume_point_of_control"] = poc
            out["price_vs_poc"] = (last / poc - 1) * 100 if poc else None
            out["volume_profile"] = price_vol_bins.get(round(last, -1), 0) / (total_vol / len(price_vol_bins)) if total_vol and price_vol_bins else None
            sorted_bins = sorted(price_vol_bins.items(), key=lambda x: x[1])
            hvn = sorted_bins[-1][0] if sorted_bins else last
            lvn = sorted_bins[0][0] if sorted_bins else last
            out["high_volume_node_distance"] = (last / hvn - 1) * 100 if hvn else None
            out["low_volume_node_distance"] = (last / lvn - 1) * 100 if lvn else None
            vals_list = list(price_vol_bins.values())
            out["volume_concentration"] = max(vals_list) / (total_vol / len(vals_list)) if total_vol and vals_list else None
            # Skew
            vol_mean = sum(vals_list) / len(vals_list)
            vol_std = _stdev(vals_list)
            out["volume_distribution_skew"] = _skewness(vals_list)
        else:
            for k in ("volume_point_of_control", "price_vs_poc", "volume_profile",
                       "high_volume_node_distance", "low_volume_node_distance",
                       "volume_concentration", "volume_distribution_skew"):
                out[k] = None
    else:
        for k in ("volume_point_of_control", "price_vs_poc", "volume_profile",
                   "high_volume_node_distance", "low_volume_node_distance",
                   "volume_concentration", "volume_distribution_skew"):
            out[k] = None

    # ── Tradability Filters (OHLCV-derivable subset) ────────────────────
    out["filter_price"] = last
    avg_dv = out.get("average_dollar_volume_20d")
    out["filter_average_dollar_volume"] = avg_dv
    out["filter_atr_percentage"] = out.get("atr_percentage")

    # Circuit distance (approximate: % from upper/lower circuit based on day range)
    if n_bars >= 2:
        prev_close = closes[-2]
        if prev_close:
            out["upper_circuit_distance"] = (prev_close * 1.20 - last) / last * 100
            out["lower_circuit_distance"] = (last - prev_close * 0.80) / last * 100
        else:
            out["upper_circuit_distance"] = out["lower_circuit_distance"] = None
    else:
        out["upper_circuit_distance"] = out["lower_circuit_distance"] = None

    # Round all numeric values
    for k, v in out.items():
        if isinstance(v, float):
            out[k] = round(v, 4)

    return out


# ═══════════════════════════════════════════════════════════════════════════
#  TIER 2: Cross-sectional indicators (need index + peer data)
# ═══════════════════════════════════════════════════════════════════════════

def compute_cross_sectional(
    symbol_indicators: dict[str, dict],
    index_candles: list[dict] | None = None,
    sector_map: dict[str, str] | None = None,
) -> dict[str, dict]:
    """Enrich per-symbol indicators with cross-sectional metrics.

    Args:
        symbol_indicators: {symbol: {indicator_id: value}} from compute_indicators
        index_candles: Nifty 50 daily candles for relative strength / beta
        sector_map: {symbol: sector_name} for sector grouping
    Returns:
        Updated symbol_indicators dict with Tier 2 indicators added
    """
    if not symbol_indicators:
        return symbol_indicators

    symbols = list(symbol_indicators.keys())
    sector_map = sector_map or {}

    # ── Cross-sectional percentiles ─────────────────────────────────────
    percentile_keys = [
        ("return_5d", "return_5d_percentile"),
        ("return_20d", "return_20d_percentile"),
        ("return_60d", "return_60d_percentile"),
        ("return_120d", "return_120d_percentile"),
        ("rvol", "rank_volume_percentile"),
        ("historical_volatility_20d", "rank_volatility_percentile"),
    ]

    for src_key, dst_key in percentile_keys:
        vals = [(s, symbol_indicators[s].get(src_key))
                for s in symbols if symbol_indicators[s].get(src_key) is not None]
        if not vals:
            continue
        sorted_vals = sorted(vals, key=lambda x: x[1])
        n = len(sorted_vals)
        for rank, (sym, _) in enumerate(sorted_vals):
            symbol_indicators[sym][dst_key] = round(rank / n * 100, 1)

    # Momentum percentile = return_60d percentile
    for sym in symbols:
        symbol_indicators[sym]["momentum_percentile"] = symbol_indicators[sym].get("return_60d_percentile")
        symbol_indicators[sym]["return_percentile"] = symbol_indicators[sym].get("return_20d_percentile")
        symbol_indicators[sym]["rank_momentum_percentile"] = symbol_indicators[sym].get("return_60d_percentile")

    # Volume percentile
    vol_vals = [(s, symbol_indicators[s].get("average_volume_20d"))
                for s in symbols if symbol_indicators[s].get("average_volume_20d") is not None]
    if vol_vals:
        sorted_v = sorted(vol_vals, key=lambda x: x[1])
        n = len(sorted_v)
        for rank, (sym, _) in enumerate(sorted_v):
            symbol_indicators[sym]["volume_percentile"] = round(rank / n * 100, 1)
            symbol_indicators[sym]["rank_liquidity_percentile"] = round(rank / n * 100, 1)
            symbol_indicators[sym]["liquidity_percentile"] = round(rank / n * 100, 1)

    # Breakout percentile
    bo_vals = [(s, symbol_indicators[s].get("distance_from_52w_high"))
               for s in symbols if symbol_indicators[s].get("distance_from_52w_high") is not None]
    if bo_vals:
        sorted_b = sorted(bo_vals, key=lambda x: x[1], reverse=True)  # closer to high = higher rank
        n = len(sorted_b)
        for rank, (sym, _) in enumerate(sorted_b):
            symbol_indicators[sym]["breakout_percentile"] = round(rank / n * 100, 1)

    # Trend percentile (based on trend_structure_score)
    trend_vals = [(s, symbol_indicators[s].get("trend_structure_score"))
                  for s in symbols if symbol_indicators[s].get("trend_structure_score") is not None]
    if trend_vals:
        sorted_t = sorted(trend_vals, key=lambda x: x[1])
        n = len(sorted_t)
        for rank, (sym, _) in enumerate(sorted_t):
            symbol_indicators[sym]["trend_percentile"] = round(rank / n * 100, 1)

    # RS percentile
    rs_vals = [(s, symbol_indicators[s].get("return_60d"))
               for s in symbols if symbol_indicators[s].get("return_60d") is not None]
    if rs_vals:
        sorted_rs = sorted(rs_vals, key=lambda x: x[1])
        n = len(sorted_rs)
        for rank, (sym, _) in enumerate(sorted_rs):
            symbol_indicators[sym]["relative_strength_percentile"] = round(rank / n * 100, 1)
            symbol_indicators[sym]["rs_percentile"] = round(rank / n * 100, 1)

    # Sector strength percentile
    sector_returns: dict[str, list] = {}
    for sym in symbols:
        sec = sector_map.get(sym, "Unknown")
        r60 = symbol_indicators[sym].get("return_60d")
        if r60 is not None:
            sector_returns.setdefault(sec, []).append(r60)
    sector_avg = {sec: sum(rets) / len(rets) for sec, rets in sector_returns.items() if rets}
    if sector_avg:
        sorted_sectors = sorted(sector_avg.items(), key=lambda x: x[1])
        n = len(sorted_sectors)
        sec_rank = {sec: rank / n * 100 for rank, (sec, _) in enumerate(sorted_sectors)}
        for sym in symbols:
            sec = sector_map.get(sym, "Unknown")
            symbol_indicators[sym]["sector_strength_percentile"] = round(sec_rank.get(sec, 50), 1)

    # ── Relative Strength vs Index ──────────────────────────────────────
    if index_candles and len(index_candles) >= 10:
        idx_closes = _closes(index_candles)
        for n, suffix in [(1, "1d"), (5, "5d"), (20, "20d"), (60, "60d"), (120, "120d")]:
            idx_ret = _ret(idx_closes, n)
            if idx_ret is not None:
                for sym in symbols:
                    sym_ret = symbol_indicators[sym].get(f"return_{suffix}")
                    if sym_ret is not None:
                        symbol_indicators[sym][f"rs_vs_nifty_{suffix}"] = round(sym_ret - idx_ret, 4)
                    else:
                        symbol_indicators[sym][f"rs_vs_nifty_{suffix}"] = None

        # RS ratio (cumulative relative strength)
        for sym in symbols:
            r60 = symbol_indicators[sym].get("return_60d")
            idx_r60 = _ret(idx_closes, 60)
            if r60 is not None and idx_r60 is not None and idx_r60 != 0:
                symbol_indicators[sym]["rs_ratio"] = round(r60 / abs(idx_r60), 4)
            else:
                symbol_indicators[sym]["rs_ratio"] = None

        # RS slope
        for n, suffix in [(5, "5d"), (20, "20d"), (60, "60d")]:
            for sym in symbols:
                rs_now = symbol_indicators[sym].get(f"rs_vs_nifty_{suffix}")
                # Approximate slope
                symbol_indicators[sym][f"rs_slope_{suffix}"] = rs_now  # simplified

        # RS acceleration
        for sym in symbols:
            rs5 = symbol_indicators[sym].get("rs_vs_nifty_5d")
            rs20 = symbol_indicators[sym].get("rs_vs_nifty_20d")
            symbol_indicators[sym]["rs_acceleration_5d"] = (rs5 - rs20) if rs5 is not None and rs20 is not None else None
            rs20v = symbol_indicators[sym].get("rs_vs_nifty_20d")
            rs60 = symbol_indicators[sym].get("rs_vs_nifty_60d")
            symbol_indicators[sym]["rs_acceleration_20d"] = (rs20v - rs60) if rs20v is not None and rs60 is not None else None

        # RS breakout / new high
        for sym in symbols:
            rs60 = symbol_indicators[sym].get("rs_vs_nifty_60d")
            rs120 = symbol_indicators[sym].get("rs_vs_nifty_120d")
            symbol_indicators[sym]["rs_breakout"] = (rs60 is not None and rs120 is not None and rs60 > rs120)
            symbol_indicators[sym]["rs_new_high"] = (rs60 is not None and rs60 > 0 and
                                                      symbol_indicators[sym].get("distance_from_52w_high") is not None and
                                                      symbol_indicators[sym]["distance_from_52w_high"] > -2)

        # ── Market Regime (from index data) ─────────────────────────────
        idx_indicators = compute_indicators(index_candles)
        for n in (1, 5, 20, 50, 200):
            suffix = f"{n}d"
            out_key = f"nifty_return_{suffix}"
            val = idx_indicators.get(f"return_{suffix}")
            for sym in symbols:
                symbol_indicators[sym][out_key] = val

        for n in (20, 50, 200):
            sma = idx_indicators.get(f"sma_{n}")
            idx_last = idx_closes[-1] if idx_closes else None
            for sym in symbols:
                symbol_indicators[sym][f"nifty_above_sma{n}"] = (idx_last > sma) if idx_last and sma else None
                sma_slope = idx_indicators.get(f"sma{n}_slope")
                symbol_indicators[sym][f"nifty_sma{n}_slope"] = sma_slope

        for sym in symbols:
            symbol_indicators[sym]["nifty_adx"] = idx_indicators.get("adx_14")
            symbol_indicators[sym]["nifty_atr"] = idx_indicators.get("atr_14")
            symbol_indicators[sym]["nifty_volatility"] = idx_indicators.get("historical_volatility_20d")

        # Market regime label
        idx_r20 = idx_indicators.get("return_20d")
        idx_above_sma50 = idx_indicators.get("sma_50") and idx_closes[-1] > idx_indicators["sma_50"] if idx_closes else False
        idx_above_sma200 = idx_indicators.get("sma_200") and idx_closes[-1] > idx_indicators["sma_200"] if idx_closes else False
        if idx_above_sma200 and idx_above_sma50 and (idx_r20 or 0) > 0:
            regime = "bullish"
        elif idx_above_sma200 and not idx_above_sma50:
            regime = "correcting"
        elif not idx_above_sma200 and (idx_r20 or 0) > -5:
            regime = "bearish"
        else:
            regime = "crisis"
        for sym in symbols:
            symbol_indicators[sym]["market_regime_label"] = regime

    # ── Relative Strength vs Sector ─────────────────────────────────────
    sector_groups: dict[str, list[str]] = {}
    for sym in symbols:
        sec = sector_map.get(sym, "Unknown")
        sector_groups.setdefault(sec, []).append(sym)

    for sec, sec_syms in sector_groups.items():
        for n_suffix in ["5d", "20d", "60d", "120d"]:
            sec_rets = [symbol_indicators[s].get(f"return_{n_suffix}")
                        for s in sec_syms if symbol_indicators[s].get(f"return_{n_suffix}") is not None]
            sec_avg = sum(sec_rets) / len(sec_rets) if sec_rets else None
            for sym in sec_syms:
                sym_ret = symbol_indicators[sym].get(f"return_{n_suffix}")
                if sym_ret is not None and sec_avg is not None:
                    symbol_indicators[sym][f"rs_vs_sector_{n_suffix}"] = round(sym_ret - sec_avg, 4)
                else:
                    symbol_indicators[sym][f"rs_vs_sector_{n_suffix}"] = None

        # Peer rank and percentile
        rets_60 = [(s, symbol_indicators[s].get("return_60d"))
                    for s in sec_syms if symbol_indicators[s].get("return_60d") is not None]
        if rets_60:
            sorted_peers = sorted(rets_60, key=lambda x: x[1])
            n = len(sorted_peers)
            for rank, (sym, _) in enumerate(sorted_peers):
                symbol_indicators[sym]["peer_rank"] = n - rank
                symbol_indicators[sym]["peer_percentile"] = round(rank / n * 100, 1)
                symbol_indicators[sym]["rs_vs_peer_group"] = symbol_indicators[sym].get(f"rs_vs_sector_60d")

        # Sector-level metrics
        for n_suffix in ["1d", "5d", "20d", "60d", "120d"]:
            sec_rets = [symbol_indicators[s].get(f"return_{n_suffix}")
                        for s in sec_syms if symbol_indicators[s].get(f"return_{n_suffix}") is not None]
            avg_ret = sum(sec_rets) / len(sec_rets) if sec_rets else None
            for sym in sec_syms:
                symbol_indicators[sym][f"sector_return_{n_suffix}"] = round(avg_ret, 4) if avg_ret is not None else None

        # Sector rank
        if sec_avg is not None and sector_avg:
            sorted_secs = sorted(sector_avg.items(), key=lambda x: x[1])
            sec_ranks = {s: i + 1 for i, (s, _) in enumerate(sorted_secs)}
            for sym in sec_syms:
                symbol_indicators[sym]["sector_rank"] = sec_ranks.get(sec)
                symbol_indicators[sym]["sector_percentile"] = round(sec_ranks.get(sec, 0) / max(len(sector_avg), 1) * 100, 1)
                symbol_indicators[sym]["sector_relative_strength"] = symbol_indicators[sym].get(f"rs_vs_sector_60d")

        # Sector breadth metrics
        above_sma20 = sum(1 for s in sec_syms if symbol_indicators[s].get("price_vs_sma20") and symbol_indicators[s]["price_vs_sma20"] > 0)
        above_sma50 = sum(1 for s in sec_syms if symbol_indicators[s].get("price_vs_sma50") and symbol_indicators[s]["price_vs_sma50"] > 0)
        above_sma200 = sum(1 for s in sec_syms if symbol_indicators[s].get("price_vs_sma200") and symbol_indicators[s]["price_vs_sma200"] > 0)
        n_sec = len(sec_syms) or 1
        new_highs_sec = sum(1 for s in sec_syms if symbol_indicators[s].get("breakout_52w"))
        new_lows_sec = sum(1 for s in sec_syms if symbol_indicators[s].get("drawdown_from_52w_high") and symbol_indicators[s]["drawdown_from_52w_high"] < -20)
        for sym in sec_syms:
            symbol_indicators[sym]["sector_stocks_above_sma20"] = round(above_sma20 / n_sec * 100, 1)
            symbol_indicators[sym]["sector_stocks_above_sma50"] = round(above_sma50 / n_sec * 100, 1)
            symbol_indicators[sym]["sector_stocks_above_sma200"] = round(above_sma200 / n_sec * 100, 1)
            symbol_indicators[sym]["sector_breadth"] = round((above_sma50 / n_sec - 0.5) * 200, 1)
            symbol_indicators[sym]["sector_advance_decline"] = above_sma20 - (n_sec - above_sma20)
            symbol_indicators[sym]["sector_new_highs"] = new_highs_sec
            symbol_indicators[sym]["sector_new_lows"] = new_lows_sec
            symbol_indicators[sym]["sector_momentum_breadth"] = round(above_sma20 / n_sec * 100, 1)

        # Sector momentum score (composite)
        for sym in sec_syms:
            sr = symbol_indicators[sym].get("sector_return_60d") or 0
            sb = symbol_indicators[sym].get("sector_breadth") or 0
            symbol_indicators[sym]["sector_momentum_score"] = round(sr * 0.6 + sb * 0.4, 2)

        # Peer momentum
        for n_suffix in ["5d", "20d", "60d"]:
            sec_rets = [symbol_indicators[s].get(f"return_{n_suffix}")
                        for s in sec_syms if symbol_indicators[s].get(f"return_{n_suffix}") is not None]
            avg_r = sum(sec_rets) / len(sec_rets) if sec_rets else None
            for sym in sec_syms:
                symbol_indicators[sym][f"peer_return_{n_suffix}"] = round(avg_r, 4) if avg_r is not None else None
        for sym in sec_syms:
            symbol_indicators[sym]["peer_momentum_score"] = symbol_indicators[sym].get("peer_percentile")

    # ── Market Breadth (universe-wide) ──────────────────────────────────
    n_total = len(symbols) or 1
    ab_sma20 = sum(1 for s in symbols if symbol_indicators[s].get("price_vs_sma20") and symbol_indicators[s]["price_vs_sma20"] > 0)
    ab_sma50 = sum(1 for s in symbols if symbol_indicators[s].get("price_vs_sma50") and symbol_indicators[s]["price_vs_sma50"] > 0)
    ab_sma200 = sum(1 for s in symbols if symbol_indicators[s].get("price_vs_sma200") and symbol_indicators[s]["price_vs_sma200"] > 0)
    adv = sum(1 for s in symbols if (symbol_indicators[s].get("return_1d") or 0) > 0)
    decl = n_total - adv
    mkt_new_highs = sum(1 for s in symbols if symbol_indicators[s].get("breakout_52w"))
    mkt_new_lows = sum(1 for s in symbols if symbol_indicators[s].get("drawdown_from_52w_high") and symbol_indicators[s]["drawdown_from_52w_high"] < -20)

    breadth_data = {
        "advance_decline_ratio": round(adv / decl, 2) if decl > 0 else adv,
        "advance_decline_line": adv - decl,
        "market_breadth_score": round((ab_sma50 / n_total - 0.5) * 200, 1),
        "stocks_above_sma20_pct": round(ab_sma20 / n_total * 100, 1),
        "stocks_above_sma50_pct": round(ab_sma50 / n_total * 100, 1),
        "stocks_above_sma200_pct": round(ab_sma200 / n_total * 100, 1),
        "new_highs": mkt_new_highs,
        "new_lows": mkt_new_lows,
        "new_high_new_low_ratio": round(mkt_new_highs / mkt_new_lows, 2) if mkt_new_lows > 0 else mkt_new_highs,
        "pct_52w_high": round(mkt_new_highs / n_total * 100, 1),
        "pct_52w_low": round(mkt_new_lows / n_total * 100, 1),
        "market_momentum_breadth": round(ab_sma20 / n_total * 100, 1),
    }
    for sym in symbols:
        symbol_indicators[sym].update(breadth_data)

    # ── Beta & Correlation (vs index) ───────────────────────────────────
    if index_candles and len(index_candles) >= 30:
        idx_rets = _daily_returns(_closes(index_candles))
        for sym in symbols:
            sym_closes = None  # We don't have per-symbol candles here
            # These need per-symbol candle data - will be None unless
            # the caller passes enriched data
            for k in ("beta_20d", "beta_60d", "beta_120d", "beta_252d",
                       "rolling_beta", "upside_beta", "downside_beta",
                       "corr_nifty_20d", "corr_nifty_60d",
                       "corr_sector_20d", "corr_sector_60d", "corr_peer_group"):
                if k not in symbol_indicators[sym]:
                    symbol_indicators[sym][k] = None

    return symbol_indicators


def compute_beta_correlation(
    stock_candles: list[dict],
    index_candles: list[dict],
    sector_candles: list[dict] | None = None,
) -> dict:
    """Compute beta and correlation metrics for a single stock vs index."""
    out: dict = {}
    if not stock_candles or not index_candles:
        return out

    s_rets = _daily_returns(_closes(stock_candles))
    i_rets = _daily_returns(_closes(index_candles))
    min_len = min(len(s_rets), len(i_rets))
    if min_len < 20:
        return out

    s_rets = s_rets[-min_len:]
    i_rets = i_rets[-min_len:]

    def _beta(sr, ir, n):
        if len(sr) < n or len(ir) < n:
            return None
        sx, ix = sr[-n:], ir[-n:]
        mx, mi = sum(sx) / n, sum(ix) / n
        cov = sum((sx[j] - mx) * (ix[j] - mi) for j in range(n)) / n
        var_i = sum((ix[j] - mi) ** 2 for j in range(n)) / n
        return cov / var_i if var_i != 0 else 0

    def _corr(sr, ir, n):
        if len(sr) < n or len(ir) < n:
            return None
        sx, ix = sr[-n:], ir[-n:]
        mx, mi = sum(sx) / n, sum(ix) / n
        cov = sum((sx[j] - mx) * (ix[j] - mi) for j in range(n))
        vx = sum((sx[j] - mx) ** 2 for j in range(n))
        vi = sum((ix[j] - mi) ** 2 for j in range(n))
        d = math.sqrt(vx * vi)
        return cov / d if d != 0 else 0

    for n in (20, 60, 120, 252):
        out[f"beta_{n}d"] = round(_beta(s_rets, i_rets, n), 4) if _beta(s_rets, i_rets, n) is not None else None

    out["rolling_beta"] = out.get("beta_60d")

    # Upside/downside beta
    if min_len >= 60:
        up_sr = [s_rets[i] for i in range(len(s_rets) - 60, len(s_rets)) if i_rets[i] > 0]
        up_ir = [i_rets[i] for i in range(len(i_rets) - 60, len(i_rets)) if i_rets[i] > 0]
        dn_sr = [s_rets[i] for i in range(len(s_rets) - 60, len(s_rets)) if i_rets[i] < 0]
        dn_ir = [i_rets[i] for i in range(len(i_rets) - 60, len(i_rets)) if i_rets[i] < 0]
        out["upside_beta"] = _beta(up_sr, up_ir, min(len(up_sr), len(up_ir)))
        out["downside_beta"] = _beta(dn_sr, dn_ir, min(len(dn_sr), len(dn_ir)))
    else:
        out["upside_beta"] = out["downside_beta"] = None

    for n in (20, 60):
        out[f"corr_nifty_{n}d"] = round(_corr(s_rets, i_rets, n), 4) if _corr(s_rets, i_rets, n) is not None else None

    # Sector correlation
    if sector_candles and len(sector_candles) >= 20:
        sec_rets = _daily_returns(_closes(sector_candles))
        sec_min = min(len(s_rets), len(sec_rets))
        if sec_min >= 20:
            for n in (20, 60):
                out[f"corr_sector_{n}d"] = round(_corr(s_rets[-sec_min:], sec_rets[-sec_min:], min(n, sec_min)), 4)

    return out
