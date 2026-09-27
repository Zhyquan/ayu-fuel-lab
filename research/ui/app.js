import { getProvinceFuelData } from '../../dist/data/fuel-service.js';
import { getPriceDisplay } from '../../dist/data/price-display.js';
import { selectProbability } from './probability-contract.js';

const select = document.querySelector('#province');
for (const province of ['福建', '浙江', '广东', '山东', '辽宁', '河北', '天津', '上海', '江苏', '广西', '海南']) {
  const option = document.createElement('option'); option.value = province; option.textContent = province; select.append(option);
}
let request = 0;
async function renderPrice() {
  const id = ++request;
  const price = document.querySelector('#price'), source = document.querySelector('#source-date');
  price.textContent = '正在读取价格快照…'; source.textContent = '';
  const result = await getProvinceFuelData(select.value);
  if (id !== request) return;
  if (result.status === 'UNAVAILABLE') { price.textContent = '价格暂不可用'; return; }
  const data = getPriceDisplay(result.record.diesel0Price);
  price.innerHTML = `<div class="price"><small>约</small> ¥${data.estimatedPricePerTon.toLocaleString('en-US')} <small>/ 吨</small></div><p class="liter">¥${data.diesel0PricePerLiter.toFixed(2)} / 升</p>`;
  source.textContent = `来源日期 ${result.record.updatedAt} · APIZero${result.status === 'STALE' ? ' · 缓存已过期' : ''}`;
}
async function renderProbability() {
  let selected;
  try {
    const response = await fetch('./candidate-status.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('STATUS_UNAVAILABLE');
    const data = await response.json(); selected = selectProbability(data.contract, data.gate);
  } catch { selected = { status: 'UNAVAILABLE' }; }
  const container = document.querySelector('#probability');
  if (selected.status !== 'LIVE') {
    container.innerHTML = '<p class="unavailable">趋势概率暂不可用</p><p class="explanation">本轮历史验证未通过<br>暂不提供概率参考</p>';
    return;
  }
  const titles = { down: ['↓ 偏跌', '下跌'], flat: ['→ 基本不变', '基本不变'], up: ['↑ 偏涨', '上涨'] };
  container.replaceChildren();
  const heading = document.createElement('p'); heading.className = 'direction'; heading.textContent = titles[selected.primaryDirection.toLowerCase()][0]; container.append(heading);
  for (const key of ['down', 'flat', 'up']) {
    const row = document.createElement('div'); row.className = 'probability-row';
    row.innerHTML = `<span>${titles[key][1]}</span><strong>${selected.percentages[key]}%</strong>`; container.append(row);
  }
}
select.addEventListener('change', renderPrice);
await Promise.all([renderPrice(), renderProbability()]);
