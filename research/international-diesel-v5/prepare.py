"""V5-only offline snapshots; V4 frozen target and raw archives are read-only."""
import json
from pathlib import Path
import numpy as np
import pandas as pd
from common import ROOT,V4,SETTINGS,sha,save,load_v4,milestone,set_phase,classify

INHERITED=['AIDI_DEFINITION.md','AIDI_FLAT_THRESHOLD_DECISION.md','WEEKLY_ALIGNMENT_SPEC.md',
 'spec.json','SPEC_FREEZE.json','results/SELECTION_FREEZE.json','results/MODEL_FREEZE.json',
 'data/weekly-dataset.csv','data/weekly-index.csv','data/DATA_AUDIT.json','prepare.py','evaluate.py']
ION={'2023-01-31':'2023-02-24','2023-02-07':'2023-03-03','2023-02-14':'2023-03-08',
 '2023-02-21':'2023-03-10','2023-02-28':'2023-03-14','2023-03-07':'2023-03-16','2023-03-14':'2023-03-21'}
QUARANTINES=[('2013-09-30','2013-11-15','2013_SHUTDOWN_INCOMPLETE_ACTUAL_SCHEDULE'),
 ('2018-12-24','2019-03-15','2019_SHUTDOWN_INCOMPLETE_ACTUAL_SCHEDULE'),
 ('2023-03-21','2023-03-28','ION_REMAINING_RECOVERY_NOT_PROVEN'),
 ('2025-09-30','2025-12-23','2025_ANNOUNCED_CATCHUP_NOT_ACTUAL_RELEASE_PROOF')]

def target_integrity():
    selection=json.loads((V4/'results/SELECTION_FREEZE.json').read_text())
    final=json.loads((V4/'results/MODEL_FREEZE.json').read_text())
    specfreeze=json.loads((V4/'SPEC_FREEZE.json').read_text())
    checks={'thresholdExact':selection['threshold']==SETTINGS['threshold']==.0075,
      'selectionHashMatchesTestFreeze':sha(V4/'results/SELECTION_FREEZE.json')==final['selectionSha256'],
      'datasetHash':sha(V4/'data/weekly-dataset.csv')==selection['datasetSha256'],
      'specHash':sha(V4/'spec.json')==selection['specSha256']==specfreeze['sha256'],
      'selectionRecordedBeforeTest':pd.Timestamp(selection['frozenAt'])<pd.Timestamp(final['frozenAt']),
      'selectionPhase':selection['testOpened'] is False and selection['phase']=='AFTER_VALIDATION_BEFORE_TEST'}
    result={'gate':'PASS' if all(checks.values()) else 'TARGET_FREEZE_INTEGRITY_FAIL',
      'checks':checks,'v4Sha':SETTINGS['v4Sha'],'selectionFrozenAt':selection['frozenAt'],
      'testFrozenAt':final['frozenAt'],'hashes':{f:sha(V4/f) for f in INHERITED}}
    save(ROOT/'data/TARGET_FREEZE_INTEGRITY.json',result)
    if not all(checks.values()):raise ValueError('TARGET_FREEZE_INTEGRITY_FAIL')
    return result

def cot_availability(report):
    date=pd.Timestamp(report)
    for start,end,reason in QUARANTINES:
        if pd.Timestamp(start)<=date<=pd.Timestamp(end):return pd.NaT,reason
    if str(date.date()) in ION:
        return (pd.Timestamp(ION[str(date.date())])+pd.Timedelta(days=1)).tz_localize('America/New_York').tz_convert('UTC'),'ACTUAL_ISSUE_PLUS_NEXT_MIDNIGHT'
    monday=date-pd.Timedelta(days=date.weekday())
    return (monday+pd.Timedelta(days=11,hours=16)).tz_localize('America/New_York').tz_convert('UTC'),'CONSERVATIVE_ONE_CUTOFF_DELAY'

