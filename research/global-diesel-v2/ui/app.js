import { selectProvinceData } from '../../../dist/data/validation.js';
import { getPriceDisplay } from '../../../dist/data/price-display.js';
import { selectForecast, selectState } from './contract.js';

const el = id => document.getElementById(id);
const provinces = ['福建','浙江','广东','山东','辽宁','河北','天津','上海','江苏','广西','海南'];
for (const name of provinces) { const o=document.createElement('option');o.value=name;o.textContent=name;el('province').append(o); }
async function read(url) { const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!r.ok)throw new Error('UNAVAILABLE');return r.json(); }
let cache;
function renderPrice() {
  const result=selectProvinceData(cache,el('province').value);
  el('liter').textContent='';el('price-date').textContent='';
  if (result.status==='UNAVAILABLE') { el('price').textContent='价格暂不可用';return; }
  const p=getPriceDisplay(result.record.diesel0Price);
  el('price').innerHTML=`<small>约</small> ¥${p.estimatedPricePerTon.toLocaleString('en-US')} <small>/ 吨</small>`;
  el('liter').textContent=`¥${p.diesel0PricePerLiter.toFixed(2)} / 升`;
  el('price-date').textContent=`APIZero · 来源日期 ${result.record.updatedAt} · ${result.status==='STALE'?'快照已过期':'参考快照'}`;
}
function renderResearch(data) {
  const forecast=selectForecast(data);
  if (forecast.status!=='LIVE') el('forecast').innerHTML='<p class="pending">模型验证中</p><p class="explanation">历史检验尚未通过<br>暂不提供趋势预测</p>';
  else {
    const labels={down:'下跌',flat:'基本不变',up:'上涨'};
    el('forecast').innerHTML=`<p class="direction">${{DOWN:'↓ 偏跌',FLAT:'→ 基本不变',UP:'↑ 偏涨'}[forecast.primaryDirection]}</p>`;
    for (const k of ['down','flat','up']) { const row=document.createElement('div');row.className='probability-row';row.innerHTML=`<span>${labels[k]}</span><strong>${forecast.percentages[k]}%</strong>`;el('forecast').append(row); }
  }
  const s=selectState(data?.currentState);
  if (!s) { el('state').textContent='行情暂不可用';el('market-date').textContent='请稍后再查看';return; }
  el('state').textContent=s.stale?'行情快照已过期':`当前：${{STRONG:'偏强',NEUTRAL:'正常',WEAK:'偏弱'}[s.currentState]}`;
  el('state').classList.toggle('stale',s.stale);
  el('market-date').textContent=`观察 ${s.benchmark.latestDate} · 发布 ${s.releaseDate}`;
  el('observed-price').textContent=`最近已公布报价：${s.benchmark.latestValue.toFixed(3)} 美元 / 美制加仑。`;
  const points=s.recentObservations;
  if (Array.isArray(points) && points.length>1 && points.every(p=>Number.isFinite(p.value))) {
    const low=Math.min(...points.map(p=>p.value)),high=Math.max(...points.map(p=>p.value));
    const values=points.map((p,i)=>`${8+i/(points.length-1)*284},${80-(p.value-low)/(high-low||1)*68}`).join(' ');
    el('chart').innerHTML=`<line x1="8" y1="81" x2="292" y2="81" stroke="#e2edee"/><polyline points="${values}" fill="none" stroke="#388795" stroke-width="2.5" stroke-linejoin="round"/>`;
    el('chart-dates').textContent=`${points[0].date} — ${points.at(-1).date} · 最近20个报价`;
  }
  const b=s.crudeContext?.brent;
  el('crude').textContent=b?`布伦特原油最近已公布报价 ${b.latestValue.toFixed(2)} 美元 / 桶，较7天前${b.change7dUSD>=0?'增加':'减少'} ${Math.abs(b.change7dUSD).toFixed(2)} 美元 / 桶。观察日期 ${b.latestDate}。`:'本轮未纳入可用记录。';
}
el('province').addEventListener('change',renderPrice);
await Promise.all([
  read('../data/coastal-reference-snapshot.json').then(c=>{cache=c;renderPrice();}).catch(()=>renderPrice()),
  read('./candidate-status.json').then(renderResearch).catch(()=>renderResearch(null))
]);
