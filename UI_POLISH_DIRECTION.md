# UI_POLISH_DIRECTION

任务：AYU_FUEL_FINAL_UI_POLISH_001  
编写时间：2026-09-28T14:23:40.535612+00:00  
实现前基线：cdd41ae67188eb4e3e90ddbde0b1c18b618c851f

## 范围与成功标准

仅改静态 HTML 文案与 CSS。所有 JS、油价、0.84 kg/L、11 地区排序、Evidence、Forecast、有效期、来源链接、历史和自动更新保持字节一致。原有四 Gate 和最终视觉 Gate 通过；手机无溢出，核心价格、方向、三项概率处于首屏；新增运行时依赖为 0。

用户最新更正优先：继续四张依据卡片直接展示；不恢复“为什么这么判断”、主/反向分组和折叠。因此展开/收起、aria-expanded 为不适用；保留不可见的语义区域名称。

## Visual principles

价格第一，趋势第二，来源卡片随后。暖白底色、深海色价格卡、清楚的白色信息卡。以一致的排版、边界和空间体现认真、平静、可信，不以特效表达可信度。维持原有价格与趋势语义，保留吨价估算和国际市场方向说明。

## Tokens

| 用途 | 设计值 |
| --- | --- |
| 页面 | #f7f8f6 暖中性白 |
| 正文 | #20373d |
| 次级文字 | #5e6d72，确保小字对比度 |
| 主表面 | #ffffff |
| 主价格表面 | #173e46 |
| 细边界 | #e1e7e4 |
| 上行 / 下行 | #89552b / #286b63，同时保留文字与箭头 |
| 空间 | 4 / 8 / 12 / 16 / 24 / 32px |
| 圆角 | 小 8px；中 16px；主卡 24px；selector 全圆 |
| 主阴影 | 0 8px 24px rgba(23,62,70,.06) |
| Evidence 阴影 | 无 |
| 焦点 | 3px #307b93，3px 偏移 |
| 过渡 | 180ms，颜色 / 边界 / 阴影 |

## Typography

系统字体：-apple-system、BlinkMacSystemFont、PingFang SC、Helvetica Neue、Arial、Microsoft YaHei、sans-serif。无网络字体。

约五组视觉层级：吨价 44–56px / 550；方向 30px / 600；页面与卡片标题 17–22px / 600；正文与概率 16px；meta/caption 13–14px。价格使用等宽数字特性，金额始终不换行。常规正文行高 1.6，说明行高 1.5–1.7。

## Spacing / radius / surface

手机两侧 16px，320px 仍不横向滚动。主卡 24px 圆角与 24px 内边距，小屏可用 16px 内边距。主区间隔 16px；依据卡间隔 12px、圆角 16px、薄边框、白底，标题明显强于来源和摘要。桌面维持单列、最大宽度 640px。

省份 selector 44px 以上，白色 pill。仅 selector 可以启用很轻的 8px blur；默认不透明白底为 fallback。主卡为哑光表面；Evidence 不使用 blur。原生 dialog 保留焦点圈、选中标记和点击区域。

## Motion / accessibility / states

不新增进入动画、数字动画、滚动动画。去掉骨架持续脉冲，避免无意义动画。交互反馈只用 180ms 颜色/边界过渡；prefers-reduced-motion 时全部关闭。键盘与触摸目标至少 44px；来源看起来是小链接，点击高度仍为 44px。所有状态用现有 Gate 输出的自然中文，不改变状态判断。

LIVE：核心信息与来源清楚。LOADING：同样主卡尺寸、静止骨架。UNAVAILABLE：柔和白卡与现有两个操作。STALE：保留价格与延迟提示；预测过期时不显示旧概率和依据。Footer 两条短说明保持完整且可读。

## What NOT to do

不加框架、运行时库、图片、媒体、外部字体、渐变背景、反射折射、整页玻璃、黑暗模式、新闻流、收藏、地图、历史图、analytics。不给来源加认证标识，不复制媒体正文，不新增事实。未经人工确认不合并 main 或部署。

## 参考落地

GlassKit / LiquidGlass-UI / apple-design-skill 仅用于观察 token、层级和降级原则。本页规模小，原生 CSS 足够，没有引入整套库的收益。详见 OPEN_SOURCE_UI_REVIEW.md。
