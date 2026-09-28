# V5 information cutoff — frozen before development

Inherited V4 Target: LOCAL-CURRENCY AIDI, equal US/EU weekly log returns, FLAT theta = 0.0075 with both boundaries FLAT. V4 definition, threshold decision and weekly alignment hashes are verified against its frozen commit.

Prediction is made Friday **16:30 America/New_York** (after normal 15:30 COT release), one decision per observation week. This is a fixed decision schedule, not an assertion all sources were released by then. Only per-source records satisfying availableAt <= cutoff enter the snapshot. Delayed sources remain unavailable; no release causes retrospective movement of a decision.

targetStart = next Monday 00:00 UTC; targetEnd = following Monday 00:00 UTC, exclusive. This preserves V4's complete Monday–Sunday observation week and next-week return. It is not a Friday-to-Friday transaction-price return. The forecast begins approximately 2 days after the cutoff; no target-week observation may enter a feature. AIDI's denominator may subsequently be published: it remains a label endpoint, never a feature.

- US price / crude: V4 ALFRED first release + Chicago next midnight; complete T-1 observation week only.
- EU: inherited conservative survey+11 days, Brussels Friday 00:00. This is a schedule assumption with residual extreme-late-publication and revision risk; it is not an observed timestamp.
- EIA: actual dated original archive release + next midnight New_York. All deltas require every contributing release to be available.
- CFTC: reportDate is observation. Regular fallback availability is **next week's Friday 16:00 ET**, deliberately one weekly cutoff later than normal release; holiday uncertainty is covered, not mislabeled actual release. Sources explicitly note no complete historical release-date list.
- 2013 Sep30–Nov15 and 2018 Dec24–2019 Mar15 reports are quarantined because a complete exact catch-up schedule was not recovered. They are not silently assigned ordinary release lags.
- 2023 ION delayed dates use official announced issue dates + one calendar day midnight ET. Mar21–Mar28 report dates, where remaining recovery is not fully evidenced here, are quarantined.
- 2025 Sep30–Dec23 reports are quarantined: the revised official backlog table proves an announced schedule, not all actual issue times. The raw observations remain saved and are not backdated into features. Normal late-December reports still use the extra-cutoff delay. Unknown failures remain residual risk.
- CFTC snapshots older than 21 observation days, EIA older than 21 observation days: unavailable (NaN plus provenance), no fabricated record. Model imputation is fitted solely on Train and documented.

Every price, CFTC and EIA feature retains observedAt / availableAt provenance. Audit rejects availableAt > cutoff and observedAt >= targetStart. Seasonal stock reference uses only earlier calendar years, within +/-3 ISO weeks, and only already released observations; no future five-year average.

Final split is by targetStart, complete target weeks inside 2022-01-01..2025-12-31. Train ends 2020, calibration is 2021, each label purged by labelKnownAt before the next block's first decision. Final model and calibrators remain fixed throughout 2022–2025: no holdout retraining or calibration. Development rolling validation is 2017–2020, prior year calibration.

2022–2025 was evaluated in V4. Therefore this is a **V5-selection locked historical holdout**, not a never-seen research history; prior adaptive-research exposure is a material limitation. 2026 is excluded from selection, ablation and final evaluation.
