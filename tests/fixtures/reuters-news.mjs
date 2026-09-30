// Synthetic wording in the publisher's observed JSON-LD/body structure.
// These are not copied articles or claims about actual events.
export const newsTime='2026-09-29T11:20:00.000Z';
export const newsUrl=id=>`https://www.brecorder.com/news/${id}/fixture`;
export const cases={
  disruption:{headline:'Yanbu oil pipeline shutdown confirmed',body:'The Yanbu oil pipeline was shut down on Tuesday after damage stopped crude transport.'},
  restoration:{headline:'Yanbu oil loadings resumed',body:'Yanbu oil loadings resumed on Tuesday after the East-West oil pipeline restarted.'},
  outlook:{headline:'IEA considers strategic reserve release',body:'The IEA said member governments may discuss releasing strategic oil reserves if additional supply is needed.'},
  stocks:{headline:'Stocks fall as oil rises',body:'Shares fell. The Yanbu oil pipeline was shut down on Tuesday.'},
  fx:{headline:'Rupee weakens as oil rises',body:'The rupee weakened. The Yanbu oil pipeline was shut down on Tuesday.'},
  ambiguous:{headline:'Oil prices rise on supply concern',body:'Oil prices rose as analysts discussed the uncertain long-term global economy.'},
  shipping:{headline:'Oil settles amid unresolved Hormuz supply risk',body:'Ongoing supply disruptions remain a concern while mediators seek talks to reopen the Strait of Hormuz.'},
};
export function newsArticle({headline,body,author=[{name:'Reuters'}],publishedAt='2026-09-29T10:00:00.000Z',modifiedAt=newsTime,related=''}={}) {
  const metadata={'@type':'NewsArticle',headline,author,publisher:{name:'Business Recorder'},dateModified:modifiedAt};
  if(publishedAt!==null)metadata.datePublished=publishedAt;
  return `<script type="application/ld+json">${JSON.stringify(metadata)}</script><div class="story__content"><div class="wrapper"><p>${body}</p></div>${related}</div><div class="outside">Unrelated page content.</div>`;
}
export const newsSitemap=items=>`<urlset>${items.map(({id,headline,date='2026-09-29'})=>`<url><loc>${newsUrl(id)}</loc><news:news><news:publication_date>${date}</news:publication_date><news:title><![CDATA[${headline}]]></news:title></news:news></url>`).join('')}</urlset>`;
export function collectorFetch({gdelt=[],rss=[],sitemap=[],articles={},requested=[]}={}) {
  const daily='<h1>September 29, 2026</h1><table summary="Spot Petroleum Prices"><b>Wholesale Spot Petroleum Prices, 9/28/26 Close</b><tr><td class="s1">Crude Oil ($/barrel)</td><td class="s2">WTI</td><td class="d1">95.88</td><td class="up">+2.7</td></tr><tr><td class="s2">Brent</td><td class="d1">120.92</td><td class="up">+3.0</td></tr><tr><td class="s1">Low-Sulfur Diesel ($/gallon)</td><td class="s2">NY Harbor</td><td class="d1">4.88</td><td class="dn">-1.6</td></tr></table>';
  const weekly='For the week ending September 18, 2026, U.S. refineries processed 16.8 million barrels per day (b/d), down 519,000 b/d from the previous week, at 94.0% capacity utilization. Distillate production decreased to 5.2 million b/d. Distillate inventories decreased 0.4 million barrels, 12% below the five-year average.';
  return async url=>{
    requested.push(url);
    if(url.includes('todayinenergy/prices.php'))return new Response(daily);
    if(url.includes('/wpsr/psw00.json'))return new Response(JSON.stringify({metadata:{release_date:'2026-09-23',time_period:{end_date:'2026-09-18'}}}));
    if(url.includes('/wpsr/summary.txt'))return new Response(weekly);
    if(url.includes('schedule.php'))return new Response('Wednesday 10:30 am');
    if(url.includes('/petroleum/supply/weekly/'))return new Response('<a href="archive/2026/2026_09_23/">Latest</a>');
    if(url.includes('fred.stlouisfed.org'))return new Response('observation_date,DCOILBRENTEU,DCOILWTICO,DDFUELNYH\n2026-09-28,120,100,5\n2026-09-25,119,99,5.1');
    if(url.includes('opec.org'))return new Response('',{status:403});
    if(url.includes('gdeltproject.org'))return new Response(JSON.stringify({articles:gdelt}));
    if(url.endsWith('/feeds/latest-news'))return new Response(`<rss>${rss.map(({id,headline})=>`<item><title>${headline}</title><link>${newsUrl(id)}</link><pubDate>Tue, 29 Sep 2026 11:00:00 GMT</pubDate></item>`).join('')}</rss>`);
    if(url.endsWith('/feeds/sitemap'))return new Response(newsSitemap(sitemap));
    const article=articles[url.match(/news\/(\d+)/)?.[1]];
    return article?new Response(article):new Response('',{status:404});
  };
}
