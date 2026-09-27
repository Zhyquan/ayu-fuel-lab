// Transparent heuristic, not fitted to domestic fuel outcomes or calibrated probabilities.
// One-year observed absolute 7d lower quartiles: Brent 2.11%, WTI 1.85%.
export const trendConfig = Object.freeze({
  upThresholdPct: 2,
  downThresholdPct: -2,
  reversalThresholdPct: 1,
  maxAnchorGapDays: 4, // Weekends/holidays: nearest earlier observation only.
  maxCacheAgeHours: 24,
  maxAbsChangePct: 100, // Extreme market inputs require review, not an automatic UI claim.
});
export const TREND_RULE_VERSION = 'TREND_BASELINE_V1';
export const marketSourceUrl = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU,DCOILWTICO';
