"""Reports distinguish source coverage, admissible history and model execution."""
import json

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import pandas as pd

from audit import CONFIG, DATA, ROOT, PROXY, US

REPORTS = ROOT / 'reports'


def table(rows, header):
    return '\n'.join(['| ' + ' | '.join(header) + ' |', '| ' + ' | '.join(['---'] * len(header)) + ' |'] + ['| ' + ' | '.join(map(str, row)) + ' |' for row in rows])


def sources_report(stats):
    catalog = json.loads((DATA / 'source-catalog.json').read_text())['sources']
    rows = [[s['name'], s['region'], s['frequency'], s['status']] for s in catalog]
    text = '''# V3 全球柴油数据源侦察

研究日：2026-09-28。先核对访问与许可，再获取被允许的价格历史；没有训练后回填来源调查。

**SOURCE_COVERAGE_GATE = PASS；GLOBAL_DIESEL_DATA_GATE_V3 = FAIL。**

最低“US + 非US 柴油 proxy”的长期价格覆盖已找到：EIA NYH / USGC 与 MBIE Singapore-linked 柴油进口成本。失败点是非美国成分没有 ≥5 年可核验的历史发布版本，无法满足用户要求的 publication / availableAt 无泄漏规则。“可下载22年历史”和“22年当时可用的历史”是两个结论。没有把许可不明、终端零售或受政策影响的牌价换名来通过 Gate。

不是断言世界上不存在合法免费非美国数据，也不是因为只有美国价格。以下是本轮实际访问与许可核验的范围；未知字段明确写 UNKNOWN。元数据中的文件/公告日期不冒充已核实的最新报价日。

## 来源概览

'''
    text += table(rows, ['来源', '地区', '频率', '准入状态']) + '\n\n'
    fields = [('region', '地区'), ('commodity', '商品定义及柴油/MGO/gasoil 匹配'), ('unit', '单位'), ('marketType', 'spot / futures / proxy'), ('frequency', '频率'), ('earliest', '历史起点'), ('latest', '最新日期/元数据日期'), ('free', '免费与否'), ('loginRequired', '是否登录'), ('apiKeyRequired', '是否 Key'), ('programmaticAccess', '程序化访问'), ('researchUse', '研究许可'), ('publicDerivedUse', '公开衍生结果许可'), ('pitHistoryVerified', '历史发布版本已验证'), ('trainingSuitability', '适合训练'), ('realtimeSuitability', '适合实时生产'), ('status', '本轮状态'), ('note', '事实与限制')]
    for source in catalog:
        text += f"## {source['name']}\n\n"
        text += table([[label, 'UNKNOWN_NOT_OBTAINED' if source[key] is None else str(source[key]).replace('|', '/') ] for key, label in fields], ['字段', '核验结果']) + '\n\n'
        text += '出处：' + '、'.join(f'[来源 {i+1}]({url})' for i, url in enumerate(source['urls'])) + '。\n\n'
    raw = stats[PROXY]
    text += f'''## 实际取得的数据与时间证据

- 两条美国 current CSV 各 5292 个工作日行；初次发布 ZIP 是本轮重新匿名下载，不使用 V2 标签。NYH 有 {stats[US[0]]['pitValidRows']} 个有效初值，USGC 有 {stats[US[1]]['pitValidRows']} 个有效初值；都从 2011-04-06 开始。
- NYH 隔离 1 个“发布日期早于观察日”记录；USGC 隔离 2 个记录，其中 2022-02-22 的初值为 0，未以最新修订价格补回。初值缺失 129 / 130 行也没有填充。
- MBIE original-source CSV 为 35100 行、7列；柴油进口成本 {raw['rows']} 周，{raw['firstObservation']}–{raw['latestObservation']}，Final {raw['statusCounts']['Final']} / Provisional {raw['statusCounts']['Provisional']}。完整响应与部分超时响应分别记录；未把半个文件当成功。
- 原站普通匿名访问返回 403；Figure.NZ 对该开放数据的原始文件镜像返回完整 200 CSV。使用的是已公开授权的独立再分发，不是绕过付费或授权阻断。[Figure.NZ 表格与出处](https://figure.nz/table/sSjWVpSTr3cfhCMY)记录本版本发布于 2026-09-23；原始数据许可来自 [MBIE](https://www.mbie.govt.nz/building-and-energy/energy-and-natural-resources/energy-statistics-and-modelling/energy-statistics/weekly-fuel-price-monitoring)。
- [MBIE 修订说明](https://www.mbie.govt.nz/building-and-energy/energy-and-natural-resources/energy-statistics-and-modelling/energy-statistics/weekly-fuel-price-monitoring/impacts-of-the-2026-middle-east-conflict-on-weekly-fuel-monitoring)明确：2026-03-18 暂停、07-01 恢复；09-23 回修 02-27 起的成本，柴油平均约增加 10 NZ cents/L。因此旧行的 Final 标志也不证明其数值在过去已公开。
- 原始 URL 的 Internet Archive CDX 月度查询（含/不含 CSV MIME 过滤）返回 200，但本次限定查询均无 capture records。官方历史版本搜索也未形成可审计的 ≥5 年周度 vintage 集合。这个结果只说明本轮未取得，不证明所有历史档案不存在。

## 准入解释

5年最低历史与至少 US + 非US 的数值标准未放松。数据“可用”还必须满足原要求第8、14、16节的可得时间约束。最新回修版本不能全部按旧观察日投入预测。两条 US 腿有 15年以上初次发布历史，非US proxy 的已验证过去可得时间为零年，故严格 Gate FAIL。

没有使用“通常下周三发布”生成 fictitious availableAt；本快照统一保留保守 vintageAvailableAt，历史 availableAt 仍为 null。回顾性共同波动可研究；正式 Target、模型和用户概率不可研究性替代通过。参见[数据审计 JSON](../data/source-audit.json)、[访问审计](../data/access-audit.json)及[数据许可出处](../data/README.md)。
'''
    (REPORTS / 'GLOBAL_DIESEL_V3_DATA_SOURCE_REPORT.md').write_text(text)


