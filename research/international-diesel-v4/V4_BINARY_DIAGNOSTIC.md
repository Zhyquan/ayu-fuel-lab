# 明显涨跌二分类诊断

主三分类FAIL后执行；沿用θ=0.75%，回溯排除future FLAT，**运行时无法提前知道哪些周应排除**。不能作为上线过滤器。

Binary仅用Validation选 quantile_cdf + raw，日本未使用。Test n=272，DOWN/UP独立方向样本。主要结果Brier=0.4592、LL=0.6506、accuracy=61.03%、ECE=0.0333。频率baseline Brier=0.5065、LL=0.6997。

|方案|n|Brier|Log Loss|ECE|Accuracy|Macro F1|DOWN/FLAT/UP recall|
|---|---|---|---|---|---|---|---|
|baseline/frequency|272|0.5065|0.6997|0.0652|45.59%|0.4548|44.09%/46.90%|
|baseline/dominant|272|1.0455|2.1378|0.5241|45.59%|0.4548|44.09%/46.90%|
|baseline/continuation|272|0.6996|1.4367|0.3440|63.60%|0.6346|61.42%/65.52%|
|baseline/reversal|272|1.2220|2.4955|0.6160|36.40%|0.3640|38.58%/34.48%|
|binary|272|0.4592|0.6506|0.0333|61.03%|0.6102|63.78%/58.62%|

两个proper score均胜频率=True。这只是条件方向诊断；主三分类同时存在概率覆盖/类别塌缩/地区增量/亚洲证据门槛，不可把“排除难预测FLAT”的结果替代主Target。

Test DOWN/UP = 127/145。完整年份中两个proper score同时不差于frequency为5/8。方向延续基线accuracy=63.60%，高于选定binary模型61.03%；方向信息并非全部来自复杂模型。最早binary Validation fold仅76个Train样本，连续分布路线以最少40个warm Train拟合、余下36个honest residual；后续residual窗口最多52周。该调整只用于binary、发生在binary Test打开前，主三分类没有改变。
