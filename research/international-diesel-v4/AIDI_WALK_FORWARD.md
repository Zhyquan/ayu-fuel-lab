# 扩展窗口与隔离

训练前冻结：Validation2016、2017；Test2018–2025完整年度与2026截至最新可兑现标签的部分年度。按decision所在UTC calendar year划分，非随机split。2026部分年单列，不冒充全年。

每一fold：早于前一年度的所有mature Train → 前一calendar year Calibration → 当年Validation/Test。边界purge依据labelKnownAt严格小于后一block第一decision。因为US与EU发布滞后，Target兑现日可以晚于7天观察期。

模型只在Train拟合；Platt/Isotonic只在Calibration拟合；校准效果仅在后续Validation/Test评价。连续模型的残差分布来自Train中最后52个mature周，由之前的Train拟合后预测产生，再用全部Train重拟合均值模型。不是训练内拟合残差、不是Test误差bootstrap。分布只生成研究回测概率。

六个threshold × 六个route × 三个calibration共有108种候选；相同固定模型容量、相同Validation2016/17，没有无限搜索。Threshold须Train和Validation三个class各≥15%、最大≤60%，再选Validation Brier/frequency与LL/frequency比率均值最小；经济解释见threshold报告。US/EU route在同一threshold下独立用Validation选择。

先执行`backtest.py select`，保存不可覆盖的`SELECTION_FREEZE.json`及dataset/spec hash，再执行`backtest.py test`。Test结果不得更新selection。最终`MODEL_FREEZE.json`保存选择与测试概率哈希；日本只允许随后分析。Binary则保持主threshold，独立仅用Validation选择binary路线，再一次性运行binary Test；不回改三分类。

年度逐次拟合与purge记录、每fold Train/Cal/Test与class数量由报告程序从`results/model-result.json`输出到`AIDI_DATASET_REPORT.md`。原始数据、整理CSV、JSON分数与冻结文件一起保存。复现默认离线；重新下载不是必需且不得静默替换raw快照。

Binary最早Train仅76个明显变动周；连续路线warm最低40个Train、honest residual至少20个（首fold36个、后续最多52个），与主模型warm最低60个区分。该边界修复发生在binary Test前；Main selection与Test没有改变。
