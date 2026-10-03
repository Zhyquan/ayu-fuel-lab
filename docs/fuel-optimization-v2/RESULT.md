# Fuel Optimization V2 — implementation and verification checkpoint

Observed 2026-10-03, final local verification about18:00 Shanghai. **FUEL_OPTIMIZATION_V2_READY = PENDING**: real private publish/read/device chain not proven. No Integration, main, website or runtime deployment was performed.

## 25-point delivery

1. **Current map:** `CURRENT_MAP.md`. Current source main472f0ea1b580f579c277b9d87a2e281f1d385f98, freshly fetched unchanged. Price and model were already computationally separate, but price publication depended on website build/deploy; private transfer remains operator-controlled.
2. **Original price latency:**11 coastal regions actual sequential anonymous fetch/validation23842ms, 11/11 success. No invented source-available timestamp.
3. **Optimized price latency:**same11 regions7893ms, 11/11 success (66.9% less). Inter-response wait2s→500ms, sequential<2QPS, below documented anonymous3QPS. Both source dates2026-09-26. Source-available→publish→downstream latency UNKNOWN. Existing six-hour schedule unchanged; this does not establish real-time prices. New Fuel-only direct Core price publisher removes website-success dependency in candidate code, not deployed.
4. **Original Forecast cadence:**Official daily with primary/fallback and one-day reservation; novel admitted Bridge REFRESH_CURRENT previously ran regardless of materiality. A workflow-success alone does not prove a model or publication.
5. **New triggers:**scheduled unchanged; Bridge requires verified/fresh/novel/material input plus valid core. No new model, search service or orchestrator.
6. **Bridge event contract:**material input requests exactly one inference/zero retry; accepted low-materiality returnsACCEPTED_NO_RECOMPUTE with0model calls. VERIFY_ONLY stays free. Current/Official identities remain separate.
7. **RECOMPUTE_ELIGIBILITY_V2:**core validity, freshness, source/body trust or explicitly labelled external analysis, relevance, novelty, materiality, duplication. Frozen collector reuse requires matching actual fetch receipt under1h; original publication/fetch dates retained. Direct403 is not re-labelled200.
8. **Dynamic news schema:**FUEL_ACCEPTED_EVIDENCE_V2 with acceptedEvidence[], collectionHash/inputHash, stable identity, owned short copy, publisher/original source, URL/time precision, type, relevance, influence/basis, priority/policy, hash and optional Forecast relationship. 72h original-publication expiry, event/content dedup,64KiB budget; no fixed card count. Separate model context/assessment limits retained.
9. **Influence vs priority:**forecastInfluence independent of displayEligible/displayPriority. TRIGGER_PREASSESSMENT_ONLY is preliminary intake classification, not measured model sensitivity; MODEL_ASSESSMENT and EXTERNAL_ANALYST remain distinguishable.
10. **Low influence:**real Reuters-via-BusinessRecorder article br-40442432 accepted, related-only, priority30; model calls0. It remains visible in candidate private contract despite no Forecast reason reference.
11. **Real Bridge→Forecast:**br-40442435 material diesel-stock report; prior frozen fetch verified. Initial direct source403 used0calls. Three real inference attempts: duplicate-event failure; direction mismatch failure; after explicit existing-rule event groups/direction hints, success. Core probabilities/weights/validator unchanged. B DOWN65/FLAT20/UP15, generated2026-10-03T09:32:20.859Z, validUntil2026-10-04T09:32:20.859Z. Hash3c88ed3e98651e85f6af1ec013a0b8363053e21d71e589c63fe22f0796048232. New article was NOT selected as a reason; no causal claim that it changed probabilities. LOCAL_REAL_ACCEPTED_NOT_PUBLISHED.
12. **Same-client Ayu:**NOT_RUN. JOOBS confirmedClient305221/experience0713 and separateAPI43/Notify41 identity; no verified currently active DevTools session supplied. Historical A phone PASS is not B proof. Existing login expired during fresh read-only Test snapshot; no current cloud identity obtained. User must refresh local login, then fresh authority check/data-only publication and actual Client refresh. Do not simulate owner identity as phone proof.
13. **Client uploads/new experience:**0/0.
14. **Low influence visible contract:**PASS_LOCAL_ONLY. Real B+real low article passed candidate private projection; synthetic N=8 related items plus2reasons consumed by exact frozenClient305 source in VM. Private cloud/device NOT_RUN.
15. **Client adapter required:**none for basic dynamicN compatible-card rendering based on exact source/VM. Runtime Fuel server adapter required.
16. **Exact adapter delta:**server currentFuelNews in existing Fuel store; source/hash verified operator publisher; active-owner private projectionV2 adds acceptedEvidence/newsCollectionHash and appends compatiblecards. Public preview exactwhitelist unchanged. Integration owner must include two new Fuel files in existing runtime manifests and forward-port onto latest component without replacing newer fixes. No shared release manifest or Client edit in this branch.
17. **Model calls:**3 actual one-HTTP semantic calls. Each new call followed a distinct diagnosed failure and an offline regression fix; no blind retry. Ordinary source403 and low-news path0calls. No Official reservation/history mutation.
18. **Model cost:**estimated¥0.0133228 total from4564/266,4570/256,4887/258 input/output tokens, Beijing list-price¥0.8/¥2.7 per million. Not a billed invoice; below¥1task cap and each<¥0.10. Successful call4340ms; complete fresh-core Bridge21640ms. First accepted-news receipt time was overwritten by final callback in the private harness, so exact pre-inference acceptance latency UNKNOWN (not reconstructed).
19. **Website:**no UI changes, no main push/Pages deployment. Shared contract file and Bridge safe artifact staging only. Website remains existing free entry.
20. **Payment Core changes/payments:**0/0.
21. **ReleaseV2 changes:**0.
22. **Production writes/deploys:**0/0. Test writes/deploys0/0. Existing temporary session expired before a read result; no authority mutation. No new resources.
23. **Branches:**Fuel feature/fuel-optimization-v2, implementation00b560e293fdfec73c11d9810d50fca84293d1fe plus this report checkpoint. Fuel-only Ayu candidate feature/fuel-optimization-v2-domain commit4e8eecd655514e37a91d27974d76118f838eff07, based on exactAPI43source56de2d3. Private actual B artifact local-onlybefce9cd3111717fa87d61d98073598242264891; never pushed to publicrepo. None is an accepted Integration candidate.
24. **Tests:**Core507/507PASS; production replayPASS; deterministic fuzz192legal+25illegalPASS plus128ExternalBridge variants; publicscanPASS. Fuel-only selected tests60PASS. API-only source lacks standalone Clientpage; that legacy test was excluded by name and replaced by exactClient305Git-object VM test. Not full assembled Mini Program regression or realphone acceptance. News/price Git publisher operator/ref/hash guards tested withsynthetic artifacts; no model/cloudcall.
25. **Checkpoint:**branches committed/pushed/remote verified, worktreesCLEAN after final documentation commit (exact finalSHAs in response). Main and accepted baseline not moved.

