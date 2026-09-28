# CFTC ULSD continuity audit — M1

M1_CFTC_CONTINUITY_GATE = PASS (POST_ULSD_ONLY)

[CME specification announcement](https://investor.cmegroup.com/static-files/6e5aa35b-89fc-4372-ba40-f08a3a422ba7): May 2013 delivery changed maximum sulfur from 2000ppm to 15ppm. [June title notice](https://www.cmegroup.com/tools-information/lookups/advisories/market-regulation/SER-6687R.html): effective June 3, title became NY Harbor ULSD Futures; exchange code HO and rule chapter stayed unchanged. These are distinct changes: physical specification versus administrative title.

1. 2009–2012 observations represent the old Heating Oil delivery specification, although late pre-transition positioning can include future ULSD delivery months.
2. The aggregate COT series cannot separate these delivery regimes. Unchanged code is insufficient evidence of economically identical positioning.
3. Specification, hedging use, liquidity, and participant composition can produce a structural break.
4. Primary is option A: CFTC report dates >= 2013-06-04, first Tuesday after the completed name transition. No pre-2013 row or lagged change is admitted. This is a conservative study boundary, not a claim that all participant regimes became identical overnight.

Official reporting identifier is CFTC contract-market code **022651**, exchange NYME, **Disaggregated Futures Only**; CME HO alone is not the filtering key. [CFTC 2022 notice](https://www.cftc.gov/MarketReports/CommitmentsofTraders/HistoricalSpecialAnnouncements/index.htm) changed the displayed name (including historical USLD spelling) without changing the contract code or data elements.

Raw anonymous PRE query is retained with URL, original response bytes and SHA256. Older downloaded rows are continuity-audit evidence only; automated boundary test rejects 2012 positions. There is no primary pre-2013 splice, regime indicator or exploratory holdout comparison.
