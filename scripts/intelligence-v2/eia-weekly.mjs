import { DAY } from '../../dist/data/intelligence-v2-contract.js';
import { validDate } from '../../dist/data/validation.js';

export const WEEKLY_SOURCES = {
  weekly:'https://www.eia.gov/petroleum/supply/weekly/',
  metadata:'https://ir.eia.gov/wpsr/psw00.json',
  table1:'https://ir.eia.gov/wpsr/table1.csv',
  table2:'https://ir.eia.gov/wpsr/table2.csv',
  summary:'https://ir.eia.gov/wpsr/summary.txt',
  schedule:'https://www.eia.gov/petroleum/supply/weekly/schedule.php',
};
const fail = code => { throw new Error(code); };
const shifted = (date,days) => new Date(Date.parse(date)+days*DAY).toISOString().slice(0,10);
const clean = text => text.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
const easternTime = (date,hour=10,minute=30) => {
  const part=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',timeZoneName:'shortOffset'}).formatToParts(new Date(`${date}T12:00:00Z`)).find(p=>p.type==='timeZoneName').value;
  const offset=Number(part.match(/GMT([+-]\d+)/)?.[1]);
  if(!Number.isFinite(offset))fail('EIA_TIMEZONE_NOT_PARSED');
  return new Date(`${date}T${String(hour-offset).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00Z`).toISOString();
};
function releaseFor(period,schedule) {
  if(!validDate(period)||new Date(period).getUTCDay()!==5)fail('EIA_PERIOD_INVALID');
  if(!schedule?.includes('10:30'))fail('EIA_SCHEDULE_NOT_VERIFIED');
  let date=shifted(period,5),hour=10,minute=30;
  for(const row of schedule.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells=[...row[1].matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/g)].map(x=>clean(x[1]));
    if(cells[0]&&/^\w+ \d{1,2}, \d{4}$/.test(cells[0])&&new Date(`${cells[0]} UTC`).toISOString().slice(0,10)===period) {
      const next=Date.parse(`${cells[1]} UTC`),time=cells[3]?.match(/(\d{1,2}):(\d{2})\s*([ap])\.m\./);
      if(!Number.isFinite(next)||!time)fail('EIA_EXCEPTION_TIME_NOT_PARSED');
      date=new Date(next).toISOString().slice(0,10);hour=Number(time[1])%12+(time[3]==='p'?12:0);minute=Number(time[2]);
    }
  }
  return {date,at:easternTime(date,hour,minute),hour,minute};
}
function csvRows(text) {
  if(typeof text!=='string')fail('EIA_TABLE_LAYOUT_CHANGED');
  // EIA CSV is quoted, including comma-separated numeric thousands.
  return text.replace(/\r?\n\x1a\s*$/,'').trim().split(/\r?\n/).map(line=>{
    if(!/^"(?:[^"]|"")*"(?:,"(?:[^"]|"")*")*$/.test(line))fail('EIA_TABLE_LAYOUT_CHANGED');
    return [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(m=>m[1].replaceAll('""','"').trim());
  });
}
function csvDate(text) {
  const m=text?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  const date=m?`20${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`:null;
  if(!validDate(date))fail('EIA_TABLE_DATE_INVALID');
  return date;
}
const number = value => {
  if(typeof value!=='string'||!/^\d+(?:,\d{3})*(?:\.\d+)?$/.test(value))fail('EIA_VALUE_INVALID');
  const n=Number(value.replaceAll(',',''));if(!Number.isFinite(n)||n<=0)fail('EIA_VALUE_INVALID');return n;
};
function pair(rows,predicate,index) {
  const found=rows.filter(predicate);if(found.length!==1)fail('EIA_REQUIRED_FIELD_MISSING_OR_DUPLICATE');
  return {current:number(found[0][index]),previous:number(found[0][index+1])};
}
const delta = p => Math.round((p.current-p.previous)*1000)/1000;
function checkHeader(row,index,period,previous) {
  if(row?.[0]!=='STUB_1'||(index===2&&row[1]!=='STUB_2')||row[index+2]!=='Difference')fail('EIA_TABLE_LAYOUT_CHANGED');
  if(csvDate(row[index])!==period||csvDate(row[index+1])!==previous)fail('EIA_MACHINE_PERIOD_CONFLICT');
}

