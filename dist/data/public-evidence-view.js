import { publicEvidenceGate, formatEvidenceDate } from './public-evidence.js';
const escapeText = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function publicEvidenceMarkup(forecast,options={}) {
  if (forecast.status==='STALE') return '<p class="evidence-unavailable">数据更新中，新的判断依据尚未发布。</p>';
  if (forecast.status!=='LIVE') return '<p class="evidence-unavailable">当前暂无可展示的判断依据。</p>';
  const projection=publicEvidenceGate({forecast,evidencePack:forecast.evidencePack},options);
  if (projection.gate!=='PASS') return '<p class="evidence-unavailable">判断依据暂时无法展示。</p>';
  const main=projection.cards.filter(card=>card.role==='MAIN'), counter=projection.cards.filter(card=>card.role==='COUNTER');
  const direction=forecast.primaryDirection==='UP'?'上行':'下行';
  const heading=`主要${direction}因素`;
  const cardMarkup=card=>`<article class="evidence-card" data-evidence-id="${escapeText(card.evidenceId)}">
    <p class="evidence-meta"><span class="evidence-label ${card.direction.toLowerCase()}${card.directionLabel.includes('风险')?' risk':''}">${escapeText(card.directionLabel)}</span><span>${escapeText(card.sourceName)}</span><time datetime="${card.date}">${formatEvidenceDate(card.date,options.now)}发布</time></p>
    <h4>${escapeText(card.title)}</h4><p class="evidence-summary">${escapeText(card.summary)}</p>
    <a class="evidence-source" href="${escapeText(card.sourceUrl)}" target="_blank" rel="noopener noreferrer" aria-label="查看${escapeText(card.title)}的原始来源">查看来源 ↗</a>
  </article>`;
  const mainHeading=main.length?`<h3 class="evidence-group-title">${heading}</h3>`:'';
  const counterMarkup=counter.length?`<h3 class="evidence-group-title">反向因素</h3>${counter.map(cardMarkup).join('')}`:'';
  if (projection.cards.length<=2) return `${mainHeading}${main.map(cardMarkup).join('')}${counterMarkup}`;
  const rest=main.slice(2);
  const additional=rest.length||counter.length?`<details class="evidence-details"><summary><span class="evidence-show-all">查看全部依据（${projection.cards.length}）</span><span class="evidence-hide-all">收起依据</span></summary>
    ${rest.length?`<h3 class="evidence-group-title">${heading}（续）</h3>${rest.map(cardMarkup).join('')}`:''}${counterMarkup}
  </details>`:'';
  return `${mainHeading}${main.slice(0,2).map(cardMarkup).join('')}${additional}`;
}
