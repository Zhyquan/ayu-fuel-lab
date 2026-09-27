import { selectProvinceData } from './validation.js';
let cachePromise;

export async function getProvinceFuelData(province, { refresh = false } = {}) {
  if (refresh) cachePromise = null;
  if (!cachePromise) {
    cachePromise = (async () => {
      const response = await fetch(new URL('./normalized-live-cache.json', import.meta.url), { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`CACHE_HTTP_${response.status}`);
      return response.json();
    })();
  }
  try { return selectProvinceData(await cachePromise, province); }
  catch (error) {
    cachePromise = null;
    return { status: 'UNAVAILABLE', province, record: null, generatedAt: null, reason: error.name === 'TimeoutError' ? 'CACHE_TIMEOUT' : 'CACHE_REQUEST_FAILED' };
  }
}
