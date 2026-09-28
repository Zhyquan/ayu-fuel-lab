import { coastalProvinces } from './data/coastal-provinces.js';
import { getProvinceFuelData } from './data/fuel-service.js';
import { getPriceDisplay } from './data/price-display.js';
import { getForecast } from './data/intelligence-v2-service.js';
import { forecastMarkup } from './data/intelligence-v2-view.js';
import { publicEvidenceMarkup } from './data/public-evidence-view.js';

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

function PriceCard(result) {
  const data = getPriceDisplay(result.record.diesel0Price);
  const stale = result.status === 'STALE';
  return `<section class="price-card${result.delayLevel === 'ERROR' ? ' update-error' : stale ? ' stale-card' : ''}" aria-labelledby="price-title">
    <h2 id="price-title">省级0#柴油参考价</h2>
    <div class="price ton-price"><span class="approx">约</span><span class="currency">¥</span><strong>${data.estimatedPricePerTon.toLocaleString('en-US')}</strong><span class="unit">/ 吨</span></div>
    <p class="liter-price">¥${data.diesel0PricePerLiter.toFixed(2)} <span>/ 升</span></p>
    <p class="estimate-note">吨价按参考密度估算 · ${data.dieselDensityKgPerLiter} kg/L</p>
    ${stale ? `<p class="data-status stale"><span aria-hidden="true">!</span>${statusText(result)}</p>` : ''}
  </section>`;
}

function renderForecast(forecast) {
  const target = document.querySelector('#trend-content');
  target.dataset.status = forecast.status;
  target.setAttribute('aria-busy', 'false');
  target.innerHTML = forecastMarkup(forecast);
  renderEvidence(forecast);
}

function renderEvidence(forecast) {
  const target = document.querySelector('#evidence-content');
  try {
    target.innerHTML = publicEvidenceMarkup(forecast);
  } catch {
    target.innerHTML = '<p class="evidence-unavailable">判断依据暂时无法展示。</p>';
  }
  target.setAttribute('aria-busy', 'false');
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
  announcement.textContent = `${selectedProvince}省级0号柴油参考价，估算约${getPriceDisplay(result.record.diesel0Price).estimatedPricePerTon}元每吨，${result.record.diesel0Price.toFixed(2)}元每升，${statusText(result)}`;
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

getForecast().then(renderForecast);
setInterval(() => { if (!document.hidden) getForecast().then(renderForecast); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) getForecast().then(renderForecast); });
