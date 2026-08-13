import { Lock, Cpu, FileDown } from "lucide-react";

const BROKER_CHIPS = [
  { name: "富途牛牛", sub: "年度账单.xlsx" },
  { name: "老虎国际", sub: "交易明细.csv" },
  { name: "长桥", sub: "交易记录.csv" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="bg-grid absolute inset-0" aria-hidden />
      <div className="relative mx-auto max-w-5xl px-4 pt-20 pb-16 text-center sm:px-6 md:pt-28 md:pb-24">
        <div className="mb-6 flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-400/10 px-4 py-1.5 text-xs font-medium text-cyan-300">
            <Cpu className="h-3.5 w-3.5" />
            纯前端计算 · 无服务器 · 可离线
          </span>
        </div>

        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-6xl">
          <span className="text-gradient-tech">港美股投资个税</span>
          <br />
          一键计算, 数据不出设备
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
          上传富途 / 老虎 / 长桥的交易账单, 自动完成 FIFO / HIFO 成本核算,
          计算资本利得税、股息税与利息税, 生成可导出的报税报告。
          <span className="text-foreground"> 所有计算在你的浏览器本地完成, 不经过任何服务器。</span>
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {BROKER_CHIPS.map((b) => (
            <div
              key={b.name}
              className="glass-card flex items-center gap-2 px-4 py-2.5 text-sm"
            >
              <span className="font-medium">{b.name}</span>
              <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                <FileDown className="h-3 w-3" />
                {b.sub}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-10 flex justify-center">
          <a
            href="#upload"
            className="glow-cyan rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 px-8 py-3.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            开始计算 →
          </a>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-emerald-400" />
            无账号 · 无上传 · 账单数据不出设备
          </span>
          <span>税制: 中国大陆税务居民 · 港美股</span>
          <span>成本法: FIFO / HIFO / WAC</span>
        </div>
      </div>
    </section>
  );
}
