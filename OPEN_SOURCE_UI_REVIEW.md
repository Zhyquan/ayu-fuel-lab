# OPEN_SOURCE_UI_REVIEW

研究日期：2026-09-28。以下均为第三方开源项目，不是 Apple 官方 Web 组件。

| 项目 | 精确仓库 | 许可证（已读取） | 本轮采用 |
| --- | --- | --- | --- |
| GlassKit | [JUNGHERZ/GlassKit](https://github.com/JUNGHERZ/GlassKit) | [MIT，2026 Jungherz GmbH](https://raw.githubusercontent.com/JUNGHERZ/GlassKit/main/LICENSE) | 仅参考圆角 / 细边界 / token 思路 |
| LiquidGlass-UI | [hwyuanzi/LiquidGlass-UI](https://github.com/hwyuanzi/LiquidGlass-UI) | [MIT，2026 Hollan Yuan](https://raw.githubusercontent.com/hwyuanzi/LiquidGlass-UI/main/LICENSE) | 仅参考低强度材质与无 blur 降级 |
| apple-design-skill | [chaos-xxl/apple-design-skill](https://github.com/chaos-xxl/apple-design-skill) | [MIT，2025 Apple Design Skill Contributors](https://raw.githubusercontent.com/chaos-xxl/apple-design-skill/main/LICENSE) | 仅参考间距 / 字号层级 / 系统字体思路 |

## 原始资料与取舍

GlassKit 的 [README](https://github.com/JUNGHERZ/GlassKit#readme) 将材质、组件和 token 组织为 CSS 方案。当前页面只有几类卡片，整套样式会增加不必要的体积与覆盖关系；本轮没有下载、复制或导入其实现。

LiquidGlass-UI 的 [README](https://github.com/hwyuanzi/LiquidGlass-UI#readme) 包含 Web Components、可选光学效果和降级支持。当前信息工具不需要折射或光学 JS，正文卡保持白色，只给 selector 留一个局部 CSS blur，默认白底也可完整使用。

apple-design-skill 的 [design-tokens](https://raw.githubusercontent.com/chaos-xxl/apple-design-skill/main/prompts/design-tokens.md) 与 [typography](https://raw.githubusercontent.com/chaos-xxl/apple-design-skill/main/prompts/typography.md) 可用于观察层级和空间。其网络字体、营销 Hero、强标题字重、渐变建议不适合本项目要求，因此不采用，也不安装其 skill 或指令文件。

## 依赖与许可结论

实际引入 GlassKit：否。实际引入 LiquidGlass-UI：否。实际引入 apple-design-skill：否。新增运行时依赖：0；新增字体 / 图片 / 远程资源：0。实现为本项目原生 CSS，未复制第三方源代码，不涉及捆绑其代码的版权声明。未来若复制或分发其代码或实质部分，需要保留对应版权与 MIT 许可文本。

不使用 Apple Logo、商标图形、专有素材或下载字体。不声明任何“Apple 官方组件”归属。
