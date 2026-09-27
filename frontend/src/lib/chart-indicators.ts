interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type Point = { time: string; value: number };

export function sma(data: OHLCV[], period: number): Point[] {
  const result: Point[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j].close;
    result.push({ time: data[i].date, value: parseFloat((sum / period).toFixed(2)) });
  }
  return result;
}

export function ema(data: OHLCV[], period: number): Point[] {
  if (data.length < period) return [];
  const result: Point[] = [];
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += data[i].close;
  prev /= period;
  result.push({ time: data[period - 1].date, value: parseFloat(prev.toFixed(2)) });
  for (let i = period; i < data.length; i++) {
    prev = data[i].close * k + prev * (1 - k);
    result.push({ time: data[i].date, value: parseFloat(prev.toFixed(2)) });
  }
  return result;
}

export function bollingerBands(data: OHLCV[], period = 20, mult = 2) {
  const upper: Point[] = [];
  const lower: Point[] = [];
  const mid: Point[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j].close;
    const avg = sum / period;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (data[j].close - avg) ** 2;
    const stdDev = Math.sqrt(variance / period);
    mid.push({ time: data[i].date, value: parseFloat(avg.toFixed(2)) });
    upper.push({ time: data[i].date, value: parseFloat((avg + mult * stdDev).toFixed(2)) });
    lower.push({ time: data[i].date, value: parseFloat((avg - mult * stdDev).toFixed(2)) });
  }
  return { upper, mid, lower };
}

export function vwap(data: OHLCV[]): Point[] {
  let cumVol = 0;
  let cumTP = 0;
  return data.map((d) => {
    const tp = (d.high + d.low + d.close) / 3;
    cumTP += tp * d.volume;
    cumVol += d.volume;
    return { time: d.date, value: cumVol ? parseFloat((cumTP / cumVol).toFixed(2)) : 0 };
  });
}

