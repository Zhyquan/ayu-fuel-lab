import { validDate, validTimestamp } from '../../../dist/data/validation.js';

const keys = ['down', 'flat', 'up'];
export function selectForecast(data, now = new Date()) {
  const unavailable = { status: 'VALIDATING', probabilities: null };
  const c = data?.contract;
  if (data?.gate !== 'PASS' || c?.status !== 'LIVE' || c?.source !== 'AYU_GLOBAL_DIESEL_V2' || c.calibrated !== true || c.horizonDays !== 7 || !c.modelVersion) return unavailable;
  const p = c.probabilities;
  if (!p || Object.keys(p).sort().join(',') !== 'down,flat,up' || !keys.every(k => Number.isFinite(p[k]) && p[k] >= 0 && p[k] <= 1) || Math.abs(keys.reduce((s,k) => s+p[k],0)-1)>1e-12) return unavailable;
  const time = new Date(now).getTime();
  if (!validTimestamp(c.generatedAt) || !validTimestamp(c.validUntil) || !Number.isFinite(time) || Date.parse(c.generatedAt)>time || Date.parse(c.validUntil)<=time || Date.parse(c.validUntil)<=Date.parse(c.generatedAt) || Date.parse(c.validUntil)-Date.parse(c.generatedAt)>86400000) return unavailable;
  if (!c.benchmark?.name || !validDate(c.benchmark.latestDate) || !Number.isFinite(c.benchmark.latestValue) || c.benchmark.latestValue<=0 || c.benchmark.latestDate>c.generatedAt.slice(0,10)) return unavailable;
  if (!['STRONG','NEUTRAL','WEAK'].includes(c.currentState) || !keys.includes(c.primaryDirection?.toLowerCase()) || p[c.primaryDirection.toLowerCase()] !== Math.max(...keys.map(k=>p[k]))) return unavailable;
  const parts = keys.map((key,i)=>({key,i,n:Math.floor(p[key]*100),fraction:p[key]*100%1}));
  const remaining = 100-parts.reduce((s,r)=>s+r.n,0);
  [...parts].sort((a,b)=>b.fraction-a.fraction || a.i-b.i).slice(0,remaining).forEach(r=>r.n++);
  return {...c, percentages:Object.fromEntries(parts.map(r=>[r.key,r.n]))};
}

export function selectState(s, now = new Date()) {
  if (!s || !['STRONG','NEUTRAL','WEAK'].includes(s.currentState) || !validTimestamp(s.generatedAt) || !validTimestamp(s.validUntil) || !validTimestamp(s.availableAt) || !validDate(s.releaseDate) || !validDate(s.benchmark?.latestDate) || !Number.isFinite(s.benchmark?.latestValue) || s.benchmark.latestValue<=0) return null;
  const time=new Date(now).getTime();
  if (!Number.isFinite(time) || Date.parse(s.generatedAt)>time || Date.parse(s.availableAt)>Date.parse(s.generatedAt) || s.benchmark.latestDate>s.releaseDate) return null;
  return {...s, stale:Date.parse(s.validUntil)<=time || s.freshness==='STALE'};
}
