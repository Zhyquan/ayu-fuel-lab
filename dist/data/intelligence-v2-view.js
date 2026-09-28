import { validateForecastCache } from './intelligence-v2-contract.js';
export function forecastMarkup(value,options) {
  const forecast=validateForecastCache(value,options);
  if (forecast.status!=='LIVE') return `<p class="trend-unavailable">${forecast.status==='STALE'?'数据更新中':'当前信息不足，暂不判断'}</p>`;
  const {primaryDirection:direction,probabilities:p}=forecast;
  return `<p class="trend-direction ${direction.toLowerCase()}"><svg class="trend-arrow" viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 25L12 17L18 21L26 6"/><path d="M18 6h8v8"/></svg>${direction==='UP'?'偏涨':'偏跌'}</p>
    <p class="ai-estimate-label">AI综合估计</p>
    <div class="ai-probabilities">${[['DOWN','下跌'],['FLAT','基本不变'],['UP','上涨']].map(([key,label])=>`<div class="probability-row"><span>${label}</span><div class="probability-track" aria-hidden="true"><span style="width:${p[key]}%"></span></div><strong>${p[key]}%</strong></div>`).join('')}</div>
    <p class="forecast-scope">判断国际柴油市场方向，不等同于本省调价。</p>`;
}
