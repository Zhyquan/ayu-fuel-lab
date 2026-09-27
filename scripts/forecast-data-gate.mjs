import { readFile, writeFile, rename } from 'node:fs/promises';
import { validateForecastCache, unavailableForecast } from '../dist/data/forecast-contract.js';
const path=new URL('../dist/data/forecast-cache.json',import.meta.url);
let result;
try {result=validateForecastCache(JSON.parse(await readFile(path,'utf8')),{startedAt:process.env.RUN_STARTED_AT});}
catch {result={gate:'FAIL',forecast:unavailableForecast('FORECAST_READ_FAILED')};}
const temporary=new URL('../dist/data/forecast-cache.json.tmp',import.meta.url);
await writeFile(temporary,JSON.stringify(result.forecast,null,2)+'\n');
await rename(temporary,path);
console.log(JSON.stringify({APIZERO_FORECAST_GATE:result.gate,...result.forecast}));
// Gate failure clears the optional forecast, without failing the price build.