export function parseWeeklyMachineRelease({metadata,table1,table2,schedule,summary=null,landing=null,checkedAt}) {
  const m=metadata?.metadata,period=m?.time_period?.end_date,releaseDate=m?.release_date;
  if(m?.source!=='U.S. Energy Information Administration'||m?.release_name!=='Weekly Petroleum Status Report'||m?.periodicity!=='Weekly'||m?.data_description!=='Commercial Crude Oil Stocks (Excluding SPR)'||!validDate(releaseDate)||!validDate(period))fail('EIA_RELEASE_METADATA_INVALID');
  const release=releaseFor(period,schedule),next=releaseFor(shifted(period,7),schedule),previous=shifted(period,-7);
  const time=m.release_time?.match(/^(\d{1,2}):(\d{2})\s*([ap])m$/i);
  if(release.date!==releaseDate||!time||Number(time[1])%12+(time[3].toLowerCase()==='p'?12:0)!==release.hour||Number(time[2])!==release.minute)fail('EIA_RELEASE_IDENTITY_CONFLICT');
  if(!Number.isFinite(Date.parse(checkedAt))||Date.parse(release.at)>Date.parse(checkedAt))fail('EIA_RELEASE_FUTURE');
  const authority=metadata.data?.['U.S.'];
  if(authority?.sourcekey!=='WCESTUS1'||authority?.units!=='thousand barrels'||!Array.isArray(authority?.time_series)||authority.time_series.some(r=>!validDate(r.date)||r.date>period))fail('EIA_AUTHORITY_SERIES_INVALID');
  const authorityPair=[period,previous].map(date=>{
    const rows=authority.time_series.filter(r=>r.date===date);
    if(rows.length!==1||rows[0].suppression_flag!==null||!Number.isFinite(rows[0].value)||rows[0].value<=0)fail('EIA_AUTHORITY_WEEK_MISSING');
    return rows[0].value;
  });
  const stocksRows=csvRows(table1),inputRows=csvRows(table2),split=stocksRows.findIndex((r,i)=>i>0&&r[0]==='STUB_1');
  if(split<0)fail('EIA_TABLE_LAYOUT_CHANGED');
  checkHeader(stocksRows[0],1,period,previous);checkHeader(stocksRows[split],2,period,previous);checkHeader(inputRows[0],2,period,previous);
  const stocks=pair(stocksRows.slice(1,split),r=>r[0]==='Distillate Fuel Oil',1);
  const crude=pair(stocksRows.slice(1,split),r=>r[0]==='Commercial (Excluding SPR)',1);
  if([crude.current,crude.previous].some((n,i)=>Math.abs(n*1000-authorityPair[i])>0.001))fail('EIA_AUTHORITY_VALUE_CONFLICT');
  const production=pair(inputRows,r=>r[0]==='Refiner and Blender Net Production'&&r[1]==='Distillate Fuel Oil',2);
  const refinery=pair(inputRows,r=>r[0]==='Refiner Inputs and Utilization'&&r[1]==='Crude Oil Inputs',2);
  const utilization=pair(inputRows,r=>r[0]==='Refiner Inputs and Utilization'&&r[1]==='Percent Utilization',2);
  const diagnostics=[],priorRelease=releaseFor(previous,schedule).date;
  const diagnostic=(code,sourceUrl)=>diagnostics.push({code,sourceUrl});
  if(summary===null)diagnostic('SUMMARY_UNAVAILABLE',WEEKLY_SOURCES.summary);
  else {
    const dateText=summary.match(/week ending ([A-Za-z]+ \d{1,2}, \d{4})/i)?.[1],date=dateText?new Date(`${dateText} UTC`).toISOString().slice(0,10):null;
    if(date===previous)diagnostic('SUMMARY_LAGGING_CURRENT_RELEASE',WEEKLY_SOURCES.summary);
    else if(date&&date!==period)fail('EIA_SECONDARY_DATE_CONFLICT');
    else if(!date)diagnostic('SUMMARY_DATE_UNPARSED',WEEKLY_SOURCES.summary);
    else {
      const s=summary.match(/Distillate inventories (increased|decreased) ([\d.]+) million barrels/i),p=summary.match(/distillate production (increased|decreased) to ([\d.]+) million b\/d/i),r=summary.match(/refineries processed ([\d.]+) million barrels per day \(b\/d\), (down|up) ([\d,]+) b\/d from the previous week, at ([\d.]+)% capacity utilization/i);
      // Summary rounds to 0.1 million; its reported deltas may use unrounded values.
      const conflicts=[
        s&&Math.abs((s[1].toLowerCase()==='decreased'?-1:1)*Number(s[2])-delta(stocks))>0.051,
        p&&(Math.abs(Number(p[2])-production.current/1000)>0.051||Math.abs(delta(production))>1&&((p[1].toLowerCase()==='decreased')!==(delta(production)<0))),
        r&&(Math.abs(Number(r[1])-refinery.current/1000)>0.051||Math.abs((r[2].toLowerCase()==='down'?-1:1)*Number(r[3].replaceAll(',',''))-delta(refinery)*1000)>1000||Math.abs(Number(r[4])-utilization.current)>0.051),
      ];
      if(conflicts.some(Boolean))fail('EIA_SECONDARY_VALUE_CONFLICT');
      diagnostic(s&&p&&r?'SUMMARY_CONFIRMS_CURRENT_RELEASE':'SUMMARY_PARTIAL_CONFIRMATION',WEEKLY_SOURCES.summary);
    }
  }
  if(landing===null)diagnostic('LANDING_UNAVAILABLE',WEEKLY_SOURCES.weekly);
  else {
    const latest=landing.match(/archive\/\d{4}\/(\d{4}_\d{2}_\d{2})\//)?.[1]?.replaceAll('_','-');
    if(latest===priorRelease)diagnostic('LANDING_LAGGING_CURRENT_RELEASE',WEEKLY_SOURCES.weekly);
    else if(latest&&latest!==releaseDate)fail('EIA_SECONDARY_DATE_CONFLICT');
    else diagnostic(latest?'LANDING_CONFIRMS_CURRENT_RELEASE':'LANDING_DATE_UNPARSED',WEEKLY_SOURCES.weekly);
  }
  if(diagnostics.some(d=>d.code.includes('LAGGING')))diagnostic('SOURCE_PROPAGATION_LAG',WEEKLY_SOURCES.metadata);
  if(Date.parse(checkedAt)>=Date.parse(next.at))diagnostic('AWAITING_NEW_MACHINE_RELEASE',WEEKLY_SOURCES.metadata);
  const identity={sourceDataset:'EIA_WPSR_TABLES_1_2',authoritySourceUrl:WEEKLY_SOURCES.metadata,sourceKey:'WCESTUS1',releaseDate,periodEndDate:period,previousPeriodEndDate:previous,authorityCheckedAt:checkedAt};
  const measurements=[
    ['stocks',stocks,'百万桶',`库存周变化 ${delta(stocks)} 百万桶。`,WEEKLY_SOURCES.table1,'HIGH'],
    ['production',production,'千桶/日',`馏分油产量 ${production.current} 千桶/日，周变化 ${delta(production)} 千桶/日。`,WEEKLY_SOURCES.table2,'MEDIUM'],
    ['refinery-inputs',refinery,'千桶/日',`炼厂原油加工量 ${refinery.current} 千桶/日，周变化 ${delta(refinery)} 千桶/日；利用率 ${utilization.current}%。`,WEEKLY_SOURCES.table2,'LOW'],
  ];
  const signals=measurements.map(([key,values,unit,fact,sourceUrl,importance])=>{
    const change=delta(values),impact=change<0?'UP':change>0?'DOWN':'NEUTRAL',label=key==='stocks'?'美国馏分油库存':key==='production'?'美国馏分油产量':'美国炼厂原油加工量',headline=label+(change<0?'减少':change>0?'增加':'持平');
    return {id:`eia-${key}`,category:'DISTILLATE_FUNDAMENTALS',eventKey:`eia-weekly-${releaseDate}`,measurementKey:key,headline,fact:`统计周截止 ${period}；${fact}`,displayText:headline,impact,importance,kind:'FACT',eventDate:period,publishedAt:release.at,checkedAt,sourceName:'EIA Weekly Petroleum Status Report',sourceOrganization:'EIA',sourceUrl,sourceTier:1,verified:true,freshness:'EIA_RELEASE',releaseDate,latestReleaseDate:releaseDate,nextReleaseAt:next.at,weeklyReleaseIdentity:identity,weeklyObservation:{...values,change,unit,...(key==='refinery-inputs'?{utilizationPercent:utilization}: {})}};
  });
  return {signals,identity,diagnostics};
}
