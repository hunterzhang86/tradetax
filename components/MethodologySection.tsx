import { Badge } from "./ui";

const TAX_RULES = [
  { label: "资本利得 (财产转让所得)", rate: "20%", note: "同一年度内盈利与亏损互抵后, 仅对净盈利计税" },
  { label: "股息红利所得", rate: "20%", note: "境外已扣税 (美股预扣 10%) 在应纳税额限额内抵免" },
  { label: "利息所得", rate: "20%", note: "当前版本暂未从账单提取利息, 后续版本支持" },
  { label: "汇率", rate: "年末中间价", note: "采用纳税年度最后一日人民币汇率中间价, 数据来源: 国家外汇管理局" },
];

const COST_METHODS = [
  {
    name: "FIFO",
    title: "先进先出",
    desc: "先买入的持仓先卖出。最常用, 税务局默认认可的成本核算方法之一。",
  },
  {
    name: "HIFO",
    title: "最高成本优先",
    desc: "优先卖出成本最高的持仓, 在盈利年份可最大化抵减应税所得。",
  },
];

export function MethodologySection() {
  return (
    <section id="method" className="mx-auto max-w-5xl px-4 py-16 scroll-mt-20 sm:px-6">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">计算方式</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
          面向中国大陆税务居民, 依据《个人所得税法》及境外所得抵免规则。
          本工具供报税参考, 不构成税务建议。
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="glass-card p-6 lg:col-span-3">
          <h3 className="mb-4 text-sm font-medium">税制模型</h3>
          <div className="space-y-3">
            {TAX_RULES.map((r) => (
              <div key={r.label} className="flex items-start gap-3 rounded-lg border border-white/[0.06] px-4 py-3">
                <Badge tone="cyan" className="mt-0.5 shrink-0">{r.rate}</Badge>
                <div>
                  <p className="text-sm font-medium">{r.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{r.note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-6 lg:col-span-2">
          <h3 className="mb-4 text-sm font-medium">成本核算方法</h3>
          <div className="space-y-3">
            {COST_METHODS.map((m) => (
              <div key={m.name} className="rounded-lg border border-white/[0.06] px-4 py-3">
                <p className="text-sm font-medium">
                  <span className="font-mono text-cyan-300">{m.name}</span>
                  <span className="ml-2 text-muted-foreground">{m.title}</span>
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{m.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/5 px-4 py-3">
            <p className="text-xs leading-relaxed text-amber-200/80">
              跨年持仓说明: 当年未卖出的持仓若在上一年度买入, 其成本将使用上一年度期初持仓市值估算,
              并在明细中标注「期初估算」。要获得精确成本, 请同时导入期初持仓所在年度的账单。
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
