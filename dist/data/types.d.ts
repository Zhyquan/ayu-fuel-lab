export type DataStatus = 'LIVE' | 'STALE' | 'UNAVAILABLE';
export interface ProvinceCurrentFuelData {
  province: string;
  diesel0Price: number | null;
  unit: '元/升' | null;
  updatedAt: string | null; // Source YYYY-MM-DD, date precision only.
  sourceStatus: DataStatus;
  failureReason?: string;
}
export interface NormalizedFuelCache {
  generatedAt: string; // Actual cache generation time, ISO with timezone.
  source: 'APIZero';
  provinces: Record<string, ProvinceCurrentFuelData>;
}

export interface FuelPriceDisplay {
  diesel0PricePerLiter: number;
  estimatedPricePerTon: number;
  tonPriceType: 'ESTIMATED';
  dieselDensityKgPerLiter: number;
}
export type TrendDirection = 'UP' | 'SIDEWAYS' | 'DOWN';
export interface TrendWindow {
  fromDate: string;
  toDate: string;
  fromPrice: number;
  toPrice: number;
  pct: number; // Observed price change, never a probability.
}
export type MarketName = 'Brent' | 'WTI';
export type MarketTrend = {
  status: 'LIVE_BASELINE';
  ruleVersion: 'TREND_BASELINE_V1';
  source: 'FRED/EIA';
  generatedAt: string;
  dataUpdatedAt: string; // Latest common market observation YYYY-MM-DD.
  direction: TrendDirection;
  label: string;
  basedOn: string[];
  metrics: Record<MarketName, { observedAt: string; price: number; unit: 'USD/barrel'; changes: Record<'day1'|'day3'|'day7', TrendWindow> }>;
  observations: Record<MarketName, { date: string; price: number }[]>;
} | { status: 'UNAVAILABLE'; generatedAt: string; reason: string };
