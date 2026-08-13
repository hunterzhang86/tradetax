"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const FAQS = [
  {
    q: "我的数据安全吗? 会上传到服务器吗?",
    a: "不会。TradeTax 是纯前端应用: 解析、计算、导出全部在浏览器本地完成, 全程零网络请求。站点本身在 Vercel 上以静态文件形式托管, 没有后端服务器可以接收你的数据。你甚至可以断网使用来验证这一点。",
  },
  {
    q: "支持哪些券商和文件格式?",
    a: "富途牛牛 (年度账单.xlsx)、老虎国际 (账单报表导出的 CSV)、长桥 (交易记录 CSV)。多年度、多账户文件可同时导入。",
  },
  {
    q: "股息和预扣税怎么处理?",
    a: "从账单的资金进出/股息记录中自动提取股息与境外预扣税。股息按 20% 计税, 境外已扣税 (如美股 10% WHT) 在应纳税额限额内抵免。",
  },
  {
    q: "期权交易支持吗?",
    a: "支持。期权按 100 倍乘数计算盈亏, 富途/老虎/长桥的期权交易行都会被识别为期权品类。",
  },
  {
    q: "跨年持仓的成本怎么算?",
    a: "使用期初持仓市值估算成本, 并在明细中标注「期初估算」。建议同时导入期初持仓所在年份的账单以获得更精确结果。",
  },
  {
    q: "计算结果是税务局认可的正式文件吗?",
    a: "不是。本工具是报税辅助计算器, 输出供你申报时参考, 不构成税务建议。最终以税务机关核定为准, 重大金额建议咨询专业税务师。",
  },
  {
    q: "汇率是怎么取的?",
    a: "依据财税规定, 境外所得按纳税年度最后一日的人民币汇率中间价折算, 数据来自国家外汇管理局。",
  },
];

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="mx-auto max-w-5xl px-4 py-16 scroll-mt-20 sm:px-6">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">常见问题</h2>
      </div>
      <div className="space-y-2">
        {FAQS.map((f, i) => (
          <div key={i} className="glass-card overflow-hidden">
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-medium transition hover:bg-white/[0.02]"
            >
              {f.q}
              <ChevronDown
                className={cn("h-4 w-4 shrink-0 text-muted-foreground transition", open === i && "rotate-180")}
              />
            </button>
            {open === i && (
              <p className="border-t border-white/[0.06] px-5 py-4 text-sm leading-relaxed text-muted-foreground">
                {f.a}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
