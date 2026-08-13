import { Cpu, Lock, ServerOff, WifiOff } from "lucide-react";

const FEATURES = [
  {
    icon: Lock,
    title: "文件不出浏览器",
    desc: "账单文件仅在浏览器内存中被解析, 不写入任何存储, 不上传任何服务器。",
  },
  {
    icon: ServerOff,
    title: "站点无后端",
    desc: "本站在 Vercel 上以纯静态文件形式托管, 不存在可接收数据的服务器。",
  },
  {
    icon: WifiOff,
    title: "可完全离线使用",
    desc: "首次加载后断网也能正常计算, 你可以用飞行模式验证数据没有离开设备。",
  },
  {
    icon: Cpu,
    title: "无账号 · 无追踪",
    desc: "不设账号体系, 不埋点, 不采集任何访问与使用数据。",
  },
];

export function PrivacySection() {
  return (
    <section id="privacy" className="mx-auto max-w-5xl px-4 py-16 scroll-mt-20 sm:px-6">
      <div className="glass-card relative overflow-hidden p-6 md:p-10">
        <div className="bg-grid absolute inset-0" aria-hidden />
        <div className="relative">
          <div className="mb-8 max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              隐私是默认配置, <span className="text-gradient-tech">不是可选项</span>
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">
              交易账单包含账户号、持仓与盈亏数据, 敏感程度高。因此 TradeTax 采用"纯前端"架构:
              解析、成本核算、税务计算全部在你的设备上完成, 整个过程中不产生任何网络请求。
            </p>
          </div>

          <div className="mb-8 overflow-hidden rounded-xl border border-white/[0.08] bg-black/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/tradetax.webp"
              alt="TradeTax 隐私架构: 账单文件在浏览器本地解析与计算, 全程零网络请求, 无服务器无数据库"
              width={1440}
              height={810}
              className="h-auto w-full"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                <f.icon className="mb-3 h-5 w-5 text-cyan-300" />
                <h3 className="text-sm font-medium">{f.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
