# AYU_INTELLIGENCE_V1_HUMAN_REVIEW_RESULT

**AYU_INTELLIGENCE_V1_GATE = PASS**

## 批准与范围

本轮依据用户明确 APPROVE，仅闭环现有 SIDEWAYS / 震荡快照。基线 `8e299c61dc30c491464aa53627dd4dae040bd3a3`，沿用 `feature/intelligence-v1` 候选分支。未生成新Evidence、Analysis或方向。

- evidenceHash：`0b79cc9e03e3d6291052b20865c5ccd2186bc0a2df70517b78bbb11138abad61`
- analysisHash：`110a25cef206a54637f8cc5e619ad1b019a1ab3b0052f099845d26d763103a5d`
- 执行前真实时间：2026-09-27 22:24:13 北京时间，两个hash严格匹配，快照未过期。
- reviewer：`USER_APPROVED_REVIEW`，kind=`HUMAN`，status=`APPROVED`。
- reviewedAt：`2026-09-27T14:25:31.684Z`（北京时间22:25:31）。十项checks全部为true，未添加评分、概率或confidence。
- 最早截止仍为 `2026-09-28T00:00:00.000Z`，即 **2026-09-28 08:00 Asia/Shanghai**，未延长。

| 复核项 | 结果 |
|---|---|
| Evidence Gate | PASS |
| Grounding Gate | PASS |
| Human Review Gate | PASS |
| Forecast Contract | PASS |
| Evidence/Analysis精确绑定 | PASS |
| 检查时快照未过期 | PASS |
| 全量回归 | 96/96 PASS |
| issues | [] |

## 候选缓存与页面

现有 `npm run intelligence:run` 在22:25:31成功运行，生成 `LIVE / AYU_INTELLIGENCE_V1 / SIDEWAYS / 震荡`，horizonDays=7，validUntil保持不变。generatedAt仍为原分析生成时间21:49:43，未用批准时间伪装新分析。

完整Gate PASS后，仅将候选分支 `dist/data/forecast-config.js` 的active source从NONE切为AYU_INTELLIGENCE_V1，以验证当前页面显示。APIZero预测源继续禁用。

页面维持“未来7天油价趋势参考 / 震荡 / 主要依据 / 反向因素”。原三条理由、两条反向因素未改。没有改页面布局、HTML、样式、价格来源、列表或Gate逻辑。

有效期到达后，合同及服务在读取时自动返回UNAVAILABLE；打开的前台页面沿用已有60秒复查机制，显示可能最多滞后一个轮询周期。磁盘历史保留当时LIVE记录，不改写历史。该批准只绑定这两个hash，不适用于下一份情报，也不永久有效。

本地实际交互页：[http://127.0.0.1:4398/](http://127.0.0.1:4398/)。逐一操作11个地区，全部价格LIVE、趋势LIVE/SIDEWAYS；390px无横向溢出，浏览器warning/error为空。福建8.29元/升估算9869元/吨，参考密度仍为0.84 kg/L。

## 历史

新增不可覆盖记录：

`data/forecast-history/2026-09-27T14-25-31.855Z-intelligence-a4979cb2c93f.json`

包含完整Evidence、Analysis、Human Review、来源核验记录、Gate结果、输入hash、8条来源URL及validUntil。原PENDING/FAIL历史字节未改；现有wx独占创建机制拒绝同名覆盖。

`dist/data/forecast-cache.json`沿用原项目的Git忽略规则；本地真实文件及独立交付副本均为LIVE候选，等值forecast已在提交的历史中保存。新检出目录可执行现有离线命令重建缓存，届时仍按真实时间执行Gate，过期不能重建成LIVE。

## 修改文件与原因

- `intelligence/human-review.json`：记录本轮明确授权。
- `intelligence/latest-review.json`、新增forecast-history：保存现有Gate实际PASS和完整批准快照。
- `dist/data/forecast-config.js`：Gate通过后启用候选来源，便于验证本地真实页面。
- `tests/intelligence-human-review.test.mjs`：新增12项批准闭环回归。
- `tests/forecast.test.mjs`与`tests/intelligence.test.mjs`：只调整上一阶段NONE/PENDING的状态断言；保留未批准APIZero禁用、PENDING拒绝和请求失败降级断言。
- 本报告：记录批准来源、边界、结果和复现位置。

## 验证

修改前84/84通过；修改后96/96通过，无跳过。新增12项分别覆盖：精确hash与真实批准、evidenceHash变化、analysisHash变化、批准早于分析、截止瞬间Gate/contract/service均不可用、逐项缺少任一check、空reviewer、不可覆盖历史、31省价格链、11地区、0.84吨价、已启用趋势不能掩盖价格503或放宽价格发布门禁。

涉及时间的新增测试在记录的批准时刻重放，并单独推进至截止边界；没有更改系统时钟或延长真实缓存。

保护核验：57个基线文件/缓存字节一致，包括Evidence、Analysis、source review、原历史、Gate实现、价格链、UI、11地区列表及所有既有workflow。真实31省缓存未重抓、未修改，价格Gate仍PASS。source scan PASS，diff检查PASS。

公开main仍为 `eaeb3ada685099b4fe4d9cb66b6d3a7cc3488908`；公开站点HTTP200，HTML哈希与稳定PUBLIC V0一致。本轮未合并main、未修改公开Pages或workflow，未调用新数据API、未创建付费资源，未访问其它生产项目。

## 当前限制

PASS仅表示这份快照在本次核验时间通过批准与工程门禁，不表示预测准确率已被验证或允许发布。截止后需要下一轮任务刷新；本轮不会自动收集。当前候选分支没有匹配现有workflow的push过滤，测试证据是本地96/96，不声称新增远端CI运行。

完成后停止，等待下一步指令。
