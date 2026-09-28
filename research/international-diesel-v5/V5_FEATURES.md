# V5 candidate features and limits

Candidates: GROUP A price/momentum/crude/season; GROUP B regional divergence; GROUP C eight normalized CFTC features; GROUP D four inventory and six refinery features. No news, LLM, war, OPEC score or Japan/MGO value enters the matrix.

CFTC: managedMoneyNetShare=(long-short)/OI; changes are differences of normalized shares at exact calendar lags. Producer/merchant and swap net shares similarly normalized. OI change is OI/OI_previous-1. Managed money gross=(long+short+2*spreading)/OI: spreading contributes one long and one short leg. Not a count of all unique traders.

Inventory: 1/4w level changes,4w percentage change,past-season zscore. Refinery: utilization level and1/4w changes,production1/4w changes,inputs4w change. No absolute crack conversion; upstream crude returns remain simple predictors.

| Group | Features |
| --- | --- |
| A/B | aidi_return_1w, aidi_return_4w, aidi_volatility_4w, aidi_volatility_13w, brent_return_1w, wti_return_1w, season_sin, season_cos, us_eu_divergence, nyh_usgc_divergence |
| CFTC | managedMoneyNetShare, managedMoneyNetShareChange1w, managedMoneyNetShareChange4w, producerMerchantNetShare, producerMerchantNetShareChange1w, swapDealerNetShare, openInterestChange1w, managedMoneyGrossShare |
| Inventory | inventory_change_1w, inventory_change_4w, inventory_pct_change_4w, inventory_seasonal_zscore |
| Refinery | refinery_utilization_level, refinery_utilization_change_1w, refinery_utilization_change_4w, distillate_production_change_1w, distillate_production_change_4w, refinery_input_change_4w |

AIDI candidate maximum28 inputs, US expert maximum26, EU expert7; Regional Ensemble union maximum30. Regional experts retain13w volatility and prune the redundant4w volatility before development to satisfy the union cap. Hard cap30 applies to the full chosen input union. One preset configuration per Logistic or shallow HistGradientBoosting; no large search. The final selected list is frozen in V5_PREREGISTERED_PLAN. Old V4's original38-feature baseline is retained as a named reference exception; it cannot become the V5 winner.

All features retain source/value/observedAt/availableAt provenance, verified before fitting. Train-only median imputation and scaling. Unknown underlying records remain missing.
