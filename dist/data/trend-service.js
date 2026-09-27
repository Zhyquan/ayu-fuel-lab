import { validateTrendCache, unavailableTrend } from './trend-baseline.js';
let cachePromise, fetchedAt = 0;

export async function getMarketTrend() {
  // Retry once per minute so an unavailable cache can recover without a reload.
  if (!cachePromise || Date.now() - fetchedAt >= 60000) cachePromise = (async () => {
    fetchedAt = Date.now();
    const response = await fetch(new URL('./trend-cache.json', import.meta.url), { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('TREND_CACHE_REQUEST_FAILED');
    return response.json();
  })();
  try { return validateTrendCache(await cachePromise).trend; }
  catch { cachePromise = null; return unavailableTrend('TREND_CACHE_REQUEST_FAILED'); }
}
