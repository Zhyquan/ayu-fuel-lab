import { validDate, chinaDate } from '../dist/data/validation.js';
import { FORECAST_SOURCE } from '../dist/data/forecast-config.js';
import { unavailableForecast, mapForecastDirection, freshTimestamp, changeIssues, marketIssues, forecastReasons } from '../dist/data/forecast-contract.js';

export function adaptAPIZeroForecast(raw, { httpStatus, rawFetchedAt, crosscheck, now = new Date() } = {}) {
  const issues = [], warnings = [];
  if (httpStatus !== 200) issues.push('FORECAST_HTTP_FAILED');
  if (raw?.code !== 0) issues.push('FORECAST_BUSINESS_FAILED');
  const data=raw?.data, prediction=data?.prediction, crude=data?.crude_oil;
  if (!data || !prediction || !crude || typeof prediction !== 'object' || typeof crude !== 'object') issues.push('FORECAST_SCHEMA_INVALID');
  const direction=mapForecastDirection(prediction?.direction);
  if (!direction) issues.push('UNKNOWN_DIRECTION');
  issues.push(...changeIssues(direction,prediction?.estimated_change_per_ton,prediction?.estimated_change_per_liter));
  if (!freshTimestamp(rawFetchedAt,now)) issues.push('STALE_OR_FUTURE_RAW_FETCH');
  if (!freshTimestamp(crosscheck?.checkedAt,now)) issues.push('STALE_OR_MISSING_CROSSCHECK');
  // Dates must come from separately reviewed source evidence, never HTTP Date.
  // The current provider response has no market date; no automatic inference here.
  if (crosscheck?.sourceBasis !== 'FUTURES' || crosscheck?.referenceBasis !== 'FUTURES') issues.push('MARKET_BASIS_UNVERIFIED');
  if (!/^https:\/\//.test(crosscheck?.sourceDateEvidenceUrl ?? '')) issues.push('SOURCE_DATE_EVIDENCE_MISSING');
  const market=Object.fromEntries(['brent','wti'].map(name=>[name,{
    value:crude?.[name] ?? null,
    changePct:null, // Provider *_change has no documented percentage unit.
    observedAt:crosscheck?.sourceDates?.[name] ?? null,
    referenceValue:crosscheck?.reference?.[name]?.value ?? null,
    referenceDate:crosscheck?.reference?.[name]?.date ?? null,
  }]));
  issues.push(...marketIssues(market,now));
  const next=data?.next_adjust_date;
  warnings.push(!validDate(next) ? 'INVALID_ADJUSTMENT_DATE' : next <= chinaDate(now) ? 'EXPIRED_ADJUSTMENT_DATE_DROPPED' : 'ADJUSTMENT_DATE_NOT_OFFICIALLY_CONFIRMED');
  if (typeof prediction?.analysis === 'string') warnings.push('RAW_ANALYSIS_ARCHIVED_ONLY');
  const normalized=issues.length ? unavailableForecast(issues[0],now) : {
    status:'LIVE',source:FORECAST_SOURCE,generatedAt:rawFetchedAt,direction,
    estimatedChangePerTon:prediction.estimated_change_per_ton,
    estimatedChangePerLiter:prediction.estimated_change_per_liter,
    sourceConfidenceRaw:typeof prediction.confidence==='string' ? prediction.confidence : null,
    market,marketCheckedAt:crosscheck.checkedAt,reasons:forecastReasons(direction),nextAdjustmentDate:null,
  };
  return {gate:issues.length ? 'FAIL' : 'PASS',issues:[...new Set(issues)],warnings,normalized};
}
