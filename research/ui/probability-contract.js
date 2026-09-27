import { validTimestamp } from '../../dist/data/validation.js';

const keys = ['down', 'flat', 'up'];
export function validProbabilities(p) {
  return p && Object.keys(p).sort().join(',') === 'down,flat,up'
    && keys.every(k => typeof p[k] === 'number' && Number.isFinite(p[k]) && p[k] >= 0 && p[k] <= 1)
    && Math.abs(keys.reduce((s, k) => s + p[k], 0) - 1) <= 1e-12;
}

export function roundProbabilitiesTo100(p) {
  if (!validProbabilities(p)) throw new Error('INVALID_PROBABILITIES');
  const rows = keys.map((key, order) => ({ key, order, integer: Math.floor(p[key] * 100), remainder: p[key] * 100 % 1 }));
  const missing = 100 - rows.reduce((sum, r) => sum + r.integer, 0);
  [...rows].sort((a, b) => b.remainder - a.remainder || a.order - b.order).slice(0, missing).forEach(r => r.integer++);
  return Object.fromEntries(rows.map(r => [r.key, r.integer]));
}

export function selectProbability(contract, gate, now = new Date()) {
  const unavailable = reason => ({ status: 'UNAVAILABLE', probabilities: null, reason });
  if (gate !== 'PASS') return unavailable('MODEL_GATE_FAILED');
  if (contract?.status !== 'LIVE') return unavailable('NO_APPROVED_MODEL');
  if (contract.source !== 'AYU_PROBABILITY_MODEL_V1' || contract.horizonDays !== 7 || contract.calibrated !== true || !contract.modelVersion || !validProbabilities(contract.probabilities)) return unavailable('INVALID_CONTRACT');
  if (!validTimestamp(contract.generatedAt) || !validTimestamp(contract.validUntil)) return unavailable('INVALID_TIMESTAMPS');
  const generated = Date.parse(contract.generatedAt), expires = Date.parse(contract.validUntil), time = new Date(now).getTime();
  if (!Number.isFinite(time) || generated > time || expires <= time || expires <= generated || expires - generated > 86400000) return unavailable('EXPIRED_OR_FUTURE');
  const maximum = Math.max(...keys.map(k => contract.probabilities[k]));
  if (!keys.includes(contract.primaryDirection?.toLowerCase()) || contract.probabilities[contract.primaryDirection.toLowerCase()] !== maximum) return unavailable('DIRECTION_MISMATCH');
  return { ...contract, percentages: roundProbabilitiesTo100(contract.probabilities) };
}
