# Secret 与费用边界

QWEN_API_ACTIVATION_GATE = NEEDS_USER_AUTHORIZATION

## 本轮结果

- 本地环境变量 DASHSCOPE_API_KEY：不存在。
- GitHub repository Secret 同名元数据：不存在。只查询名称是否存在，未读取任何密钥。
- 未创建 Key、工作空间、百炼资源、充值、GitHub Secret 或激活变量。
- real Qwen calls = 0；real model cost = 0；deployments = 0；main changes = 0。
- 测试只注入 fake fetch，测试用占位值不是有效 API Key。模拟输出只写临时目录，不替换仓库当前真实 Evidence/Forecast。

## 未来人工激活，当前不执行

用户明确授权第一次真实调用后，账户侧由用户自行准备北京区域可用模型/Key。不要将 Key 发到聊天或写入仓库。

GitHub repository Settings → Secrets and variables → Actions：

1. 在 Secrets 添加 DASHSCOPE_API_KEY。
2. 可选 Variables 设置 DASHSCOPE_BASE_URL，北京官方兼容 endpoint。
3. 经过独立 main 合并/真实调用授权后，人工将 Variable QWEN_API_ACTIVATED 设为 true。仅添加 Key 不会激活本套 Daily。

以上步骤不表示本轮允许合并、调用或部署。代码准备完成不能证明账户具备模型权限。

## 实现防线

模型 CLI 限定 trusted repository / main / GitHub Actions / 激活标记。Provider 默认拒绝 native 真实调用，测试入口需要注入 fake transport。DRY_RUN 默认只跑测试与 scan，不加载 Secret、collect、commit 或部署。

MAX_PROVIDER_CALLS_PER_RUN=1；transport retries 最多两次。语义错误不循环修输出；一次合格 Official 供全部用户共享，不按省、页面访问、用户或 reason 调用。

审计不保存 Key、Authorization、原始 response 或完整 request body；artifact 仅列出安全 audit 与 Gate 文件。最新 audit 不是费用账单，也不能证明 transport 超时后供应商未计费。未来 transport 重试可能产生额外费用，必须由首次真实调用验收确认。

未设真实 Key、未获授权时停在激活边界，不回退为伪造的 MANUAL 数据。