def validation_report(diagnostics):
    rows = []
    for name, value in diagnostics['weeklyPairs'].items():
        q = value['rolling52wQuantiles']
        rows.append([name + ' vs SG-linked NZ import proxy', value['n'], f"{value['correlation']:.6f}", f"{100 * value['directionAgreement']:.2f}% (n={value['directionN']})", f"{q['0.5']:.6f}", f"{q['0.0']:.6f}–{q['1.0']:.6f}"])
    text = f'''# Composite Validity：同期诊断

**PROMISING_RETROSPECTIVE_PROXY_ONLY；正式 Composite 仍 NOT_ADMITTED。**

数据为最新修订价格；用途仅检查共同波动，不作可得时间合格的预测评价。{diagnostics['weeklyReturnStart']}–{diagnostics['weeklyReturnEnd']}，{diagnostics['weeklyCommonN']} 个共同周收益。

{table(rows, ['配对', '周收益 n', 'Pearson r', '同期方向一致', '52周滚动中位数', '52周滚动范围'])}

## 1日 / 7日的不同含义

{table([["NYH vs USGC，真实相邻自然日", diagnostics['usOnly1CalendarDay']['n'], diagnostics['usOnly1CalendarDay']['correlation']], ["NYH vs USGC，精确7自然日", diagnostics['usOnly7CalendarDays']['n'], diagnostics['usOnly7CalendarDays']['correlation']], ["US vs MBIE，1自然日", "不可计算", "null：源是周度"], ["US vs MBIE，7日周均变动", diagnostics['weeklyCommonN'], "见上表"]], ['配对 / 窗口', 'n', '相关性'])}

US 日度计算只配对实际观察值，周末/休市缺口不填价格。跨地区诊断将 US 的真实报价取 W-FRI 周均值（每周至少3个实际值），与 MBIE 周五标记的周数据合并。计算相邻7日周均值的 log return；不声称它是周五 close 到下一周五 close。USD/gal 与 USD/L 不加总价格水平。

MBIE 转换：`NZD cents/L × USD/NZD / 100 = USD/L`，汇率来自同一公开表。未还原 Argus 原始 spot。完整周网格保留，缺周不会被当成相邻7日；无 forward-fill、插值或长时间重复周价。方向比较剔除绝对 log return ≤1e-12 的零变动，并单独给出 n。52周滚动窗口只向后看同期收益。

![52周滚动相关性](comovement-rolling-v3.png)

## 可以和不可以得出的结论

非美国成本 proxy 与美国柴油有明显同期共同移动；因此不能说“非美国没有数据”或“区域长期互不相关”。但约82%的同期方向一致不是未来7日预测准确率，相关性不证明先行预测信息、模型增量或概率校准。

缺欧洲、缺直接亚洲 MGO、缺非美国长期 PIT vintage，使全球/船燃代表性及无泄漏训练仍未成立。本轮未建立正式 Global Diesel Composite；没有用两条高度相关的美国腿掩盖缺少其它区域的问题。MGO 的独立相关性、未来方向与 Brier 仍 N/A。
'''
    (REPORTS / 'GLOBAL_DIESEL_COMPOSITE_VALIDATION.md').write_text(text)
    fig, ax = plt.subplots(figsize=(9, 3.8))
    for name, value in diagnostics['weeklyPairs'].items():
        frame = pd.DataFrame(value['rollingSeries'])
        ax.plot(pd.to_datetime(frame.date), frame.correlation, linewidth=1.25, label=name + ' vs Singapore-linked NZ import cost')
    ax.set(title='Retrospective co-movement, latest revised vintage (not forecast accuracy)', ylabel='52-week return correlation', ylim=(0, 1.02))
    ax.legend(loc='lower left', fontsize=8)
    ax.grid(alpha=.2)
    fig.tight_layout()
    fig.savefig(REPORTS / 'comovement-rolling-v3.png', dpi=160, metadata={'Software': 'Ayu Fuel Lab V3 retrospective source audit'})
    plt.close(fig)


