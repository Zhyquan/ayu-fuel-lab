import { validDate } from '../dist/data/validation.js';
import { marketSourceUrl } from '../dist/data/trend-config.js';

export function parseMarketCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.shift() !== 'observation_date,DCOILBRENTEU,DCOILWTICO') throw new Error('INVALID_CSV_HEADER');
  const observations = { Brent: [], WTI: [] };
  const seen = new Set();
  for (const line of lines) {
    const cells = line.split(','), date = cells[0];
    if (cells.length !== 3 || !validDate(date) || seen.has(date)) throw new Error('INVALID_CSV_ROW');
    seen.add(date);
    for (const [index, name] of ['Brent','WTI'].entries()) {
      const value = cells[index + 1];
      if (value === '' || value === '.') continue; // Missing observations are never zero-filled.
      if (!/^-?\d+(\.\d+)?$/.test(value) || !Number.isFinite(Number(value))) throw new Error('INVALID_CSV_PRICE');
      observations[name].push({ date, price: Number(value) });
    }
  }
  for (const rows of Object.values(observations)) rows.sort((a,b) => a.date.localeCompare(b.date));
  return observations;
}

export async function fetchMarketData({ fetchImpl = fetch, timeoutMs = 25000 } = {}) {
  const response = await fetchImpl(marketSourceUrl, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`MARKET_HTTP_${response.status}`);
  const rawCsv = await response.text();
  return { rawCsv, observations: parseMarketCsv(rawCsv) };
}
