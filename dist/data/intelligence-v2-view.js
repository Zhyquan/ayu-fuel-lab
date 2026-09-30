import { validateForecastCache } from './intelligence-v2-contract.js';
const lastKnownTime = value => {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(part=>[part.type,part.value]));
  return `${parts.month}月${parts.day}日 ${parts.hour}:${parts.minute}`;
};
export function forecastMarkup(value,options) {
  const forecast=validateForecastCache(value,options);
  if (!['LIVE','STALE'].includes(forecast.status)) return '<p class="trend-unavailable">当前信息不足，暂不判断</p>';
  const {primaryDirection:direction,probabilities:p}=forecast;
  return `<p class="trend-direction ${direction.toLowerCase()}"><svg class="trend-arrow" viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 22L12 13L18 19L29 8"/><path d="M20 8h9v9"/></svg>${direction==='UP'?'偏涨':'偏跌'}</p>
    <p class="ai-estimate-label">AI综合估计</p>
    <div class="ai-probabilities">${[['DOWN','下跌'],['FLAT','基本不变'],['UP','上涨']].map(([key,label])=>`<div class="probability-row ${key.toLowerCase()}"><span>${label}</span><div class="probability-track" aria-hidden="true"><span style="width:${p[key]}%"></span></div><strong>${p[key]}%</strong></div>`).join('')}</div>
    <p class="forecast-scope">${forecast.coverageMode==='LIMITED'?'仅据行情与库存 · ':''}判断国际柴油市场方向，不等同于本省调价。</p>
    ${forecast.status==='STALE'?`<p class="trend-asof"><time datetime="${forecast.generatedAt}">上次判断 · ${lastKnownTime(forecast.generatedAt)}</time> · 等待更新</p>`:''}`;
}
