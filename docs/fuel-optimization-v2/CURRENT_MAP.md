# FUEL_OPTIMIZATION_V2_CURRENT_MAP

Observed 2026-10-03; Fuel origin/main 472f0ea1b580f579c277b9d87a2e281f1d385f98.
Isolated branch feature/fuel-optimization-v2 includes reason diagnostic recovery 047b62f by cherry-pick a0b8685. No main mutation.

1. Price: scheduled every six hours (01:17/07:17/13:17/19:17 Shanghai), plus code/forecast publication. 31 sequential anonymous APIZero calls, additional 2s between responses. Browser reads static cache; source observation date is not ingestion time. Upstream source availability time is UNKNOWN.
2. Forecast: Official daily, protected same-day reservation; scheduled/fallback triggers do not guarantee inference or publication. Bridge REFRESH_CURRENT is separately authorized Current production. VERIFY_ONLY is free. Current inference one HTTP request, retries zero.
3. Known latency: unnecessary >=60s price waits, serial market/weekly/news acquisition, GitHub scheduler/queue, manual selection and transfer into Ayu. Actual before/after measurements follow; these are not yet claimed measured improvements.
4. Bridge: currently every admitted novel input in REFRESH_CURRENT triggers Qwen, even LOW signals.
5. Existing trigger checks: source/body/date and duplicate admission, fresh core gate, activation. No independent materiality decision.
6. Collections already arrays; model input max6 news, assessment max3, main/counter max3/2, public reason cards max5. These model context/cost and reason constraints are distinct from a related-news feed.
7. publicEvidenceGate iterates only mainReasons/counterReasons. An admitted unselected article is omitted. Mini private projection consumes these cards only.
8. Last identified publisher source origin/codex/fuel-forecast-publisher-recovery ee94b2b supports dynamic evidence array. Client maps fuel.evidence and renders wx:for with no numeric truncation. This source is a historical delivery checkpoint. JOOBS subsequently confirmed separate frozen identities: API43 source56de2d3, Client305221, composition311c984e, operator publisher4962231. They are not a single merge baseline; a fresh Test read failed because the existing local session expired. No cloud mutation occurred.

Latest observed Official run 37103694139 was workflow-success but model/commit stages SKIPPED after reservation recheck. Follow-up Pages run success alone cannot establish data publication. Historical integration worktree ac2d01f6 is older than publisher recovery and must not be used for forward-port.

Boundary: price fetch/validation already has no model call; workflows still share Pages build. Private publisher accepts separately versioned price and forecast rows. Do not manufacture a new release platform. Add measured faster ingestion and independent accepted-news contract in Fuel Core, then adapt only confirmed Fuel domain source. No Payment/Release/Storage/shared Client edits.
