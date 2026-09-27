const DAY = 86400000;
export const MAX_CACHE_AGE_MS = DAY;
export const CACHE_ERROR_AGE_MS = 3 * DAY;
export const chinaDate = now => new Date(new Date(now).getTime() + 8 * 3600000).toISOString().slice(0, 10);
export const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export const validTimestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(value) && validDate(value.slice(0,10)) && Number.isFinite(Date.parse(value));

export function recordError(record, province, now = new Date()) {
  if (!record || record.province !== province) return 'PROVINCE_MISMATCH';
  if (typeof record.diesel0Price !== 'number' || !Number.isFinite(record.diesel0Price) || record.diesel0Price < 0.1 || record.diesel0Price > 100) return 'INVALID_PRICE';
  if (record.unit !== '元/升') return 'INVALID_UNIT';
  if (!validDate(record.updatedAt)) return 'INVALID_SOURCE_DATE';
  if (record.updatedAt > chinaDate(now)) return 'FUTURE_SOURCE_DATE';
  return null;
}

// Re-evaluate at read time: a previously LIVE cache must not stay LIVE forever.
export function selectProvinceData(cache, province, now = new Date()) {
  const unavailable = reason => ({ status: 'UNAVAILABLE', province, record: null, generatedAt: null, reason });
  if (!cache || cache.source !== 'APIZero' || !validTimestamp(cache.generatedAt)) return unavailable('INVALID_CACHE');
  const cacheAge = new Date(now).getTime() - Date.parse(cache.generatedAt);
  if (cacheAge < -300000) return unavailable('FUTURE_CACHE_TIME');
  const record = cache.provinces?.[province];
  if (!record || !['LIVE', 'STALE'].includes(record.sourceStatus)) return unavailable(record?.failureReason ?? 'MISSING_PROVINCE');
  const error = recordError(record, province, now);
  if (error) return unavailable(error);
  if (record.updatedAt > chinaDate(cache.generatedAt)) return unavailable('DATE_AFTER_FETCH');
  const stale = cacheAge > MAX_CACHE_AGE_MS;
  const delayLevel = cacheAge > CACHE_ERROR_AGE_MS ? 'ERROR' : stale ? 'WARNING' : null;
  return { status: stale ? 'STALE' : 'LIVE', province, record, generatedAt: cache.generatedAt, delayLevel, reason: stale ? 'CACHE_AGE_EXCEEDED' : null };
}
