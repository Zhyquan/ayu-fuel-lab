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
