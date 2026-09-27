// Read-only candidate audit; never selects or merges a replacement source.
import { mkdir, writeFile } from 'node:fs/promises';
import { parseMarketCsv } from './market-source.mjs';
import { marketSourceUrl } from '../dist/data/trend-config.js';
const sources = [
  ['FRED', marketSourceUrl],
  ['DataHub Brent', 'https://datahub.io/core/oil-prices/_r/-/data/brent-daily.csv'],
  ['DataHub WTI', 'https://datahub.io/core/oil-prices/_r/-/data/wti-daily.csv'],
  ['EIA Daily', 'https://www.eia.gov/todayinenergy/prices.php'],
];
const results = [];
for (const [source,url] of sources) {
  try {
    const response = await fetch(url,{signal:AbortSignal.timeout(20000)});
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const text = await response.text();
    let latest;
    if (source === 'FRED') {
      const rows = parseMarketCsv(text);
      latest = { Brent:rows.Brent.at(-1), WTI:rows.WTI.at(-1) };
    } else if (source.startsWith('DataHub')) {
      const lines=text.trim().split(/\r?\n/);
      if (lines[0] !== 'Date,Price') throw new Error('INVALID_HEADER');
      const [date,price] = lines.at(-1).split(',');
      latest = {date,price:Number(price)};
    } else {
      // Evidence only: retain the exact publisher's close date heading.
      const plain=text.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
      latest={heading:plain.match(/Wholesale Spot Petroleum Prices,\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s+Close/)?.[0] ?? null};
      if (!latest.heading) throw new Error('EIA_HEADING_NOT_FOUND');
    }
    results.push({source,url,httpStatus:response.status,latest,checkedAt:new Date().toISOString()});
  } catch(error) { results.push({source,url,status:'FAILED',reason:error.message}); }
}
await mkdir(new URL('../evidence/',import.meta.url),{recursive:true});
await writeFile(new URL('../evidence/source-availability.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results));
