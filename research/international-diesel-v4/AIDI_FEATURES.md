# 特征与容量

特征均按周构建，统一观察lag1，再检查availableAt。基本报价缺失不补值；特征层的median imputation与standard scaling只在Train拟合。未使用日本、Asia MGO、人民币价格或中国调价Target。

|组|冻结公式/处理|数量|
|---|---|---:|
|AIDI自身|log return 1/2/4/8/13w；单周log return标准差4/13/26w；level/MA−1的MA4/13/26；r4/4−r13/13；相对此前累计峰值drawdown|13|
|区域分化|US−EU单周收益，NYH−USGC单周收益，US/EU13w波动率比例，区域收益绝对差，区域同方向0/1|5|
|原油|Brent/WTI各1/2/4/8w收益、4/13w波动|12|
|return spread|US柴油return−WTI return；EU柴油return−Brent return|2|
|EIA行业|distillate库存/生产、炼厂原油投入各环比；利用率percentage-point变化|4|
|季节|观测decision周的sin/cos，周期52.1775|2|

Primary Composite合计38，冻结上限40。US-only和EU-only分别用该地区相同13个自身特征，保留相同原油/EIA/季节上下文与自身return-spread（US另保留NYH/USGC分化），彻底去掉另一地区柴油特征。这是对**同一AIDI Target**的公平柴油地区信息消融；不是用US Target和EU Target各自分数比较。

没有伪造绝对crack：美国可按42 gallon/barrel算价格差，但欧洲汽车柴油价含流通成本，炼制收率/密度/生物柴油/品质不一致，所以本轮两者都用return spread。不能将其命名为可成交crack spread。

模型容量预先冻结：Logistic C=.05；Ridge alpha100；ElasticNet alpha.001、L1ratio.25；boost depth2、minimum leaf25、60 iterations、no early stopping；quantile同容量7个预设分位点。无Test特征筛选、无Test树深选择。38个输入仍相对初始约200个Train周偏多，故需要真正out-of-sample证据；正则化不能代替增量验证。

独立地区13项全保存于weekly-dataset，未全部塞进Composite。rolling波动的实际缺失保留；临近假期/空周可能造成rolling窗缺失。Drawdown只用当时之前累计峰值；无full-sample分位数特征。Current State percentile用严格过去历史，单独描述用途。
