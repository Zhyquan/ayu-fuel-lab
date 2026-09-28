# V5 independent weeks

694 calendar snapshots (including unlabelled inference tail), 577 eligible independent target weeks; primary starts2013-06. Development accessible rows through2021: 353. Each target week is one observation, never expanded into daily labels.

| Validation year | Train | Calibration | Validation | Train D/F/U | Cal D/F/U | Val D/F/U |
| --- | --- | --- | --- | --- | --- | --- |
| 2017 | 106 | 43 | 42 | [46, 44, 16] | [12, 7, 24] | [11, 12, 19] |
| 2018 | 149 | 42 | 39 | [58, 51, 40] | [11, 12, 19] | [12, 15, 12] |
| 2019 | 191 | 39 | 40 | [69, 63, 59] | [12, 15, 12] | [8, 23, 9] |
| 2020 | 230 | 40 | 41 | [81, 78, 71] | [8, 23, 9] | [12, 12, 17] |


Train rows recur across expanding development folds and must not be summed as independent samples. Primary freezes next-week V4 LOCAL-CURRENCY AIDI, theta0.0075. Final dates are2022-01-01..2025-12-31, complete target weeks only;2026 is excluded from selection and final scores.

Exact dataset SHA256: c3b4e54640075946109fa5d95560058f8204a39e5e0d9810fd62d5c50b9e606a

Final counts will be appended only after registered unlock. Previous V4 exposure to2022–2025 is disclosed: this is a V5 selection lock, not historically unseen data.

## Frozen final split

{
  "train": 311,
  "calibration": 42,
  "final": 187,
  "trainClassCounts": [
    101,
    113,
    97
  ],
  "calibrationClassCounts": [
    6,
    14,
    22
  ],
  "trainMaxLabelKnown": "2020-12-31 23:00:00+00:00",
  "calibrationFirstDecision": "2021-01-29 21:30:00+00:00",
  "calMaxLabelKnown": "2021-12-30 23:00:00+00:00",
  "finalFirstDecision": "2022-01-21 21:30:00+00:00",
  "finalLastTargetEnd": "2025-12-29 00:00:00+00:00"
}

Final D/F/U=[76, 48, 63]; effective independent n=187.