def cftc():
    raw=pd.DataFrame(json.loads((ROOT/'data/raw/cftc-ulsd-selected-fields.json').read_text()))
    assert (raw.cftc_contract_market_code=='022651').all() and (raw.cftc_market_code=='NYME').all()
    assert (raw.futonly_or_combined=='FutOnly').all()
    raw['reportDate']=pd.to_datetime(raw.report_date_as_yyyy_mm_dd)
    assert raw.reportDate.is_unique
    primary=raw[raw.reportDate>=pd.Timestamp('2013-06-04')].copy()
    fields=['open_interest_all','prod_merc_positions_long','prod_merc_positions_short',
        'swap_positions_long_all','swap__positions_short_all','m_money_positions_long_all',
        'm_money_positions_short_all','m_money_positions_spread']
    primary[fields]=primary[fields].apply(pd.to_numeric,errors='raise')
    assert (primary[fields]>=0).all().all() and (primary.open_interest_all>0).all()
    times=[cot_availability(v) for v in primary.reportDate]
    primary['availableAt']=pd.to_datetime([v[0] for v in times],utc=True)
    primary['availabilityRule']=[v[1] for v in times]
    primary['week']=primary.reportDate-pd.to_timedelta(primary.reportDate.dt.weekday,unit='D')
    primary.to_csv(ROOT/'data/cftc-audited.csv',index=False,float_format='%.17g')
    d=primary.set_index('week').reindex(pd.date_range(primary.week.min(),primary.week.max(),freq='W-MON'))
    d[fields]=d[fields].where(d.availableAt.notna())
    oi=d.open_interest_all
    result=pd.DataFrame(index=d.index)
    result['managedMoneyNetShare']=(d.m_money_positions_long_all-d.m_money_positions_short_all)/oi
    result['managedMoneyNetShareChange1w']=result.managedMoneyNetShare-result.managedMoneyNetShare.shift()
    result['managedMoneyNetShareChange4w']=result.managedMoneyNetShare-result.managedMoneyNetShare.shift(4)
    result['producerMerchantNetShare']=(d.prod_merc_positions_long-d.prod_merc_positions_short)/oi
    result['producerMerchantNetShareChange1w']=result.producerMerchantNetShare-result.producerMerchantNetShare.shift()
    result['swapDealerNetShare']=(d.swap_positions_long_all-d['swap__positions_short_all'])/oi
    result['openInterestChange1w']=oi/oi.shift()-1
    result['managedMoneyGrossShare']=(d.m_money_positions_long_all+d.m_money_positions_short_all+2*d.m_money_positions_spread)/oi
    avail=d.availableAt
    result['availableAt']=pd.concat([avail,avail.shift(),avail.shift(4)],axis=1).max(axis=1).where(avail.notna())
    result['observedAt']=d.reportDate
    result['sourceId']=d.id
    audit={'rawRows':len(raw),'rawStart':str(raw.reportDate.min().date()),'rawEnd':str(raw.reportDate.max().date()),
        'primaryRows':len(primary),'primaryStart':str(primary.reportDate.min().date()),'primaryEnd':str(primary.reportDate.max().date()),
        'quarantined':int(primary.availableAt.isna().sum()),'availabilityRules':primary.availabilityRule.value_counts().to_dict(),
        'displayNames':primary.market_and_exchange_names.value_counts().to_dict(),'units':'contracts; normalized by openInterest',
        'revisionEvidence':'Official current historical snapshot, not a complete first-publication vintage archive',
        'license':'CFTC government data public domain with acknowledgement; private contributions excluded',
        'revisionRisk':'COT may correct reports and trader classifications. No target-market correction found in reviewed special notices; absence is not universal vintage proof.'}
    return result,audit

def seasonal_reference(table,date,cutoff):
    prior=table[(table.index.year<date.year)&(table.index.year>=date.year-5)&(table.availableAt<=cutoff)]
    current_week=int(date.isocalendar().week)
    weeks=prior.index.isocalendar().week.to_numpy(dtype=int)
    distance=np.abs(weeks-current_week);distance=np.minimum(distance,53-distance)
    prior=prior[distance<=3]
    values=prior.stock.dropna()
    if len(values)<10 or values.std()<=0:return np.nan,prior
    return (table.loc[date,'stock']-values.mean())/values.std(),prior

def audit_seasonal_reference(reference,date,cutoff):
    if len(reference) and (not (reference.index.year<date.year).all() or not (reference.availableAt<=cutoff).all()):
        raise ValueError('LEAKAGE_FAIL: future seasonal inventory reference')

