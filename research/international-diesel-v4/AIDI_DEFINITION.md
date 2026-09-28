# Ayu International Diesel Index 定义

Primary在训练前选择 **LOCAL-CURRENCY**：美国USD报价收益与欧洲EUR报价收益各占50%。产品先描述各区域柴油价格方向，非统一币种采购成本。权重由地区代表性冻结，不由Test决定。

1. NYH / USGC：真实日价的周算术均值，各自计算log return；US区域收益 = 两者log return的简单平均。
2. EU：固定当前EU27国家采样框架，英国及官方EU/EUR加权汇总列排除；同一对相邻calendar周，取共同可用国家的未含税柴油log return中位数（最低20个）。中位数选择发生在训练前，理由是不用历史消费权重、限制孤立国家修订和结构差异影响；不是用Test优化国家。
3. `AIDI_return_t = 0.5 * US_return_t + 0.5 * EU_return_t`。index level从100链式累积log return；不平均USD/gallon与EUR/litre。
4. 遇空周，index恢复时累积真实跨期端点变化并保留空周；单周Target只有相邻7日端点真实有效时成立。每个地区均不可用时不把另一地区权重放大至100%。

此处“International”表示两个独立跨国区域的价格方向合成：美国两个柴油现货市场 + 欧洲多个国家汽车柴油未税参考价。它**不代表全球消费权重、不涵盖亚洲训练Target、不代表船用MGO、不预测中国省级调价或成交价**。美国现货与欧洲消费价统计层级不同；欧洲去税仍含零售流通成本、部分生物柴油/能源政策影响。

Sensitivity固定为USD-CONVERTED：EU_return + 同周USD/1EUR汇率log return，再与US各占50%。仅报告Target相关/方向/分布变化；使用current FX series，不能当PIT预测增量。禁止用敏感性Test结果回头换Primary。

描述性Current State：最新已发布完整AIDI周的1/4/13w历史收益，在该周之前的扩展历史中计算各自percentile，三项percentile中位数 `<1/3 WEAK`、`>2/3 STRONG`、其余NEUTRAL。percentile是历史排序，不是未来上涨概率。源日期与计算日期同时显示。
