const DAY=86400000;
const csvDate=date=>{const [y,m,d]=date.split('-');return `${Number(m)}/${Number(d)}/${y.slice(2)}`;};
const csv=rows=>rows.map(row=>row.map(value=>`"${value}"`).join(',')).join('\r\n');

// Synthetic values, using the actual EIA Table 1/2 column and row identities.
export function weeklySourceFixture({releaseDate='2026-09-30',period='2026-09-25',checkedAt='2026-09-30T15:00:00.000Z'}={}) {
  const previous=new Date(Date.parse(period)-7*DAY).toISOString().slice(0,10),current=csvDate(period),prior=csvDate(previous);
  const old=period==='2026-09-18',stocks=old?[107.431,107.831]:[105.180,107.431],crude=old?[426.398,425.001]:[427.320,426.398];
  const production=old?[5159,5227]:[5003,5159],inputs=old?[16811,17330]:[16257,16811],utilization=old?[94.0,96.8]:[92.5,94.0];
  const row=(group,label,values)=>[group,label,...values.map(n=>String(n)),String(values[0]-values[1]),'9/26/25','0','9/27/24','0',current,'0','0'];
  return {
    checkedAt,metadata:{metadata:{source:'U.S. Energy Information Administration',release_name:'Weekly Petroleum Status Report',data_description:'Commercial Crude Oil Stocks (Excluding SPR)',periodicity:'Weekly',release_date:releaseDate,release_time:'10:30 am',time_period:{end_date:period}},data:{'U.S.':{sourcekey:'WCESTUS1',units:'thousand barrels',time_series:[{date:previous,value:Math.round(crude[1]*1000),suppression_flag:null},{date:period,value:Math.round(crude[0]*1000),suppression_flag:null}]}}},
    table1:csv([
      ['STUB_1',current,prior,'Difference','Percent Change','9/26/25','Difference','Percent Change'],
      ['Commercial (Excluding SPR)',...crude,'0','0','0','0','0'],
      ['Distillate Fuel Oil',...stocks,'0','0','0','0','0'],
      ['STUB_1','STUB_2',current,prior,'Difference','9/26/25','Difference',current,'9/26/25','Percent Change',current,'9/26/25','Percent Change'],
    ]),
    table2:csv([
      ['STUB_1','STUB_2',current,prior,'Difference','9/26/25','Percent Change','9/27/24','Percent Change',current,'9/26/25','Percent Change'],
      row('Refiner Inputs and Utilization ','Crude Oil Inputs',inputs),
      row('Refiner Inputs and Utilization ','Percent Utilization',utilization),
      row('Refiner and Blender Net Production ','Distillate Fuel Oil',production),
    ]),
    schedule:'Wednesday 10:30 am',landing:`<a href="archive/2026/${releaseDate.replaceAll('-','_')}/">Latest</a>`,
    summary:old?'For the week ending September 18, 2026, U.S. refineries processed 16.8 million barrels per day (b/d), down 519,000 b/d from the previous week, at 94.0% capacity utilization. Distillate production decreased to 5.2 million b/d. Distillate inventories decreased 0.4 million barrels, 12% below the five-year average.':'For the week ending September 25, 2026, U.S. refineries processed 16.3 million barrels per day (b/d), down 554,000 b/d from the previous week, at 92.5% capacity utilization. Distillate production decreased to 5.0 million b/d. Distillate inventories decreased 2.3 million barrels, 14% below the five-year average.',
  };
}
