const el = id => document.getElementById(id);
const provinces = ['辽宁', '河北', '天津', '山东', '江苏', '上海', '浙江', '福建', '广东', '广西', '海南'];
let snapshot;
el('province').innerHTML = provinces.map(p => `<option ${p === '福建' ? 'selected' : ''}>${p}</option>`).join('');
function price() {
  const record = snapshot?.provinces?.[el('province').value];
  if (!record || !Number.isFinite(record.diesel0Price)) {
    el('price').textContent = '参考价暂不可用';
    el('liter').textContent = ''; el('price-date').textContent = '';
    return;
  }
  const ton = Math.round(record.diesel0Price * 1000 / .84);
  el('price').innerHTML = `<small>约</small> ¥${ton.toLocaleString('en-US')} <small>/ 吨</small>`;
  el('liter').textContent = `¥${record.diesel0Price.toFixed(2)} / 升`;
  el('price-date').textContent = `APIZero 公开参考快照 · 来源日期 ${record.updatedAt}`;
}
el('province').addEventListener('change', price);
async function read(name) {
  const response = await fetch(name);
  if (!response.ok) throw new Error('SNAPSHOT_UNAVAILABLE');
  return response.json();
}
try { snapshot = await read('./price-snapshot.json'); price(); }
catch { price(); }
try {
  const data = await read('./current-state.json');
  if (data.dataGate !== 'PASS' || data.isPrediction !== false) throw new Error('STATE_UNAVAILABLE');
  el('state').textContent = `当前：${{ WEAK: '偏弱', NEUTRAL: '平稳', STRONG: '偏强' }[data.currentState]}`;
  el('state-date').textContent = `最新完整观测周截至 ${data.weekEnd}`;
  el('changes').innerHTML = [1, 4, 13].map(h => {
    const value = (Math.exp(data.returns[`${h}w`]) - 1) * 100;
    return `<div class="change">近${h}周变化<b>${value >= 0 ? '+' : ''}${value.toFixed(2)}%</b></div>`;
  }).join('');
  const history = await read('./history.json');
  const values = history.map(d => d.level);
  const min = Math.min(...values), span = Math.max(...values) - min || 1;
  const points = values.map((v, i) => `${10 + i * 330 / (values.length - 1)},${88 - (v - min) / span * 74}`).join(' ');
  el('chart').innerHTML = `<polyline points="${points}" fill="none" stroke="#39838d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="10" y1="93" x2="340" y2="93" stroke="#e6edef"/>`;
} catch {
  el('state').textContent = '市场状态暂不可用';
  el('state-date').textContent = '周度参考数据正在核验';
  el('market-details').hidden = true;
}