export function rsi(data: OHLCV[], period = 14): Point[] {
  if (data.length <= period) return [];
  const result: Point[] = [];
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = data[i].close - data[i - 1].close;
    if (d >= 0) gains += d;
    else losses -= d;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  const val = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  result.push({ time: data[period].date, value: parseFloat(val.toFixed(2)) });

  for (let i = period + 1; i < data.length; i++) {
    const d = data[i].close - data[i - 1].close;
    avgGain = (avgGain * (period - 1) + (d >= 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    const v = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    result.push({ time: data[i].date, value: parseFloat(v.toFixed(2)) });
  }
  return result;
}

export function atr(data: OHLCV[], period = 14): Point[] {
  if (data.length <= period) return [];
  const result: Point[] = [];
  const trueRanges: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const h = data[i].high, l = data[i].low, pc = data[i - 1].close;
    trueRanges.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let atrVal = 0;
  for (let i = 0; i < period; i++) atrVal += trueRanges[i];
  atrVal /= period;
  result.push({ time: data[period].date, value: parseFloat(atrVal.toFixed(2)) });
  for (let i = period; i < trueRanges.length; i++) {
    atrVal = (atrVal * (period - 1) + trueRanges[i]) / period;
    result.push({ time: data[i + 1].date, value: parseFloat(atrVal.toFixed(2)) });
  }
  return result;
}

export function supertrend(data: OHLCV[], period = 10, multiplier = 3): { up: Point[]; down: Point[] } {
  const up: Point[] = [];
  const down: Point[] = [];
  if (data.length < period + 2) return { up, down };
  const trueRanges: number[] = [];
  for (let i = 1; i < data.length; i++) {
    const h = data[i].high, l = data[i].low, pc = data[i - 1].close;
    trueRanges.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let stUp = 0, stDn = 0, dir = 1;
  for (let i = period - 1; i < trueRanges.length; i++) {
    let atrSum = 0;
    for (let j = i - period + 1; j <= i; j++) atrSum += trueRanges[j];
    const atrAvg = atrSum / period;
    const candle = data[i + 1];
    const hl2 = (candle.high + candle.low) / 2;
    const basicUp = hl2 - multiplier * atrAvg;
    const basicDn = hl2 + multiplier * atrAvg;
    stUp = data[i].close > stUp ? Math.max(basicUp, stUp) : basicUp;
    stDn = data[i].close < stDn ? Math.min(basicDn, stDn) : basicDn;
    if (dir === 1 && candle.close < stUp) dir = -1;
    else if (dir === -1 && candle.close > stDn) dir = 1;
    const val = parseFloat((dir === 1 ? stUp : stDn).toFixed(2));
    if (dir === 1) up.push({ time: candle.date, value: val });
    else down.push({ time: candle.date, value: val });
  }
  return { up, down };
}

export function stochastic(data: OHLCV[], kPeriod = 14, dPeriod = 3): { k: Point[]; d: Point[] } {
  const kLine: Point[] = [];
  const dLine: Point[] = [];
  if (data.length < kPeriod) return { k: kLine, d: dLine };
  const kVals: number[] = [];
  for (let i = kPeriod - 1; i < data.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (data[j].high > hh) hh = data[j].high;
      if (data[j].low < ll) ll = data[j].low;
    }
    const kVal = hh !== ll ? ((data[i].close - ll) / (hh - ll)) * 100 : 50;
    kVals.push(kVal);
    kLine.push({ time: data[i].date, value: parseFloat(kVal.toFixed(2)) });
  }
  for (let i = dPeriod - 1; i < kVals.length; i++) {
    let sum = 0;
    for (let j = i - dPeriod + 1; j <= i; j++) sum += kVals[j];
    dLine.push({ time: kLine[i].time, value: parseFloat((sum / dPeriod).toFixed(2)) });
  }
  return { k: kLine, d: dLine };
}

export function roc(data: OHLCV[], period = 12): Point[] {
  const result: Point[] = [];
  for (let i = period; i < data.length; i++) {
    if (data[i - period].close === 0) continue;
    const val = ((data[i].close / data[i - period].close) - 1) * 100;
    result.push({ time: data[i].date, value: parseFloat(val.toFixed(2)) });
  }
  return result;
}

export function obv(data: OHLCV[]): Point[] {
  if (data.length < 2) return [];
  const result: Point[] = [{ time: data[0].date, value: 0 }];
  let cumObv = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i].close > data[i - 1].close) cumObv += data[i].volume;
    else if (data[i].close < data[i - 1].close) cumObv -= data[i].volume;
    result.push({ time: data[i].date, value: cumObv });
  }
  return result;
}

export function macd(data: OHLCV[], fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(data, fast);
  const emaSlow = ema(data, slow);
  if (emaSlow.length === 0) return { macdLine: [], signalLine: [], histogram: [] };

  const slowStart = slow - fast;
  const macdLine: Point[] = [];
  for (let i = 0; i < emaSlow.length; i++) {
    const fastVal = emaFast[i + slowStart];
    if (!fastVal) continue;
    macdLine.push({
      time: emaSlow[i].time,
      value: parseFloat((fastVal.value - emaSlow[i].value).toFixed(4)),
    });
  }

  if (macdLine.length < signal) return { macdLine, signalLine: [], histogram: [] };

  const k = 2 / (signal + 1);
  let prev = 0;
  for (let i = 0; i < signal; i++) prev += macdLine[i].value;
  prev /= signal;

  const signalLine: Point[] = [{ time: macdLine[signal - 1].time, value: parseFloat(prev.toFixed(4)) }];
  const histogram: Point[] = [{
    time: macdLine[signal - 1].time,
    value: parseFloat((macdLine[signal - 1].value - prev).toFixed(4)),
  }];

  for (let i = signal; i < macdLine.length; i++) {
    prev = macdLine[i].value * k + prev * (1 - k);
    signalLine.push({ time: macdLine[i].time, value: parseFloat(prev.toFixed(4)) });
    histogram.push({
      time: macdLine[i].time,
      value: parseFloat((macdLine[i].value - prev).toFixed(4)),
    });
  }

  return { macdLine, signalLine, histogram };
}
