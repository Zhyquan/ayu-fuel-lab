import { publicEvidenceGate, formatEvidenceDate } from './public-evidence.js';
import { CORE_FORECAST_CONTRACT } from './intelligence-v2-contract.js';
const escapeText = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function publicEvidenceMarkup(forecast,options={}) {
  if (!['LIVE','STALE'].includes(forecast.status)) return '<p class="evidence-unavailable">当前暂无可展示的判断依据。</p>';
  const projection=publicEvidenceGate({forecast,evidencePack:forecast.evidencePack},options);
  if (projection.gate!=='PASS') return forecast.forecastContract===CORE_FORECAST_CONTRACT?'':'<p class="evidence-unavailable">判断依据暂时无法展示。</p>';
  const cardMarkup=card=>`<article class="evidence-card" data-evidence-id="${escapeText(card.evidenceId)}">
    <p class="evidence-meta"><span class="evidence-label ${card.direction.toLowerCase()}${card.directionLabel.includes('风险')?' risk':''}">${escapeText(card.directionLabel)}</span><span>${escapeText(card.sourceName)}</span><time datetime="${card.date}">${formatEvidenceDate(card.date,options.now)}发布</time></p>
    <h3>${escapeText(card.title)}</h3><p class="evidence-summary">${escapeText(card.summary)}</p>
    ${card.sourceUrl===null?'':`<a class="evidence-source" href="${escapeText(card.sourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="查看${escapeText(card.title)}的原始来源">查看来源 ↗</a>`}
  </article>`;
  return projection.cards.map(cardMarkup).join('');
}
