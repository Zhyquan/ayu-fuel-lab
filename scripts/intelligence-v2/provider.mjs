export const FORECAST_PROVIDERS = ['MANUAL','OPENAI','OTHER'];

export function createForecastProvider(name='MANUAL') {
  if (!FORECAST_PROVIDERS.includes(name)) throw new Error('UNKNOWN_PROVIDER');
  return {
    name,
    async generateForecast({evidencePack,evidenceHash,manualCandidate}) {
      // No network client or credential lookup exists in Phase A.
      if (name!=='MANUAL') throw new Error('PAID_PROVIDER_NOT_AUTHORIZED');
      if (!evidencePack || !manualCandidate || manualCandidate.provider!=='MANUAL' || manualCandidate.evidenceHash!==evidenceHash) throw new Error('MANUAL_CANDIDATE_REQUIRED');
      return structuredClone(manualCandidate);
    },
  };
}
