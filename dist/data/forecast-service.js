import { validateForecastCache, unavailableForecast } from './forecast-contract.js';
import { activeForecastSource, FORECAST_SOURCE } from './forecast-config.js';
let pending, fetchedAt=0;
export async function getForecast() {
  if (activeForecastSource !== FORECAST_SOURCE) return unavailableForecast('SOURCE_NOT_APPROVED');
  if (!pending || Date.now()-fetchedAt>=60000) pending=(async()=>{
    fetchedAt=Date.now();
    const response=await fetch(new URL('./forecast-cache.json',import.meta.url),{cache:'no-store',signal:AbortSignal.timeout(8000)});
    if (!response.ok) throw new Error('FORECAST_REQUEST_FAILED');
    return response.json();
  })();
  try {return validateForecastCache(await pending).forecast;}
  catch {pending=null;return unavailableForecast('FORECAST_REQUEST_FAILED');}
}
