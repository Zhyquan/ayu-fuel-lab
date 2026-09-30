import { canonicalJson, validateForecastCache, unavailableForecast } from './intelligence-v2-contract.js';
let pending, lastKnown, fetchedAt=0;

export async function readForecast({fetchImpl=fetch,now=new Date()}={}) {
  try {
    const response=await fetchImpl(new URL('./forecast-cache.json',import.meta.url),{cache:'no-store',signal:AbortSignal.timeout(8000)});
    if (!response.ok) throw new Error('FORECAST_REQUEST_FAILED');
    const cache=await response.json();
    const forecast=validateForecastCache(cache,{now});
    if (!['LIVE','STALE'].includes(forecast.status)) return forecast;
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalJson(forecast.evidencePack)));
    const hash=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
    return hash===forecast.evidenceHash?forecast:unavailableForecast('EVIDENCE_HASH_MISMATCH');
  } catch { return unavailableForecast('FORECAST_REQUEST_FAILED'); }
}
export async function getForecast() {
  if (!pending || Date.now()-fetchedAt>=60000) {
    fetchedAt=Date.now();
    pending=readForecast().then(forecast=>{
      if (['LIVE','STALE'].includes(forecast.status)) lastKnown=forecast;
      return lastKnown??forecast;
    });
  }
  return validateForecastCache(await pending);
}
