import { coastalProvinces } from './data/coastal-provinces.js';
import { getProvinceFuelData } from './data/fuel-service.js';

const content = document.querySelector('#fuel-content');
const dialog = document.querySelector('#province-dialog');
const trigger = document.querySelector('#province-trigger');
const provinceName = document.querySelector('#province-name');
const announcement = document.querySelector('#status-announcement');
let selectedProvince = '福建';
let requestVersion = 0;
let currentResult = null;
const escapeText = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const statusText = result => result.delayLevel === 'ERROR' ? '数据更新异常，请稍后查看' : result.status === 'STALE' ? '数据更新可能延迟' : '参考数据已更新';
const formatTime = value => new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0,16).replace('T',' ');

function PriceCard(result) {
  const data = result.record;
  const stale = result.status === 'STALE';
  return `<section class="price-card${result.delayLevel === 'ERROR' ? ' update-error' : stale ? ' stale-card' : ''}" aria-labelledby="price-title">
    <h2 id="price-title">省级0#柴油参考价</h2>
    <div class="price"><span class="currency">¥</span><strong>${data.diesel0Price.toFixed(2)}</strong><span class="unit">/ L</span></div>
    <p class="data-status ${stale ? 'stale' : 'live'}"><span aria-hidden="true">${stale ? '!' : '✓'}</span>${statusText(result)}</p>
    <div class="source-date"><span>价格来源日期</span><time datetime="${data.updatedAt}">${data.updatedAt}</time></div>
    <p class="date-precision">来源仅提供日期，不含具体时分</p>
    ${stale ? '<p class="stale-notice">请谨慎参考，等待数据更新。</p>' : ''}
  </section><div class="source-details"><p><span>数据来源</span><strong>APIZero · 省级公开参考价</strong></p><p><span>本站更新时间</span><time datetime="${result.generatedAt}">${formatTime(result.generatedAt)}</time></p><p class="timezone">本站更新时间为北京时间</p></div>`;
}

function LoadingState() {
  return `<section class="price-card skeleton-card" aria-label="正在读取参考价"><div class="skeleton medium"></div><div class="skeleton big"></div><div class="skeleton short"></div><p class="loading-label">正在读取参考价。</p></section>`;
}

function UnavailableState() {
  return `<section class="surface empty-state"><span class="unavailable-symbol" aria-hidden="true">—</span><h2>当前数据暂不可用</h2><p>${escapeText(selectedProvince)}的参考价暂时无法获取</p><p class="empty-hint">请稍后重试，或选择其他沿海地区。</p><div class="empty-actions"><button class="primary-button" id="retry-data">重新获取</button><button class="secondary-button" id="choose-another">选择其他地区</button></div></section>`;
}

function renderResult(result) {
  currentResult = result;
  content.setAttribute('aria-busy','false');
  content.dataset.state = result.status;
  if (result.status === 'UNAVAILABLE') {
    content.innerHTML = UnavailableState();
    document.querySelector('#retry-data').addEventListener('click', () => loadProvince(selectedProvince, { refresh: true }));
    document.querySelector('#choose-another').addEventListener('click', openPicker);
    announcement.textContent = `${selectedProvince}当前数据暂不可用`;
    return;
  }
  content.innerHTML = PriceCard(result);
  announcement.textContent = `${selectedProvince}省级0号柴油参考价${result.record.diesel0Price.toFixed(2)}元每升，${statusText(result)}`;
}

async function loadProvince(province, options = {}) {
  const version = ++requestVersion;
  selectedProvince = province;
  provinceName.textContent = coastalProvinces.find(item => item.name === province).fullName;
  document.querySelectorAll('[data-province]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.province === province)));
  content.setAttribute('aria-busy','true');
  content.dataset.state = 'LOADING';
  content.innerHTML = LoadingState();
  announcement.textContent = '正在读取参考价。';
  const result = await getProvinceFuelData(province, options);
  if (version === requestVersion) renderResult(result);
}

function openPicker() {
  dialog.showModal();
  document.body.classList.add('picker-open');
  const selected = dialog.querySelector('[aria-pressed="true"]');
  selected.focus({ preventScroll: true });
  selected.scrollIntoView({ block: 'nearest' });
}

document.querySelector('#province-grid').innerHTML = coastalProvinces.map(province => `<button class="province-option" data-province="${province.name}" aria-label="${province.fullName}" aria-pressed="${province.name === selectedProvince}">${province.name}<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 8 3 3 5-6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`).join('');
trigger.addEventListener('click', openPicker);
document.querySelector('#close-picker').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { document.body.classList.remove('picker-open'); trigger.focus({ preventScroll: true }); });
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});
document.querySelector('#province-grid').addEventListener('click', event => {
  const button = event.target.closest('[data-province]');
  if (!button) return;
  dialog.close();
  if (button.dataset.province !== selectedProvince) loadProvince(button.dataset.province);
});

// Time passing can make an open page stale; this reuses the in-memory cache.
setInterval(async () => {
  if (document.hidden || !currentResult?.record || content.getAttribute('aria-busy') === 'true') return;
  const version = requestVersion;
  const result = await getProvinceFuelData(selectedProvince);
  if (version === requestVersion && (result.status !== currentResult.status || result.delayLevel !== currentResult.delayLevel)) renderResult(result);
}, 60000);

loadProvince(selectedProvince);
