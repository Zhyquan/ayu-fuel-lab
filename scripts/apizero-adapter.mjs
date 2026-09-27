// Narrowed from AYU_FUEL_DATA_SPIKE_001: only validated current price and date.
import { provinces } from '../dist/data/provinces.js';
import { recordError } from '../dist/data/validation.js';
export const ENDPOINT = 'https://v1.apizero.cn/api/oil-price';
const normalizeProvince = value => typeof value === 'string' ? value.replace(/(维吾尔自治区|壮族自治区|回族自治区|自治区|省|市)$/, '') : '';

export function adaptAPIZero(body, province, now = new Date()) {
  const fail = code => { throw Object.assign(new Error(code), { code }); };
  if (!provinces.some(item => item.name === province)) fail('UNSUPPORTED_PROVINCE');
  if (body?.code !== 0) fail([4029,4030].includes(body?.code) ? 'RATE_LIMITED' : 'BUSINESS_ERROR');
  if (normalizeProvince(body.data?.province) !== province) fail('PROVINCE_MISMATCH');
  const diesel = Array.isArray(body.data.prices) ? body.data.prices.filter(item => item?.type === 'diesel_0') : [];
  if (diesel.length !== 1) fail('DIESEL_0_MISSING_OR_DUPLICATE');
  const record = { province, diesel0Price: diesel[0].price, unit: diesel[0].unit, updatedAt: body.data.update_date, sourceStatus: 'LIVE' };
  const error = recordError(record, province, now);
  if (error) fail(error);
  return record;
}

export async function requestProvince(province, { fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const requestedAt = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let httpStatus = null, rawBody = '', headers = {}, body = null;
  try {
    const response = await fetchImpl(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ province }), signal: controller.signal });
    httpStatus = response.status;
    headers = Object.fromEntries(response.headers.entries());
    rawBody = await response.text();
    try { body = JSON.parse(rawBody); } catch { /* Preserve the exact body in evidence. */ }
    if (httpStatus !== 200) throw Object.assign(new Error(`HTTP ${httpStatus}`), { code: httpStatus === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR' });
    if (!body) throw Object.assign(new Error('Invalid JSON'), { code: 'INVALID_JSON' });
    return { record: adaptAPIZero(body, province, requestedAt), evidence: { province, requestedAt, completedAt: new Date().toISOString(), httpStatus, businessCode: body.code, headers, rawBody } };
  } catch (error) {
    const failureReason = controller.signal.aborted ? 'TIMEOUT' : error.code ?? 'NETWORK_ERROR';
    return { record: { province, diesel0Price: null, unit: null, updatedAt: null, sourceStatus: 'UNAVAILABLE', failureReason }, evidence: { province, requestedAt, completedAt: new Date().toISOString(), httpStatus, businessCode: body?.code ?? null, headers, rawBody, failureReason, detail: error.message } };
  } finally { clearTimeout(timer); }
}
