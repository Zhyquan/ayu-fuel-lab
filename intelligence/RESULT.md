# AYU_FUEL_INTELLIGENCE_V1_RESULT

## 1. 本轮结论

**AYU_INTELLIGENCE_V1_GATE = FAIL**

流程及方向候选已完成；唯一当前阻塞是用户要求的人工复核尚未完成。Codex 的来源核查不能代替 HUMAN approval。未激活正式预测源。

| 检查 | 结果 |
|---|---|
| Evidence 结构、日期、时效、来源核验记录 | PASS |
| 理由逐条引用与方向协议 | PASS |
| HUMAN Review | PENDING |
| INTELLIGENCE_REVIEW_GATE | FAIL / HUMAN_REVIEW_PENDING |
| 分析候选 | SIDEWAYS / 震荡 |
| 正式 candidate cache | UNAVAILABLE |
| activeForecastSource | NONE |
| 本地自动测试 | 84/84（原有61 + 新增23） |
| 11地区实际点击、320/390px、0.84估算 | PASS |
| source scan / diff whitespace | PASS |

“震荡”表示本次证据中的上、下行压力并存，不表示未来省级柴油价确定不变，更不表示已验证预测准确率。

## 2. CURRENT_INTELLIGENCE_RUN

- Evidence 核验汇总：2026-09-27 21:40:55 北京时间。
- 只读冻结包后生成分析：2026-09-27 21:49:43 北京时间。
- 本地离线 Gate 与存档运行：2026-09-27 21:52:58 北京时间。
- 判断期：分析生成时起未来7天；情报有效期与判断期不同。
- 最早证据截止：**2026-09-28 08:00 北京时间**。此前仍须人工复核；之后必须重新收集、分析与复核。
- 本次只是一次真实的人工/Codex触发分析，不是持续运行、回测或准确率证明。

### 主要依据（3）

1. **中东运输风险仍在**（G_RISK，UP，风险推论）：报道中的通航提议不证明供应风险消失。
2. **国际原油周五回落**（M_PRICE，DOWN，观察事实）：仅用最近完整收盘与上一日变动，未把一日变化当作确定的七日趋势。
3. **美国原油库存增加**（I_CRUDE，DOWN，库存事实）：价格压力方向属于分析推论。

### 反向因素（2）

- **美国柴油相关库存偏低**（I_DISTILLATE，UP）：与美国商业原油库存增加的信号方向相反。
- **航道仍有原油运出**（G_FLOW，DOWN）：与供应风险构成反向因素；不代表运输已恢复正常。

PRIMARY 上下行同时存在，包内没有能消除冲突的证据，按照固定协议输出 SIDEWAYS。没有概率、置信度或预计涨跌金额。所有文本逐字绑定 Evidence 的 displayText；模型不能往理由里增加新的事实。

### 本期证据与口径