def result_report(stats, gates):
    answers = [
        ['1. Composite 由哪些市场组成？', '正式指数未建立。候选为 NYH + USGC + Singapore-linked NZ importer-cost proxy；Europe 未获授权。'],
        ['2. 亚洲市场有没有真正进入？', '新加坡 gasoil 输入的进口成本 proxy 进入了同期诊断；没有直接亚洲 MGO，也没有进入正式预测 Target。'],
        ['3. 能否合理代表国际柴油方向？', '同期共动有支持，但全球/船用油产品代表性未验证，当前不能使用正式全球强弱标签。'],
        ['4. 7日方向有预测价值吗？', 'UNKNOWN；无合格 Target，未训练。不能把同期相关性当预测价值。'],
        ['5. 相对单 NYH 提升？', 'N/A，未形成同一 V3 Target 的样本外比较。'],
        ['6. 相对最强 baseline 提升？', 'N/A；基线和模型均未评分。'],
        ['7. Brier / Log Loss？', 'N/A，没有 V3 样本外概率；未搬入 V2 分数。'],
        ['8. 校准合格？', '未验证，Platt / isotonic / multinomial 未运行。'],
        ['9. 60%预测实际兑现率？', 'N/A，没有预测；DOWN / FLAT / UP 的55–65%桶均无模型样本。'],
        ['10. FLAT 是主要失败来源吗？', 'UNKNOWN；本轮是数据准入阻断，阈值未选、三分类未运行。'],
        ['11. 明显涨跌二分类可预测吗？', 'UNKNOWN；NOT_RUN_DATA_GATE_FAILED，不能改用旧目标制造诊断。'],
        ['12. 对亚洲 MGO 的代表性？', '尚未证明；MGO_EXTERNAL_VALIDATION_LIMITED。进口成本不是港口 MGO 报价。'],
        ['13. 有资格向用户显示百分比？', '没有；当前国际市场 UNAVAILABLE，未来7天“模型验证中”。'],
    ]
    text = f'''# AYU_GLOBAL_DIESEL_FORECAST_V3_COMPOSITE_001

**GLOBAL_DIESEL_DATA_GATE_V3 = {gates['GLOBAL_DIESEL_DATA_GATE_V3']}**

**GLOBAL_DIESEL_MODEL_GATE_V3 = {gates['GLOBAL_DIESEL_MODEL_GATE_V3']}**

执行状态：**NOT_RUN_DATA_GATE_FAILED**。这是数据可得时间不足造成的模型未准入，不是模型训练后评分失败，更不是已经证明方向不可预测。

## 本轮完成的研究

- 新研究分支 `research/global-diesel-forecast-v3-composite`，基于冻结 V2 SHA `{CONFIG['baseSHA']}`；只新增 `research/global-diesel-v3/`。
- 侦察19项来源，覆盖 Europe、US、Asia、Asia Pacific、公开消费者价/统计替代源，逐项记录商品、频率、覆盖、访问、许可与产品限制。
- 两条美国初次发布历史分别重新下载，15.463 年，有效初值 {stats[US[0]]['pitValidRows']} / {stats[US[1]]['pitValidRows']}；异常隔离，缺失不填最新修订数值。
- 合法开放取得 MBIE {stats[PROXY]['rows']} 个周度柴油进口成本，22.404 年；这是非美国 proxy，证明不是只能获取美国价格。新加坡相关成本与 NYH / USGC 同期周收益 r=0.762651 / 0.752060；不作为未来预测结果。
- 原始响应、下载 metadata、SHA256、单位转换、同期相关/方向/滚动诊断、Gate、状态、失败候选和测试均独立保存。

## 为什么严格 Data Gate 仍失败

`SOURCE_COVERAGE_GATE = PASS`（长期价格覆盖）不等于 `GLOBAL_DIESEL_DATA_GATE_V3 = PASS`（可用于本轮无泄漏研究的长期历史）。MBIE 最新历史含暂停后回填及事后回修；原站 ordinary access 为403、授权开放镜像提供最新版本，但本轮未取得 ≥5 年的初始/历史发布 vintage。没有按“通常下周三发布”伪造历史 availableAt。

用户要求的最低历史标准没有降为少于5年，也没有删掉非美国实际贡献或 publication leakage 约束。已验证 PIT region 仅 US；非美国已准入 PIT history 为0年。因而不建立正式全球 Target，不训练 Routes A/B/C，也不生成概率、模型制品或当前方向。

ICE、Ship & Bunker、CME/Argus 的相关权限不足；没有购买、申请付费试用或绕过授权。没有拿 EU consumer diesel、台湾国内牌价、月度 bunker volume 或 residual VLSFO 换名填充 Benchmark。

## 最终13项回答

{table(answers, ['问题', '结果'])}

## 交付与边界

14项指定文件都在本报告同目录；[来源报告](GLOBAL_DIESEL_V3_DATA_SOURCE_REPORT.md)、[同期诊断](GLOBAL_DIESEL_COMPOSITE_VALIDATION.md)、[二分类执行状态](BINARY_DIAGNOSTIC_REPORT.md)、[当前状态](CURRENT_GLOBAL_DIESEL_STATE.json)。其余模型阶段报告明确 NOT_RUN / N/A，不能误读为已完成回测。

失败候选仅在本地预览，沿海价格使用9月26日来源快照；国际当前状态 unavailable，未来7天“模型验证中”，无预测方向或百分比。生产文件、价格链、main、公开页面和其它项目不在本轮改动范围；未合并、未部署。

复现、测试与实际点击证据见[README](../README.md)、[测试记录](TEST_RESULTS.md)、[浏览器记录](BROWSER_VERIFICATION.md)。本轮结束，后续数据版本取得、许可证处理或模型研究须另开授权阶段。
'''
    (REPORTS / 'GLOBAL_DIESEL_V3_RESULT.md').write_text(text)


def run(stats, diagnostics, gates):
    sources_report(stats)
    validation_report(diagnostics)
    result_report(stats, gates)
