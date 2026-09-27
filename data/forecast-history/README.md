# Forecast evidence history

Daily snapshots use a capture timestamp, assessment timestamp and content hash;
exclusive file creation (`wx`) rejects an existing name. Failed forecasts are
also retained. `forecastDate` uses Asia/Shanghai; `rawFetchedAt` and `assessedAt`
retain UTC/offset timestamps. Same-day runs append versions, never replace them.
Raw confidence, direction, prose and JSON stay in this backend archive, outside
`dist`. The public cache is a separate sanitized projection.

This spike contains three real anonymous responses, not six API calls. The
first three assessment files without an `assessed-` name were made before a
microsecond ISO capture-time compatibility fix. Their raw facts remain intact;
the extra capture-time rejection in those initial assessments is superseded by
the later timestamped assessment for the same raw hash. Nothing was overwritten.
For future evaluation, identify a forecast by raw hash/capture time, and use its
latest assessment; do not count reassessments as independent predictions.

The source gate is FAIL, so daily unattended collection is not activated. Each
future authorized updater run appends the day's evidence automatically. There
is no claim of an already running daily archive, accuracy score, or persistence
of files from an unconfigured ephemeral CI runner.
