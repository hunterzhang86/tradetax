# TradeTax · 港美股投资个税计算器

面向中国大陆税务居民的境外证券投资个税计算工具。上传富途 / 老虎 / 长桥的交易账单,自动完成成本核算与三税种计算。

**核心卖点: 100% 浏览器本地计算, 数据不出设备。** 全站为纯静态文件, 无后端、无数据库、无埋点, 可断网使用。

## 功能

- 支持券商与格式:
  - 富途牛牛 / moomoo — `年度账单.xlsx`(账户信息 / 持仓总览 / 交易流水 / 资金进出)
  - 老虎国际 — Activity Statement CSV(账单报表 → 自定义 → CSV)
  - 长桥 — 交易记录 CSV(官方模板格式, 含 `type/date/symbol/...`)
- 成本核算: **FIFO**(先进先出)/ **HIFO**(最高成本优先)/ **WAC**(移动加权平均, 富途官方口径), 可切换
- 税种: 资本利得 20%(年度盈亏互抵)、股息 20%(境外已扣税限额抵免)、利息 20%
- 期权支持(100 倍乘数、做多/做空/到期作废)、多年度 / 多账户合并计算、跨年持仓成本估算
- 年度汇率(国家外汇管理局年末中间价, 内置 2020–2025)
- 输出: 汇总 CSV、资本利得明细 CSV、文本报告(纯本地下载)
- 解析告警: 无法识别的行会明确标注原因与行号

## 隐私设计

- `next.config.mjs` 中 `output: "export"`, 站点是纯静态文件, 不存在可接收数据的服务器
- 所有解析 / 计算 / 导出均在浏览器内存中完成, 零网络请求
- 无账号体系、无分析埋点
- 页面内置隐私架构说明与断网自检指引

## 技术栈

Next.js 14(App Router, 静态导出) · React 18 · TypeScript · Tailwind CSS · SheetJS(xlsx 解析) · Vitest

## 本地开发

```bash
npm install
npm run dev        # 开发服务器
npm run test       # 单元测试 (60 个用例, 含真实交易场景回归)
npm run build      # 静态导出到 out/
npx serve out      # 本地预览静态产物
```

## 部署到 Vercel

1. 推送到 GitHub 仓库
2. Vercel → New Project → Import 该仓库
3. 无需任何环境变量,Framework Preset 选 Next.js,直接 Deploy

部署产物为纯静态文件, 同样可以直接部署到 Cloudflare Pages / GitHub Pages / 任意静态托管。

## 项目结构

```
app/                  # Next.js 页面 (单页工具)
components/           # UI 组件
lib/
  types.ts            # 归一化数据模型
  csv.ts              # CSV 解析 / 编码识别 / 数值与日期归一化
  exchange.ts         # 年度汇率表
  calculator.ts       # FIFO/HIFO 成本核算 + 三税种计算引擎
  export.ts           # 报告导出
  parsers/
    index.ts          # 券商识别 + 适配器注册表
    futu.ts           # 富途 xlsx 解析
    tiger.ts          # 老虎 Activity Statement 解析
    longbridge.ts     # 长桥 CSV 解析
    genericCsv.ts     # 通用 CSV 列映射解析器
tests/                # Vitest 单元测试 (含真实交易场景与老虎夹具回归)
docs/                 # 计算方式与格式说明
```

## 免责声明

本工具仅供参考, 不构成税务建议。重大金额请咨询专业税务师, 最终以税务机关核定为准。

## License

MIT
