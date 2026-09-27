import { validDate, validTimestamp } from './validation.js';
import { getExpectedLatestTradingDate } from './trend-freshness.js';
import { activeForecastSource, FORECAST_SOURCE, forecastLimits } from './forecast-config.js';

export const unavailableForecast = (reason, now = new Date()) => ({ status: 'UNAVAILABLE', source: FORECAST_SOURCE, generatedAt: new Date(now).toISOString(), reason, nextAdjustmentDate: null });
const directions = { rise:'UP', up:'UP', fall:'DOWN', down:'DOWN', hold:'SIDEWAYS', flat:'SIDEWAYS', '搁浅':'SIDEWAYS' };
export const mapForecastDirection = value => {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return Object.hasOwn(directions,key) ? directions[key] : null;
};
export const forecastReasons = direction => [{ UP:'第三方调价信号偏向上调', DOWN:'第三方调价信号偏向下调', SIDEWAYS:'第三方调价信号偏向暂稳' }[direction]].filter(Boolean);
// Python capture manifests may use microseconds; preserve originals, validate millisecond precision.
const validCaptureTimestamp = value => validTimestamp(typeof value === 'string' ? value.replace(/(\.\d{3})\d+(?=Z|[+-])/,'$1') : value);
export const freshTimestamp = (value, now) => validCaptureTimestamp(value) && Date.parse(value) <= new Date(now).getTime() && new Date(now).getTime() - Date.parse(value) <= forecastLimits.maxAgeHours * 3600000;
const finite = value => typeof value === 'number' && Number.isFinite(value);

export function changeIssues(direction, ton, liter) {
  const issues = [];
  if (!finite(ton) || Math.abs(ton) > forecastLimits.maxTon) issues.push('INVALID_CHANGE_PER_TON');
  if (!finite(liter) || Math.abs(liter) > forecastLimits.maxLiter) issues.push('INVALID_CHANGE_PER_LITER');
  if (finite(ton) && finite(liter)) {
    if (Math.sign(ton) !== Math.sign(liter)) issues.push('CHANGE_UNIT_SIGN_CONFLICT');
    if (direction === 'UP' && (ton <= 0 || liter <= 0) || direction === 'DOWN' && (ton >= 0 || liter >= 0)) issues.push('DIRECTION_CHANGE_CONFLICT');
    if (direction === 'SIDEWAYS' && (Math.abs(ton) >= 50 || Math.abs(liter) > 0.05)) issues.push('HOLD_MAGNITUDE_CONFLICT');
  }
  return issues;
}

export function marketIssues(market, now = new Date()) {
  const issues = [];
  let expected;
  try { expected = getExpectedLatestTradingDate(now); } catch { return ['MARKET_CALENDAR_UNVERIFIED']; }
  if (!market || Object.keys(market).sort().join(',') !== 'brent,wti') issues.push('INVALID_MARKET_SCHEMA');
  for (const name of ['brent','wti']) {
    const row = market?.[name];
    if (row && Object.keys(row).some(key=>!['value','changePct','observedAt','referenceValue','referenceDate'].includes(key))) issues.push('INVALID_MARKET_SCHEMA');
    if (!row || !finite(row.value) || row.value <= 0 || row.value > 1000) issues.push(`${name.toUpperCase()}_INVALID`);
    if (!validDate(row?.observedAt)) issues.push(`${name.toUpperCase()}_SOURCE_DATE_MISSING`);
    else if (row.observedAt !== expected) issues.push(`${name.toUpperCase()}_SOURCE_DATE_NOT_CURRENT`);
    if (!row || !finite(row.referenceValue) || row.referenceValue <= 0 || row.referenceValue > 1000 || row.referenceDate !== expected) issues.push(`${name.toUpperCase()}_REFERENCE_INVALID`);
    else if (finite(row.value) && Math.abs((row.value / row.referenceValue - 1) * 100) > forecastLimits.maxMarketDifferencePct) issues.push(`${name.toUpperCase()}_MARKET_CONFLICT`);
    if (row?.changePct !== null) issues.push('CHANGE_PCT_UNIT_UNVERIFIED');
  }
  return issues;
}

// Public projection excludes provider prose, confidence, request ids and raw JSON.
export function toPublicForecast(forecast) {
  if (forecast.status !== 'LIVE') return unavailableForecast(forecast.reason, forecast.generatedAt);
  const { status,source,generatedAt,direction,estimatedChangePerTon,estimatedChangePerLiter,market,marketCheckedAt,nextAdjustmentDate } = forecast;
  return { status,source,generatedAt,direction,estimatedChangePerTon,estimatedChangePerLiter,market,marketCheckedAt,reasons:forecastReasons(direction),nextAdjustmentDate };
}

export function validateForecastCache(cache, { now = new Date(), activeSource = activeForecastSource, startedAt } = {}) {
  const reject = reason => ({ gate:'FAIL', forecast:unavailableForecast(reason,now) });
  if (activeSource !== FORECAST_SOURCE) return reject('SOURCE_NOT_APPROVED');
  if (!cache || cache.status !== 'LIVE') return reject('FORECAST_UNAVAILABLE');
  const allowed = ['status','source','generatedAt','direction','estimatedChangePerTon','estimatedChangePerLiter','market','marketCheckedAt','reasons','nextAdjustmentDate'];
  if (Object.keys(cache).some(key=>!allowed.includes(key)) || cache.source !== FORECAST_SOURCE) return reject('INVALID_FORECAST_SCHEMA');
  if (!freshTimestamp(cache.generatedAt,now) || !freshTimestamp(cache.marketCheckedAt,now)) return reject('STALE_OR_FUTURE_FORECAST');
  if (startedAt !== undefined && (!validTimestamp(startedAt) || Date.parse(cache.generatedAt)<Date.parse(startedAt))) return reject('FORECAST_NOT_FROM_CURRENT_RUN');
  if (!['UP','DOWN','SIDEWAYS'].includes(cache.direction)) return reject('UNKNOWN_DIRECTION');
  const issues = [...changeIssues(cache.direction,cache.estimatedChangePerTon,cache.estimatedChangePerLiter),...marketIssues(cache.market,now)];
  if (issues.length) return reject(issues[0]);
  if (JSON.stringify(cache.reasons) !== JSON.stringify(forecastReasons(cache.direction))) return reject('UNTRUSTED_REASONS');
  // This spike does not publish unverified adjustment calendars.
  if (cache.nextAdjustmentDate !== null) return reject('UNVERIFIED_ADJUSTMENT_DATE');
  return { gate:'PASS', forecast:toPublicForecast(cache) };
}
