# Fuel Optimization V2 contracts

## Trigger and display

`RECOMPUTE_ELIGIBILITY_V2` is a deterministic admission decision, not a predicted impact. It requires fresh valid core, admitted source/body (or explicitly labelled External Analyst input), relevance, novelty and materiality. Ordinary market review is retained without inference. Currently supported material topics include diesel-stock release/change, supply facility disruption/restoration and producer policy. Classification of a report does not confirm the report's claims; forecasts still use the same grounded Qwen interpretation/Gates.

A LOW external signal is accepted but does not alone trigger a model. Existing author/URL/body/date verification and Qwen one HTTP / zero retry remain. VERIFY_ONLY never delivers a Forecast. Scheduled Official admission/reservations and model contract are unchanged. A duplicate within the freshly collected input is one copy; a previously accepted Current event is blocked. `REFRESH_CURRENT` may return `ACCEPTED_NO_RECOMPUTE` successfully.

`FUEL_ACCEPTED_EVIDENCE_V2` carries `acceptedEvidence[]`, generatedAt/inputHash/collectionHash. Rows have stable id, title, short owned/validated model summary, publisher/original source, URL, original publication time/precision, type/relevance, forecastInfluence/influenceBasis, displayEligible/displayPriority/policy, contentHash/inputHash, optional relationship and forecastHash. No raw article, segments, prompts, credentials or external analyst reason text.

- REJECTED: no consumer row; explicit exclusion.
- ACCEPTED_LOW_INFLUENCE: visible but no automatic inference solely for this item.
- ACCEPTED_MATERIAL: visible with higher display priority and eligible trigger if novel/fresh.
- FORECAST_PRIMARY_EVIDENCE: actually referenced by this Forecast, highest priority.

`influenceBasis=TRIGGER_PREASSESSMENT_ONLY` means a deterministic low-impact intake classification, NOT measured model sensitivity or proof of zero effect. `MODEL_ASSESSMENT` is model-assessed strength. `EXTERNAL_ANALYST` remains external analysis, not independently verified original news. `RELATED_ONLY` never claims it caused the displayed probabilities.

Related collection uses 72h original-publication expiry, content/event deduplication and 64KiB transport budget. There is no fixed card count. The separate bounded model context (6 docs), news assessment (3), reason (3+2) contracts remain for cost/grounding and do not cap the accumulated related collection.

## Storage / trust

Bridge calls onAcceptedEvidence before paid inference; a later model failure cannot erase this receipt. CLI stages `.work/manual-bridge/accepted-evidence.json`; safe workflow artifact preserves it. It is not written into a Forecast or Official history and cannot change their identity. A publisher must verify the canonical collectionHash and producer/source receipt before persistence; shape/URL Gate alone is not origin authentication. Previously accepted rows may be supplied only from that trusted store.

Current staged artifact retention is not an automatic Ayu delivery service. Fuel-only publisher adaptation and exact deployed consumer proof are separate pending items; do not claim them from local tests. Website UI and Public Preview remain unchanged.

## Price

Anonymous APIZero docs read 2026-10-03 specify QPS3, 500 anonymous daily requests: https://apizero.cn/aidocs/oil-price/raw.md . Existing sequential calls now wait 500ms after completion (strictly below 2QPS), retaining retry-after/quota stop. No concurrent burst and no key. Six-hour schedule unchanged; no invented source timestamp.

Real 11-region paired measurement 2026-10-03T09:13:33Z–09:14:05Z: before23842ms, after7893ms, each11/11 success; reduction66.9%. Both source dates2026-09-26. Source availability and cloud/downstream publication were not observed and are UNKNOWN; this is ingestion+validation latency only, not end-to-end freshness. No prices or Forecast published by this measurement.
