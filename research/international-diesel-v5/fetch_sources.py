"""Anonymous public source capture, never run by the offline evaluation."""
import hashlib, json, sys, time, urllib.request, urllib.parse
from datetime import datetime, timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parent
def fetch(url,name):
    path=ROOT/'data/raw'/name
    if path.exists(): return
    req=urllib.request.Request(url,headers={'User-Agent':'Ayu-Fuel-Lab-Research/5 (public non-commercial audit)'})
    try:
        with urllib.request.urlopen(req,timeout=45) as response:
            body=response.read(); status=response.status; content_type=response.headers.get('Content-Type')
        if status!=200: raise ValueError('HTTP '+str(status))
        if name.endswith('.json'): json.loads(body)
        path.write_bytes(body)
        meta={'url':url,'fetchedAt':datetime.now(timezone.utc).isoformat(),'httpStatus':status,'contentType':content_type,'bytes':len(body),'sha256':hashlib.sha256(body).hexdigest()}
        path.with_name(name+'.meta.json').write_text(json.dumps(meta,indent=2)+'\n')
        print(json.dumps({'file':name,'bytes':len(body),'status':status}),flush=True)
    except Exception as exc:
        error={'url':url,'fetchedAt':datetime.now(timezone.utc).isoformat(),'error':str(exc),'status':'FAILED'}
        path.with_name(name+'.error.json').write_text(json.dumps(error,indent=2)+'\n')
        print(json.dumps(error),flush=True)
        raise
if __name__=='__main__':
    fetch('https://publicreporting.cftc.gov/api/views/72hh-3qpy.json','cftc-dataset-metadata.json')
    time.sleep(1.25)
    fields=['id','market_and_exchange_names','report_date_as_yyyy_mm_dd','cftc_contract_market_code','cftc_market_code','open_interest_all','prod_merc_positions_long','prod_merc_positions_short','swap_positions_long_all','swap__positions_short_all','m_money_positions_long_all','m_money_positions_short_all','m_money_positions_spread','futonly_or_combined']
    query=urllib.parse.urlencode({'$select':','.join(fields),'$where':"cftc_contract_market_code='022651' AND report_date_as_yyyy_mm_dd>='2009-01-01T00:00:00'",'$order':'report_date_as_yyyy_mm_dd ASC','$limit':5000})
    fetch('https://publicreporting.cftc.gov/resource/72hh-3qpy.json?'+query,'cftc-ulsd-selected-fields.json')
