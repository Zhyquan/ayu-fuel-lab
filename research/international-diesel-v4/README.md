# AIDI V4 独立研究交付

INTERNATIONAL_DIESEL_DATA_GATE_V4 = PASS

INTERNATIONAL_DIESEL_MODEL_GATE_V4 = FAIL

共同历史15.45年；807个calendar周、653个可建模独立周、387个Test周。主模型ElasticNet + Platt、FLAT ±0.75%，均在Validation冻结。Brier0.6993 / LL1.1493，差于frequency0.6735 / 1.1090；校准、60%桶、年度稳定性、Composite增量未通过。日本下载失败，外部代表性未验证。二分类有条件方向信息，但无上线资格。

## 要求的14份交付

1. [总体结论及19项回答](AYU_INTERNATIONAL_DIESEL_V4_RESULT.md)
2. [数据源审计](V4_DATA_SOURCE_AUDIT.md)
3. [周度对齐](WEEKLY_ALIGNMENT_SPEC.md)
4. [AIDI定义](AIDI_DEFINITION.md)
5. [独立样本及各fold数量](AIDI_DATASET_REPORT.md)
6. [FLAT阈值选择](AIDI_FLAT_THRESHOLD_DECISION.md)
7. [特征与容量](AIDI_FEATURES.md)
8. [扩展窗口与冻结](AIDI_WALK_FORWARD.md)
9. [基线与地区增量](AIDI_BASELINE_COMPARISON.md)
10. [校准与可靠性](AIDI_CALIBRATION_REPORT.md)
11. [逐年结果](AIDI_YEAR_BY_YEAR.md)
12. [亚洲外部验证](ASIA_VALIDATION_REPORT.md)
13. [二分类诊断](V4_BINARY_DIAGNOSTIC.md)
14. [当前描述状态](CURRENT_AIDI_STATE.json)

补充：[复现命令](REPRODUCE.md)、[离线复现证据](results/REPRODUCTION_RESULT.json)、[测试结果](results/TEST_RESULTS.json)、[实际手机UI验证](results/UI_VERIFICATION.json)、[Candidate UI](ui/index.html)。预测模型FAIL，未生成当前预测或model artifact。data/raw保存原始文件，data/保存周表/审计，results/保存逐周回测、校准、地区/币种/发布时间敏感性与freeze hashes。

全部Git改动只新增本研究子目录；没有修改价格服务、公开站点、既有研究或生产项目。远程研究分支身份在目录外REMOTE_IDENTITY.json / DELIVERY.md。完成后停止，等待人工指令。
