import { selectProvinceData } from '../../../dist/data/validation.js';
import { getPriceDisplay } from '../../../dist/data/price-display.js';

const el = id => document.getElementById(id);
const provinces = ['福建','浙江','广东','山东','辽宁','河北','天津','上海','江苏','广西','海南'];
for (const name of provinces) {
  const option = document.createElement('option');
  option.value = name;
  option.textContent = name;
  el('province').append(option);
}
let cache;
function renderPrice() {
  const result = selectProvinceData(cache, el('province').value);
  el('liter').textContent = '';
  el('price-date').textContent = '';
  if (result.status === 'UNAVAILABLE') {
    el('price').textContent = '价格暂不可用';
    return;
  }
  const display = getPriceDisplay(result.record.diesel0Price);
  el('price').innerHTML = `<small>约</small> ¥${display.estimatedPricePerTon.toLocaleString('en-US')} <small>/ 吨</small>`;
  el('liter').textContent = `¥${display.diesel0PricePerLiter.toFixed(2)} / 升`;
  el('price-date').textContent = `APIZero · 来源日期 ${result.record.updatedAt} · ${result.status === 'STALE' ? '快照已过期' : '参考快照'}`;
}
el('province').addEventListener('change', renderPrice);
try {
  const response = await fetch('../data/coastal-reference-snapshot.json', { cache:'no-store', signal:AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('SNAPSHOT_UNAVAILABLE');
  cache = await response.json();
} catch {
  cache = undefined;
}
renderPrice();
