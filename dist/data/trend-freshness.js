import { validDate } from './validation.js';
import { trendConfig } from './trend-config.js';

const DAY = 86400000;
// EIA spot observations: common US/England working days, not a futures calendar.
// OPM + GOV.UK 2025/2026 holidays, checked against FRED missing observations.
// Review annually; an unknown year fails closed instead of guessing holidays.
const closedDays = new Set([
  '2025-01-01','2025-01-09','2025-01-20','2025-02-17','2025-04-18','2025-04-21',
  '2025-05-05','2025-05-26','2025-06-19','2025-07-04','2025-08-25','2025-09-01',
  '2025-10-13','2025-11-11','2025-11-27','2025-12-25','2025-12-26',
  '2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-04-06','2026-05-04',
  '2026-05-25','2026-06-19','2026-07-03','2026-08-31','2026-09-07',
  '2026-10-12','2026-11-11','2026-11-26','2026-12-25','2026-12-28',
]);
const dayBefore = date => new Date(Date.parse(date) - DAY).toISOString().slice(0,10);
const isWorkingDay = date => ![0,6].includes(new Date(date).getUTCDay()) && !closedDays.has(date);

function newYorkClock(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(now)).map(part => [part.type,part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

export function getExpectedLatestTradingDate(now = new Date()) {
  const clock = newYorkClock(now);
  if (!['2025','2026'].includes(clock.date.slice(0,4))) throw new Error('CALENDAR_REVIEW_REQUIRED');
  // 18:00 New York is a conservative completion boundary, not a publication SLA.
  let date = clock.hour >= 18 ? clock.date : dayBefore(clock.date);
  while (!isWorkingDay(date)) date = dayBefore(date);
  if (!['2025','2026'].includes(date.slice(0,4))) throw new Error('CALENDAR_REVIEW_REQUIRED');
  return date;
}

export function normalizeObservations(observations) {
  if (!observations || Object.keys(observations).sort().join(',') !== 'Brent,WTI') throw new Error('INVALID_SERIES');
  return Object.fromEntries(['Brent','WTI'].map(name => {
    if (!Array.isArray(observations[name]) || observations[name].length < 8) throw new Error('INSUFFICIENT_OBSERVATIONS');
    const seen = new Set();
    const rows = observations[name].map(row => {
      if (!row || Object.keys(row).sort().join(',') !== 'date,price' || !validDate(row.date)) throw new Error('INVALID_OBSERVATION_DATE');
      if (seen.has(row.date)) throw new Error('DUPLICATE_OBSERVATION_DATE');
      if (typeof row.price !== 'number' || !Number.isFinite(row.price) || row.price <= 0 || row.price > 1000) throw new Error('INVALID_MARKET_PRICE');
      seen.add(row.date);
      return { date: row.date, price: row.price };
    }).sort((a,b) => a.date.localeCompare(b.date));
    return [name,rows];
  }));
}

export function checkTrendFreshness(observations, { now = new Date() } = {}) {
  const result = { status: 'UNAVAILABLE', brentLatestDate: null, wtiLatestDate: null,
    expectedLatestTradingDate: null, checkedAt: new Date(now).toISOString(), reason: null };
  try {
    result.expectedLatestTradingDate = getExpectedLatestTradingDate(now);
    const sorted = normalizeObservations(observations);
    result.brentLatestDate = sorted.Brent.at(-1).date;
    result.wtiLatestDate = sorted.WTI.at(-1).date;
    const clock = newYorkClock(now);
    const completedDate = clock.hour >= 18 ? clock.date : dayBefore(clock.date);
    for (const name of ['Brent','WTI']) {
      const date = sorted[name].at(-1).date;
      if (date > clock.date) throw new Error('FUTURE_OBSERVATION');
      if (date > completedDate) throw new Error('INCOMPLETE_MARKET_DAY');
      if ([0,6].includes(new Date(date).getUTCDay())) throw new Error('NON_TRADING_OBSERVATION');
    }
    if (Math.abs(Date.parse(result.brentLatestDate) - Date.parse(result.wtiLatestDate)) > 4 * DAY) throw new Error('SERIES_DATE_GAP');
    const wtiDates = new Set(sorted.WTI.map(row => row.date));
    const asOf = sorted.Brent.filter(row => wtiDates.has(row.date)).at(-1)?.date;
    if (!asOf || [result.brentLatestDate,result.wtiLatestDate,asOf].some(date => date < result.expectedLatestTradingDate)) {
      return { ...result, status: 'STALE', reason: 'STALE_MARKET_DATA' };
    }
    for (const name of ['Brent','WTI']) for (const days of [1,3,7]) {
      const target = new Date(Date.parse(asOf) - days * DAY).toISOString().slice(0,10);
      const base = sorted[name].filter(row => row.date <= target).at(-1);
      if (!base || Date.parse(target) - Date.parse(base.date) > trendConfig.maxAnchorGapDays * DAY) throw new Error('MISSING_WINDOW_ANCHOR');
    }
    return { ...result, status: 'LIVE', reason: 'LATEST_COMPLETED_COMMON_SPOT_DAY' };
  } catch (error) {
    return { ...result, reason: error.message };
  }
}