## Remaining evidence and operational gaps

- Private cloud read/publish awaits local login refresh and fresh exact target identity. A had expired before this test; cannot claim a current LIVE A→B comparison from historical evidence.
- New news/server contract has not been integrated/deployed; no automatic authenticated Bridge artifact→Ayu transfer installed. Existing operator path plus candidate publisher functions are available; do not call it continuous automatic delivery.
- Previously accumulated news must come from authenticated producer storage; never feed untrusted request rows into `previous`. CLI currently stages safe collection receipt, not an authenticated remote news store reader.
- Source price observation remains2026-09-26. Faster fetch does not make upstream observation newer. Six-hour scheduler and manual/private publication remain total freshness limits.
- Actual phone refresh and renderedB identity are pending; no new purchase or Client upload required by proposed data-only check.

## Gates

CORE_LOCAL_GATE=PASS
BRIDGE_REAL_CORE_GATE=PASS
LOW_INFLUENCE_NEWS_VISIBLE_CONTRACT_PASS=PASS_LOCAL_ONLY
PRIVATE_PUBLISH_GATE=PENDING
SAME_CLIENT_REAL_READ_GATE=NOT_RUN
CONTINUOUS_BRIDGE_TO_AYU_DELIVERY=NOT_INSTALLED
FUEL_OPTIMIZATION_V2_READY=PENDING

Official pricing reference: https://help.aliyun.com/zh/model-studio/qwen3-8-flash . APIZero limits: https://apizero.cn/aidocs/oil-price/raw.md . Measurements establish these runs only, not long-term stability.
