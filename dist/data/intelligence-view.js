import { validateIntelligenceCache,labels } from './intelligence-contract.js';
const arrows={UP:'↗',DOWN:'↘',SIDEWAYS:'↔'};
const escapeText=text=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function forecastMarkup(value,options) {
  const forecast=validateIntelligenceCache(value,options);
  if (forecast.status!=='LIVE') return '<p class="trend-unavailable">当前信息不足，暂不判断</p>';
  const list=items=>`<ul class="intelligence-list">${items.map(text=>`<li>${escapeText(text)}</li>`).join('')}</ul>`;
  return `<p class="trend-direction ${forecast.direction.toLowerCase()}"><span aria-hidden="true">${arrows[forecast.direction]}</span>${labels[forecast.direction]}</p>
    <p class="forecast-caption">主要依据</p>${list(forecast.reasons)}
    <p class="forecast-caption">反向因素</p>${list(forecast.counterSignals)}`;
}
