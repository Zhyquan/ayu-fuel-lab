const labels={UP:'偏上涨',DOWN:'偏下跌',SIDEWAYS:'震荡'};
const arrows={UP:'↗',DOWN:'↘',SIDEWAYS:'↔'};
const signed=(value,digits)=>`${value>0?'+':value<0?'−':''}${Math.abs(value).toFixed(digits)}`;
export function forecastMarkup(forecast) {
  if (forecast?.status!=='LIVE' || !['UP','DOWN','SIDEWAYS'].includes(forecast.direction)) return '<p class="trend-unavailable">趋势数据暂不可用</p>';
  // Only adapter-approved values reach this renderer; provider prose is never rendered.
  return `<p class="trend-direction ${forecast.direction.toLowerCase()}"><span aria-hidden="true">${arrows[forecast.direction]}</span>${labels[forecast.direction]}</p>
    <p class="forecast-caption">预计下一轮参考变化</p>
    <p class="forecast-ton">约 ${signed(forecast.estimatedChangePerTon,0)} <span>元 / 吨</span></p>
    <p class="forecast-liter">约 ${signed(forecast.estimatedChangePerLiter,2)} 元 / 升</p>
    <p class="forecast-caption">主要依据</p><p class="trend-explanation">${{UP:'第三方调价信号偏向上调',DOWN:'第三方调价信号偏向下调',SIDEWAYS:'第三方调价信号偏向暂稳'}[forecast.direction]}</p>`;
}