| 类别 | 核验结果 | 日期与来源 |
|---|---|---|
| 市场 | Brent 104.32、WTI 92.41 美元/桶；较前日分别回落2.28、2.20；周表现并非同向 | 9月25日收盘，[Reuters公开转载正文](https://www.marketscreener.com/news/oil-prices-slide-about-2-as-us-iran-explore-path-out-of-war-ce785adfd180f425) |
| 产油政策 | 七国十月维持九月要求产量，下次会议10月4日；政策不等于实际产量 | 9月6日仍有效的 [OPEC公告](https://www.opec.org/pr-detail/613-6-september-2026.html) |
| 供应风险 | 冲突中的航道与能源供应风险；有条件提议尚不是已达成协议 | 9月26日 [Reuters / CNA](https://www.channelnewsasia.com/world/iran-us-trump-reject-peace-plan-wsj-report-6412236) |
| 航运反向证据 | 截至9月25日仍有原油外运；周内33.7百万桶与前完整周49.2百万桶口径不同，未直接算跌幅 | 9月27日 [Reuters / Business Recorder](https://www.brecorder.com/news/amp/40441372) |
| 库存/供需 | 原油库存增加2969千桶；馏分油库存减少0.4百万桶且低于五年同期均值12%；加工量、产品供应代理已检查 | 发布9月23日，统计周9月18日，[EIA JSON](https://ir.eia.gov/wpsr/psw00.json)、[同批次摘要](https://ir.eia.gov/wpsr/summary.txt) |
| 宏观 | 检查9月16日官方材料，超出本轮7天窗口，不硬填弱信号；未声称本周没有任何宏观事件 | [Federal Reserve](https://www.federalreserve.gov/monetarypolicy/fomcprojtabl20260916.htm) |
| 国内背景 | 最新公告存在调控，柴油实际每吨上调385元；下一窗口未核实，保持 null | 9月24日 [国家发改委](https://www.ndrc.gov.cn/xwdt/xwfb/202609/t20260924_1407824_ext.html) |

EIA官方索引核对下一报告日9月30日；OPEC与Fed终端请求403，但浏览工具打开正文，访问方式如实记录。没有把403记录成200。

### 数值冲突及 APIZero 处理

Yahoo Brent页面历史表104.32与报价栏/先前JSON约97.44不一致，且本轮直接接口429。原因尚未查明，明确隔离，不用于主判断，也未追改前轮原始历史。Reuters明确收盘正文作为本轮市场证据；辅助EnergyNow同值不计作第二个独立原始行情来源。

APIZero只复用同日已保存原始响应（12:58:45 UTC）：Brent97.484、WTI92.338、原方向“下跌”。与Ayu SIDEWAYS不一致只记录；原行情没有可核验时刻且幅度符号相反，仍不合格。raw confidence、原幅度和分析文本只留内部Evidence/历史，不进入前端缓存。

## 3. 改动与运行方式

新增 `intelligence/` 证据、协议、分析与复核记录；`scripts/intelligence-review.mjs` 执行门禁，`scripts/run-intelligence.mjs` 离线写缓存与追加历史。新 `dist/data/intelligence-{contract,service,view}.js` 承载方向专用合同和显示。

只对 `dist/app.js` 的趋势模块入口、`dist/index.html` 趋势说明、`dist/styles.css` 理由列表、`dist/data/types.d.ts` 追加类型、`package.json` 手工命令作必要修改。APIZero旧合同/adapter/service和MOMENTUM研究、测试与历史全部保留。

操作顺序：

1. 人工/Codex核验六类公开来源并冻结 `current-evidence.json` 与 `source-review.json`。
2. 按 `ANALYSIS_PROTOCOL.md` 只读取冻结包，生成 `current-analysis.json`。
3. 人工逐条审核真实来源、日期、评论/事实、冲突、没有补造事实、依据、反向证据、结论与标题偏差，在 `human-review.json` 填入真实复核人、时间、两个精确hash及十项检查。当前均为 PENDING/null。
4. `npm run intelligence:run`。无联网、无模型API；FAIL退出码1，仍保存失败历史并写安全UNAVAILABLE缓存。只有证据、grounding、HUMAN均通过才输出LIVE候选。
5. 此命令不会改变active source，不会部署或合并。启用仍需后续指令。

运行脚本使用 `wx` 独占创建历史文件，拒绝同名覆盖；历史包含完整包、分析、source review、human review、Gate、输入hash和来源URL。它是应用层追加存档，Git仍需保护历史；不是不可修改的外部审计服务。

证据不足或主来源关键冲突降级UNAVAILABLE；有效PRIMARY方向相反才是SIDEWAYS。缓存最多24小时，同时服从最早证据期限；页面每分钟复核，过期停止显示方向。工作日规则保守，不是交易所节假日库。

## 4. 验证

`npm test`：84/84，无跳过。新增23项覆盖全部15项要求，另含人工批准绑定hash、真实pending/NONE不请求、APIZero不影响结论、过期/未来时间/额外字段/HTML拒绝、旧新闻转载不刷新、库存下一批到期、周末收盘及坏JSON安全缓存。

测试中的HUMAN APPROVED仅存在测试内存和临时目录，不是实际人工批准，未写入交付缓存。

实际浏览器验证：11省逐个点击，每个价格LIVE；福建8.29元/升估算9869元/吨，广西8.36估算9952；11地区全程方向不可用时价格正常。两页面320/390宽度无横向溢出，浏览器warning/error均空。交互页可操作；方向审阅页是本次真实分析的静态快照，显著标记待人工复核。

`PRESERVATION_CHECK.json`核验42个未授权修改的基线文件字节不变（包括价格采集/校验/service、0.84换算、旧趋势/forecast研究和Actions）。价格缓存与前轮完全相同：31省，生成时间2026-09-27T11:01:00.875Z；本轮没有重抓省价。

远端main仍为 `eaeb3ada685099b4fe4d9cb66b6d3a7cc3488908`；公开网页HTTP200且HTML与该稳定main完全相同。当前Actions最近一条failure是既有 `SIMULATE_API_FAILURE=1` 演练，部署跳过，之前成功运行36314289393。本轮没有触发main工作流。

## 5. 风险与待办

- **人工复核未完成，整体Gate保持FAIL。** 十项来源语义核验不能由字段验证证明，不能把Codex自审声称为人工批准。
- 来源数字/陈述均可追溯，但免费市场与新闻读取可限流/拒绝，不能据一次采集宣称稳定自动采集。
- “过去变化→未来压力”的因果解释需人复核，SIDEWAYS不代表准确率承诺；暂无预测概率、幅度模型或历史效果评估。
- 信息变化快；截止时间到达或改动任一输入后，旧人工确认无效，须重新运行。
- 首轮含代码搭建与研究，不声称已证明每轮几分钟完成。之后流程已收敛为四个JSON、一次手工命令与人工复核。
- 没有付费资源/数据/模型调用，没有新增自动任务，没有读取或连接其它生产项目。未合并main、未更新公开Pages。

## 6. 本仓库交付位置

`intelligence/ANALYSIS_PROTOCOL.md`、`current-evidence.json`、`current-analysis.json`、`source-review.json`、`human-review.json`、`latest-review.json`；`data/forecast-history/`新intelligence记录；`tests/intelligence.test.mjs`；`dist/data/intelligence-*.js`。

分支 feature/intelligence-v1，基线964c24e3b68c17b16c54d548e4f91ed40171348a。本地报告与浏览器证据另交付。未合并main，等待人工确认。
