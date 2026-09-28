export function roundProbabilitiesTo100(values) {
  if (!Array.isArray(values) || values.length !== 3 ||
      values.some(v => !Number.isFinite(v) || v < 0 || v > 1) ||
      Math.abs(values.reduce((a, b) => a + b, 0) - 1) > 1e-9) {
    throw new Error('INVALID_PROBABILITY');
  }
  const rounded = values.map(v => Math.floor(v * 100));
  const order = values.map((v, i) => ({ i, remainder: v * 100 - rounded[i] }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  const remaining = 100 - rounded.reduce((a, b) => a + b, 0);
  for (let i = 0; i < remaining; i++) rounded[order[i].i]++;
  return rounded;
}
