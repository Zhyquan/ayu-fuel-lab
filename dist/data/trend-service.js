import { validateTrendCache, unavailableTrend } from './trend-baseline.js';
let cachePromise;

export async function getMarketTrend() {
  if (!cachePromise) cachePromise = (async () => {
    const response = await fetch(new URL('./trend-cache.json', import.meta.url), { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('TREND_CACHE_REQUEST_FAILED');
    return response.json();
  })();
  try { return validateTrendCache(await cachePromise).trend; }
  catch { cachePromise = null; return unavailableTrend('TREND_CACHE_REQUEST_FAILED'); }
}
