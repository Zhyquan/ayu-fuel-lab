import { dieselDensityKgPerLiter } from './fuel-config.js';

// Keep display conversion separate from the original price/API contract.
// A future source-provided ton price can replace this display adapter.
export function getPriceDisplay(pricePerLiter) {
  if (typeof pricePerLiter !== 'number' || !Number.isFinite(pricePerLiter) || pricePerLiter <= 0) throw new Error('INVALID_LITER_PRICE');
  return {
    diesel0PricePerLiter: pricePerLiter,
    estimatedPricePerTon: Math.round(pricePerLiter * (1000 / dieselDensityKgPerLiter)),
    tonPriceType: 'ESTIMATED',
    dieselDensityKgPerLiter,
  };
}
