import { activeForecastSource } from './forecast-config.js';
import { INTELLIGENCE_SOURCE, validateIntelligenceCache, unavailableIntelligence } from './intelligence-contract.js';
let pending,fetchedAt=0;
export async function getForecast() {
  if (activeForecastSource!==INTELLIGENCE_SOURCE) return unavailableIntelligence('SOURCE_NOT_APPROVED');
  if (!pending || Date.now()-fetchedAt>=60000) pending=(async()=>{
    fetchedAt=Date.now();
    const response=await fetch(new URL('./forecast-cache.json',import.meta.url),{cache:'no-store',signal:AbortSignal.timeout(8000)});
    if (!response.ok) throw new Error('FORECAST_REQUEST_FAILED');
    return response.json();
  })();
  try {return validateIntelligenceCache(await pending);}
  catch {pending=null;return unavailableIntelligence('FORECAST_REQUEST_FAILED');}
}
