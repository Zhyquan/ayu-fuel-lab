import { validTimestamp } from './validation.js';
import { trendConfig, TREND_RULE_VERSION } from './trend-config.js';

import { checkTrendFreshness, normalizeObservations } from './trend-freshness.js';

const DAY = 86400000;
const labels = { UP: '偏上涨', SIDEWAYS: '震荡', DOWN: '偏下跌' };
const fail = reason => { throw new Error(reason); };
export const percentChange = (current, previous) => (current / previous - 1) * 100;
export const formatChange = value => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}%`;
export const unavailableTrend = (reason, now = new Date()) => ({ status: 'UNAVAILABLE', generatedAt: new Date(now).toISOString(), reason });

export function directionFor(metrics) {
  const both = predicate => ['Brent', 'WTI'].every(name => predicate(metrics[name].changes));
  if (both(c => c.day7.pct >= trendConfig.upThresholdPct && c.day3.pct > -trendConfig.reversalThresholdPct)) return 'UP';
  if (both(c => c.day7.pct <= trendConfig.downThresholdPct && c.day3.pct < trendConfig.reversalThresholdPct)) return 'DOWN';
  return 'SIDEWAYS';
}

export function buildTrend(observations, { now = new Date(), generatedAt = new Date(now).toISOString() } = {}) {
  if (!validTimestamp(generatedAt) || Date.parse(generatedAt) > new Date(now).getTime() + 300000) fail('INVALID_FETCH_TIME');
  if (new Date(now).getTime() - Date.parse(generatedAt) > trendConfig.maxCacheAgeHours * 3600000) fail('STALE_TREND_CACHE');
  const freshness = checkTrendFreshness(observations, { now });
  if (freshness.status !== 'LIVE') fail(freshness.reason);
  observations = normalizeObservations(observations);
  for (const rows of Object.values(observations)) {
    if (rows.at(-1).date > new Date(generatedAt).toISOString().slice(0,10)) fail('OBSERVATION_AFTER_FETCH');
  }
  const wtiDates = new Set(observations.WTI.map(row => row.date));
  const asOf = observations.Brent.filter(row => wtiDates.has(row.date)).at(-1)?.date;
  const metrics = {};
  for (const name of ['Brent', 'WTI']) {
    const rows = observations[name].filter(row => row.date <= asOf);
    const latest = rows.at(-1), changes = {};
    for (const days of [1, 3, 7]) {
      const target = new Date(Date.parse(asOf) - days * DAY).toISOString().slice(0, 10);
      const base = rows.filter(row => row.date <= target).at(-1);
      if (!base || (Date.parse(target) - Date.parse(base.date)) / DAY > trendConfig.maxAnchorGapDays) fail('MISSING_WINDOW_ANCHOR');
      changes[`day${days}`] = { fromDate: base.date, toDate: asOf, fromPrice: base.price, toPrice: latest.price, pct: percentChange(latest.price, base.price) };
      if (Math.abs(changes[`day${days}`].pct) > trendConfig.maxAbsChangePct) fail('EXTREME_MARKET_CHANGE');
    }
    metrics[name] = { observedAt: asOf, price: latest.price, unit: 'USD/barrel', changes };
  }
  const direction = directionFor(metrics);
  return {
    status: 'LIVE', ruleVersion: TREND_RULE_VERSION, source: 'FRED/EIA',
    generatedAt, dataUpdatedAt: asOf, direction, label: labels[direction],
    basedOn: ['Brent', 'WTI'].map(name => `${name} 近7日 ${formatChange(metrics[name].changes.day7.pct)}`),
    method: 'MOMENTUM_BASELINE_V1', freshness,
    marketData: Object.fromEntries(['Brent','WTI'].map(name => [name.toLowerCase(), {
      latestDate: metrics[name].observedAt, latestClose: metrics[name].price,
      change3dPct: metrics[name].changes.day3.pct, change7dPct: metrics[name].changes.day7.pct,
    }])),
    metrics, observations,
  };
}

// Recompute from observations; never trust cached direction, labels or percentages.
export function validateTrendCache(cache, { now = new Date(), startedAt } = {}) {
  try {
    if (!cache || cache.status !== 'LIVE') fail(cache?.reason ?? 'TREND_UNAVAILABLE');
    const expectedKeys = ['status','ruleVersion','source','generatedAt','dataUpdatedAt','direction','label','basedOn','metrics','observations','method','marketData','freshness'];
    if (Object.keys(cache).some(key => !expectedKeys.includes(key)) || cache.source !== 'FRED/EIA' || cache.ruleVersion !== TREND_RULE_VERSION || cache.method !== 'MOMENTUM_BASELINE_V1') fail('INVALID_TREND_SCHEMA');
    if (startedAt !== undefined && (!validTimestamp(startedAt) || Date.parse(cache.generatedAt) < Date.parse(startedAt))) fail('TREND_NOT_FROM_CURRENT_RUN');
    const computed = buildTrend(cache.observations, { now, generatedAt: cache.generatedAt });
    for (const key of ['direction','label','basedOn','metrics','dataUpdatedAt','marketData']) if (JSON.stringify(cache[key]) !== JSON.stringify(computed[key])) fail('TREND_CALCULATION_MISMATCH');
    return { gate: 'PASS', trend: computed };
  } catch (error) {
    return { gate: 'FAIL', trend: unavailableTrend(error.message, now) };
  }
}