def eia():
    table=load_v4('prepare').eia_weekly().sort_index()
    assert table.index.is_unique and table.availableAt.notna().all()
    assert (table.availableAt>(table.index+pd.Timedelta(days=4)).tz_localize('UTC')).all()
    result=pd.DataFrame(index=table.index)
    result['inventory_change_1w']=table.stock-table.stock.shift()
    result['inventory_change_4w']=table.stock-table.stock.shift(4)
    result['inventory_pct_change_4w']=table.stock/table.stock.shift(4)-1
    result['refinery_utilization_level']=table.utilization
    result['refinery_utilization_change_1w']=table.utilization-table.utilization.shift()
    result['refinery_utilization_change_4w']=table.utilization-table.utilization.shift(4)
    result['distillate_production_change_1w']=table.production-table.production.shift()
    result['distillate_production_change_4w']=table.production-table.production.shift(4)
    result['refinery_input_change_4w']=table.inputs-table.inputs.shift(4)
    # Require exact calendar lags even if a source report week is absent.
    for lag,columns in [(1,['inventory_change_1w','refinery_utilization_change_1w','distillate_production_change_1w']),
       (4,['inventory_change_4w','inventory_pct_change_4w','refinery_utilization_change_4w','distillate_production_change_4w','refinery_input_change_4w'])]:
        valid=(table.index.to_series()-table.index.to_series().shift(lag)).eq(pd.Timedelta(weeks=lag))
        result.loc[~valid,columns]=np.nan
    z=[];season=[];availability=[]
    for date,row in table.iterrows():
        value,reference=seasonal_reference(table,date,row.availableAt)
        audit_seasonal_reference(reference,date,row.availableAt)
        z.append(value)
        season.append({'week':str(date.date()),'priorYears':sorted(set(reference.index.year.tolist())),
           'n':int(reference.stock.notna().sum()),'availableAt':str(reference.availableAt.max()) if len(reference) else None})
        availability.append(reference.availableAt.max() if len(reference) else pd.NaT)
    result['inventory_seasonal_zscore']=z
    result['observedAt']=table.index+pd.Timedelta(days=4)
    result['sourceId']=['eia:'+str(v.date()) for v in table.index]
    result['availableAt']=pd.concat([table.availableAt,table.availableAt.shift(),table.availableAt.shift(4),
         pd.Series(pd.to_datetime(availability,utc=True),index=table.index)],axis=1).max(axis=1)
    table.reset_index().to_csv(ROOT/'data/eia-original-first-columns.csv',index=False,float_format='%.17g')
    save(ROOT/'data/eia-seasonal-reference.json',season)
    return result,{'rows':len(table),'start':str(table.index.min().date()),'end':str(table.index.max().date()),
      'source':'original release first observation column; inherited dated WPSR raw archives',
      'units':{'stock':'million barrels','production':'thousand barrels/day','inputs':'thousand barrels/day','utilization':'percent'},
      'revisionRisk':'Dated archive snapshot audit inherited V4; not a guarantee these archive files were never corrected',
      'seasonalReference':'past five years, +/-3 ISO weeks, only earlier years and released data'}

def audit_row(row,provenance):
    cutoff=pd.Timestamp(row['decisionAt']);start=pd.Timestamp(row['targetStart'])
    for feature,p in provenance.items():
        value=row.get(feature,np.nan)
        if pd.isna(value):continue
        if p['availableAt'] is None or pd.Timestamp(p['availableAt'])>cutoff:raise ValueError('LEAKAGE_FAIL: '+feature+' unavailable')
        if pd.Timestamp(p['observedAt'])>=start:raise ValueError('LEAKAGE_FAIL: '+feature+' target overlap')
        if p['sourceId'].startswith('v4:') and p['sourceId']!='v4:'+str(pd.Timestamp(row.name).date()):
            raise ValueError('ALIGNMENT_FAIL: frozen price feature week')
        if not np.isclose(float(value),p['value'],rtol=1e-12,atol=1e-10):raise ValueError('ALIGNMENT_FAIL: '+feature+' source/value mismatch')
        if feature in SETTINGS['cftcFeatures'] and pd.Timestamp(p['observedAt'])<pd.Timestamp('2013-06-04',tz='UTC'):
            raise ValueError('CONTRACT_BREAK_FAIL')

