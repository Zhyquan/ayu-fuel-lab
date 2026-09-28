import { validateForecastCache } from './intelligence-v2-contract.js';
const escapeText = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function forecastMarkup(value,options) {
  const forecast=validateForecastCache(value,options);
  if (forecast.status!=='LIVE') return `<p class="trend-unavailable">${forecast.status==='STALE'?'数据更新中':'当前信息不足，暂不判断'}</p>`;
  const {primaryDirection:direction,probabilities:p,evidencePack}=forecast;
  const list=items=>`<ul class="intelligence-list">${items.map(item=>{
    const signal=evidencePack.signals.find(s=>s.id===item.evidenceId);
    return `<li>${escapeText(item.text)}<a href="${escapeText(signal.sourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeText(item.text)}的来源">来源 ↗</a></li>`;
  }).join('')}</ul>`;
  return `<p class="trend-direction ${direction.toLowerCase()}"><span aria-hidden="true">${direction==='UP'?'↑':'↓'}</span>${direction==='UP'?'偏涨':'偏跌'}</p>
    <p class="ai-estimate-label">AI综合估计</p>
    <div class="ai-probabilities">${[['DOWN','下跌'],['FLAT','基本不变'],['UP','上涨']].map(([key,label])=>`<div class="probability-row"><span>${label}</span><div class="probability-track" aria-hidden="true"><span style="width:${p[key]}%"></span></div><strong>${p[key]}%</strong></div>`).join('')}</div>
    <details class="forecast-details"><summary>查看判断依据</summary>
      <p class="forecast-scope">判断国际柴油市场方向，不等同于本省调价。</p>
      <p class="forecast-caption">主要${direction==='UP'?'上行':'下行'}因素</p>${list(forecast.mainReasons)}
      <p class="forecast-caption">主要${direction==='UP'?'下行':'上行'}风险</p>${forecast.counterReasons.length?list(forecast.counterReasons):'<p class="forecast-scope">当前没有已核实的反向证据，仍存在不确定性。</p>'}
      <p class="forecast-scope">这是基于当前证据的主观综合估计；有效24小时。</p>
    </details>`;
}