def prepare():
    integrity=target_integrity()
    cot,cot_audit=cftc();fund,fund_audit=eia()
    milestone('M1','POST_ULSD_ONLY; inherited target and threshold integrity PASS')
    for name in ['data/raw/eia-weekly-releases.zip','data/raw/eu-history.xlsx',
       'data/raw/DDFUELNYH-initial.csv','data/raw/DDFUELUSGULF-initial.csv',
       'data/raw/DCOILBRENTEU-initial.csv','data/raw/DCOILWTICO-initial.csv']:
        integrity['hashes'][name]=sha(V4/name)
    data_audit={'V5_DATA_GATE':'PASS','cftc':cot_audit,'eia':fund_audit,
      'targetIntegrity':'PASS','inheritedV4Hashes':integrity['hashes'],
      'residualRisks':['EU extreme delayed releases/current historical revisions',
       'CFTC current historical corrections without full vintages','CFTC unannounced exceptional delays not a universal guarantee'],
      'admission':'RESEARCH_ONLY_CONSERVATIVE_RELEASE_RULE_WITH_EXPLICIT_QUARANTINES'}
    save(ROOT/'data/LEADING_SIGNAL_DATA_AUDIT.json',data_audit)
    milestone('M2','Leading sources available; conservative release gates and quarantines; residual vintage risks disclosed')
    dataset=pd.read_csv(V4/'data/weekly-dataset.csv',index_col='week',parse_dates=['week'])
    price=pd.read_csv(V4/'data/weekly-index.csv',index_col='week',parse_dates=['week'])
    extra=dataset.index.max()+pd.Timedelta(weeks=1)
    dataset=dataset.reindex(dataset.index.append(pd.DatetimeIndex([extra])))
    # Only new inference row needs a feature calculation; existing V4 rows and
    # target values remain byte-derived from the frozen V4 dataset.
    p=price.reindex(dataset.index)
    f={}
    for name in ['aidi','us','eu']:f.update(load_v4('prepare').features(p[name+'_level'],name+'_'))
    for name in ['brent','wti']:f.update(load_v4('prepare').features(p[name].where(p[name]>0),name+'_'))
    f['us_eu_divergence']=p.us_return-p.eu_return
    f['nyh_usgc_divergence']=np.log(p.nyh/p.nyh.shift())-np.log(p.usgc/p.usgc.shift())
    f['regional_volatility_ratio']=pd.Series(f['us_volatility_13w'])/(pd.Series(f['eu_volatility_13w'])+1e-6)
    f['cross_region_dispersion']=(p.us_return-p.eu_return).abs()
    f['regional_direction_agreement']=pd.Series(np.where(p.us_return*p.eu_return>0,1.,0.),index=p.index).where(p.aidi_return.notna())
    f['us_crude_return_spread']=p.us_return-pd.Series(f['wti_return_1w'])
    f['eu_crude_return_spread']=p.eu_return-pd.Series(f['brent_return_1w'])
    fields=pd.DataFrame(f,index=p.index).shift()
    for feature in f:dataset.loc[extra,feature]=fields.loc[extra,feature]
    for feature in ['season_sin','season_cos']:
        dataset[feature]=np.sin(2*np.pi*dataset.index.isocalendar().week.to_numpy(dtype=float)/52.1775) if feature.endswith('sin') else np.cos(2*np.pi*dataset.index.isocalendar().week.to_numpy(dtype=float)/52.1775)
    dataset.loc[extra,'past_direction_return']=price.aidi_return.iloc[-1]
    dataset.loc[extra,'featureAvailableAt']=pd.to_datetime(price.filter(like='_availableAt').iloc[-1],utc=True).max()
    dataset['decisionAt']=(dataset.index+pd.Timedelta(days=4,hours=16,minutes=30)).tz_localize('America/New_York').tz_convert('UTC')
    dataset['targetStart']=(dataset.index+pd.Timedelta(weeks=1)).tz_localize('UTC')
    dataset['targetEnd']=dataset.targetStart+pd.Timedelta(weeks=1)
    dataset['labelKnownAt']=pd.to_datetime(dataset.labelKnownAt,utc=True)
    dataset['us_target']=p.us_return.shift(-1);dataset['eu_target']=p.eu_return.shift(-1)
    dataset['featureAvailableAt']=pd.to_datetime(dataset.featureAvailableAt,utc=True)
    dataset=dataset[dataset.index>=pd.Timestamp(SETTINGS['primaryStart'])].copy()
    original_features=[c for c in f]+['eia_stock_change','eia_production_change','eia_inputs_change','eia_utilization_change','season_sin','season_cos','past_direction_return']
    provenance={};source_coverage={'cftc':0,'eia':0}
    for week,row in dataset.iterrows():
        cutoff=row.decisionAt;entry={}
        price_available=row.featureAvailableAt
        observed=(week-pd.Timedelta(weeks=1)+pd.Timedelta(days=4)).tz_localize('UTC')
        for feature in original_features:
            if pd.notna(row.get(feature)) and pd.notna(price_available) and price_available<=cutoff:
                entry[feature]={'value':float(row[feature]),'availableAt':str(price_available),
                  'observedAt':str(cutoff if feature.startswith('season_') else observed),'sourceId':'v4:'+str(week.date())}
            elif pd.notna(row.get(feature)):dataset.loc[week,feature]=np.nan
        for label,table,features in [('cftc',cot,SETTINGS['cftcFeatures']),('eia',fund,SETTINGS['inventoryFeatures']+SETTINGS['refineryFeatures'])]:
            eligible=table[(table.availableAt<=cutoff)&table.observedAt.notna()&(table.observedAt<cutoff.tz_localize(None))].sort_values(['availableAt','observedAt'])
            source=eligible.iloc[-1] if len(eligible) else None
            if source is not None and cutoff-source.observedAt.tz_localize('UTC')>pd.Timedelta(days=21):source=None
            if source is not None:source_coverage[label]+=1
            for feature in features:
                value=source[feature] if source is not None else np.nan
                dataset.loc[week,feature]=value
                if pd.notna(value):
                    entry[feature]={'value':float(value),'availableAt':str(source.availableAt),
                      'observedAt':str(source.observedAt.tz_localize('UTC')),'sourceId':str(source.sourceId)}
        provenance[str(week.date())]=entry
    dataset['eligible']=dataset.target.notna()&dataset.aidi_return_13w.notna()&dataset.past_direction_return.notna()
    for week,row in dataset.iterrows():audit_row(row,provenance[str(week.date())])
    dataset.index.name='week'
    dataset.to_csv(ROOT/'data/dataset.csv',float_format='%.17g')
    save(ROOT/'data/provenance.json',provenance)
    data_audit.update({'datasetRows':len(dataset),'modelableRows':int(dataset.eligible.sum()),
      'sourceCoverage':source_coverage,'datasetSha256':sha(ROOT/'data/dataset.csv'),
      'provenanceSha256':sha(ROOT/'data/provenance.json')})
    checks={'targetFreeze':integrity['gate']=='PASS','postULSDYears':(pd.Timestamp(cot_audit['primaryEnd'])-pd.Timestamp(cot_audit['primaryStart'])).days/365.25>=8,
        'postULSDRows':cot_audit['primaryRows']>=600,'cftcCoverage':source_coverage['cftc']/len(dataset)>=.8,
        'eiaCoverage':source_coverage['eia']/len(dataset)>=.8,'noFutureFeature':True,'candidateFeaturesWithinLimit':28<=SETTINGS['featureHardLimit']}
    data_audit['gateChecks']=checks
    data_audit['V5_DATA_GATE']='PASS' if all(checks.values()) else 'FAIL'
    save(ROOT/'data/LEADING_SIGNAL_DATA_AUDIT.json',data_audit)
    save(ROOT/'data/DATASET_FREEZE.json',{'datasetSha256':data_audit['datasetSha256'],
      'provenanceSha256':data_audit['provenanceSha256'],'threshold':SETTINGS['threshold'],
      'featureCandidateCount':len(SETTINGS['priceBase']+SETTINGS['cftcFeatures']+SETTINGS['inventoryFeatures']+SETTINGS['refineryFeatures']),
      'holdoutDates':SETTINGS['holdout'],'holdoutModelResultsRead':False})
    milestone('M3','Exact dataset/provenance hashes frozen; no final model scores read')
    set_phase('DATA_AUDIT',dataGate=data_audit['V5_DATA_GATE'],finalHoldoutOpened=False)
    print(json.dumps({k:data_audit[k] for k in ['V5_DATA_GATE','datasetRows','modelableRows','sourceCoverage','datasetSha256']},indent=2))
    if data_audit['V5_DATA_GATE']!='PASS':raise ValueError('LEADING_SIGNAL_DATA_GATE_FAIL')
    return dataset

def load_dataset(final=False):
    path=ROOT/'data/dataset.csv'
    data=pd.read_csv(path,index_col='week',parse_dates=['week'])
    for column in ['decisionAt','targetStart','targetEnd','labelKnownAt','featureAvailableAt']:data[column]=pd.to_datetime(data[column],utc=True)
    data['eligible']=data.eligible.astype(bool)
    if not final:data=data[data.targetStart<pd.Timestamp('2022-01-01',tz='UTC')]
    return data[data.eligible].copy()
