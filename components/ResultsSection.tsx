"use client";

import { useState } from "react";
import { AlertTriangle, Download, FileText } from "lucide-react";
import type { TaxResult } from "@/lib/types";
import { fmtCNY, fmtQty, fmtSigned } from "@/lib/format";
import {
  downloadFile,
  generateReportText,
  toGainsCSV,
  toSummaryCSV,
} from "@/lib/export";
import { cn } from "@/lib/utils";
import { Badge, StatCard } from "./ui";

function GainsTable({ result }: { result: TaxResult }) {
  const details = result.capitalGains.details;
  if (details.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {result.precomputedGains
          ? "老虎税表为券商汇总口径, 已实现盈亏已由券商按 FIFO 预计算, 无逐笔明细"
          : "本年度无已匹配的买卖交易"}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-xs">
        <thead>
          <tr className="border-b border-white/[0.08] text-muted-foreground">
            <th className="px-3 py-2.5 font-medium">代码</th>
            <th className="px-3 py-2.5 font-medium">买入日</th>
            <th className="px-3 py-2.5 font-medium">卖出日</th>
            <th className="px-3 py-2.5 text-right font-medium">数量</th>
            <th className="px-3 py-2.5 text-right font-medium">买入价</th>
            <th className="px-3 py-2.5 text-right font-medium">卖出价</th>
            <th className="px-3 py-2.5 text-right font-medium">盈亏</th>
            <th className="px-3 py-2.5 text-right font-medium">盈亏(¥)</th>
            <th className="px-3 py-2.5 font-medium">成本</th>
          </tr>
        </thead>
        <tbody>
          {details.map((d, i) => (
            <tr key={i} className="border-b border-white/[0.04] transition hover:bg-white/[0.02]">
              <td className="px-3 py-2 font-mono">
                {d.symbol}
                <span className="ml-1.5 text-[10px] text-muted-foreground">{d.category === "期权" ? "期权" : d.market}</span>
              </td>
              <td className="px-3 py-2 num">{d.buyDate}</td>
              <td className="px-3 py-2 num">{d.sellDate}</td>
              <td className="px-3 py-2 text-right num">{fmtQty(d.quantity)}</td>
              <td className="px-3 py-2 text-right num">{d.buyPrice}</td>
              <td className="px-3 py-2 text-right num">{d.sellPrice}</td>
              <td className={cn("px-3 py-2 text-right num", d.gain.amount >= 0 ? "text-emerald-400" : "text-rose-400")}>
                {fmtSigned(d.gain.amount, d.gain.currency === "HKD" ? "HK$" : d.gain.currency === "USD" ? "$" : "¥")}
              </td>
              <td className={cn("px-3 py-2 text-right num", d.gainCNY.amount >= 0 ? "text-emerald-400" : "text-rose-400")}>
                {fmtSigned(d.gainCNY.amount)}
              </td>
              <td className="px-3 py-2">
                {d.isEstimatedCost ? (
                  <Badge tone="amber">期初估算</Badge>
                ) : (
                  <span className="text-[10px] text-muted-foreground">实际买入</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DividendTable({ result }: { result: TaxResult }) {
  const details = result.dividendTax.details;
  if (details.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">本年度无股息记录</p>;
  }

  const toCNY = (amount: number, currency: string): number => {
    if (currency === "CNY") return amount;
    const per100 = currency === "USD" ? result.exchangeRate.USD : result.exchangeRate.HKD;
    return (amount * per100) / 100;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead>
          <tr className="border-b border-white/[0.08] text-muted-foreground">
            <th className="px-3 py-2.5 font-medium">日期</th>
            <th className="px-3 py-2.5 font-medium">代码</th>
            <th className="px-3 py-2.5 text-right font-medium">税前股息(¥)</th>
            <th className="px-3 py-2.5 text-right font-medium">预扣税(¥)</th>
            <th className="px-3 py-2.5 text-right font-medium">税后净额(¥)</th>
          </tr>
        </thead>
        <tbody>
          {details.map((d, i) => (
            <tr key={i} className="border-b border-white/[0.04]">
              <td className="px-3 py-2 num">{d.date}</td>
              <td className="px-3 py-2 font-mono">{d.symbol}</td>
              <td className="px-3 py-2 text-right num">{fmtCNY(toCNY(d.grossAmount, d.currency))}</td>
              <td className="px-3 py-2 text-right num text-amber-400">{fmtCNY(toCNY(d.withholdingTax, d.currency))}</td>
              <td className="px-3 py-2 text-right num text-muted-foreground">{fmtCNY(toCNY(d.netAmount, d.currency))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function YearCard({ result }: { result: TaxResult }) {
  const [tab, setTab] = useState<"summary" | "gains" | "dividends">("summary");
  const cg = result.capitalGains;
  const dt = result.dividendTax;

  return (
    <div className="glass-card animate-fade-up p-6 md:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-xl font-semibold">{result.year} 年度</h3>
        <Badge tone="muted">{result.method}</Badge>
        {result.precomputedGains && (
          <Badge tone="purple">券商预计算 (FIFO)</Badge>
        )}
        <span className="text-xs text-muted-foreground">
          汇率: 1 USD = {(result.exchangeRate.USD / 100).toFixed(4)} CNY · 1 HKD = {(result.exchangeRate.HKD / 100).toFixed(4)} CNY
        </span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => downloadFile(`tradetax-${result.year}-报告.txt`, generateReportText(result), "text/plain")}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-white/25 hover:text-foreground"
          >
            <FileText className="h-3.5 w-3.5" />
            报告
          </button>
          <button
            onClick={() => downloadFile(`tradetax-${result.year}-资本利得.csv`, toGainsCSV(result))}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-white/25 hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" />
            明细
          </button>
        </div>
      </div>

      {result.reportNote && (
        <p className="mt-3 text-xs text-muted-foreground">{result.reportNote}</p>
      )}

      {cg.unmatchedSellsCount > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-xs text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            有 {cg.unmatchedSellsCount} 笔卖出 ({cg.unmatchedSellsQty} 股/份) 无法匹配到买入成本, 未计入盈亏。
            跨年持仓需使用「期初持仓」估算成本, 或确保导入了完整的年度账单。
          </span>
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="资本利得税 (20%)"
          value={fmtCNY(cg.taxAmountCNY)}
          sub={`应税所得 ${fmtCNY(cg.taxableGainCNY)} · ${cg.details.length} 笔`}
          tone={cg.taxAmountCNY > 0 ? "accent" : "default"}
        />
        <StatCard
          label="股息税 (20%)"
          value={fmtCNY(dt.netTaxDueCNY)}
          sub={`抵免 ${fmtCNY(dt.taxCreditCNY)} · ${dt.details.length} 笔`}
          tone={dt.netTaxDueCNY > 0 ? "accent" : "default"}
        />
        <StatCard
          label="利息税 (20%)"
          value={fmtCNY(result.interestTax.netTaxDueCNY)}
          sub={
            result.interestTax.totalInterestCNY > 0
              ? `抵免 ${fmtCNY(result.interestTax.taxCreditCNY)}`
              : "当前账单无利息记录"
          }
        />
        <StatCard
          label="实际应缴"
          value={fmtCNY(result.summary.netTaxPayableCNY)}
          sub={`应纳税 ${fmtCNY(result.summary.totalTaxDueCNY)}`}
          tone={result.summary.netTaxPayableCNY > 0 ? "positive" : "default"}
        />
      </div>

      <div className="mt-6 flex gap-1 border-b border-white/[0.08]">
        {(
          [
            ["summary", "汇总"],
            ["gains", `资本利得明细 (${cg.details.length})`],
            ["dividends", `股息明细 (${dt.details.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm transition",
              tab === key
                ? "border-cyan-400 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "summary" && (
          <div className="space-y-4">
            {cg.byCurrency.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {cg.byCurrency.map((c) => (
                  <div key={c.currency} className="flex items-center justify-between rounded-lg border border-white/[0.06] px-4 py-2.5 text-sm">
                    <span className="text-muted-foreground">
                      盈亏 ({c.currency === "HKD" ? "港币" : c.currency === "USD" ? "美元" : "人民币"})
                    </span>
                    <span className={cn("num", c.totalGain >= 0 ? "text-emerald-400" : "text-rose-400")}>
                      {fmtSigned(c.totalGain, c.currency === "HKD" ? "HK$" : c.currency === "USD" ? "$" : "¥")}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-3">
              {result.annualReturn && (
                <>
                  <div className="rounded-lg border border-white/[0.06] px-4 py-2.5 text-sm">
                    <p className="text-xs text-muted-foreground">年度收益 (市值法, 含未实现)</p>
                    <p className={cn("mt-1 num", result.annualReturn.totalReturnCNY >= 0 ? "text-emerald-400" : "text-rose-400")}>
                      {fmtSigned(result.annualReturn.totalReturnCNY)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] px-4 py-2.5 text-sm">
                    <p className="text-xs text-muted-foreground">股息收入</p>
                    <p className="mt-1 num text-cyan-300">{fmtCNY(result.annualReturn.dividendIncomeCNY)}</p>
                  </div>
                  <div className="rounded-lg border border-white/[0.06] px-4 py-2.5 text-sm">
                    <p className="text-xs text-muted-foreground">导入统计</p>
                    <p className="mt-1 num text-muted-foreground">
                      {result.stats.tradeCount} 笔交易 · {result.stats.dividendCount} 笔股息
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {tab === "gains" && <GainsTable result={result} />}
        {tab === "dividends" && <DividendTable result={result} />}
      </div>
    </div>
  );
}

export function ResultsSection({ results }: { results: TaxResult[] }) {
  if (results.length === 0) return null;

  const totalPayable = results.reduce((s, r) => s + r.summary.netTaxPayableCNY, 0);
  const totalTaxDue = results.reduce((s, r) => s + r.summary.totalTaxDueCNY, 0);
  const totalCredit = results.reduce((s, r) => s + r.summary.totalTaxCreditCNY, 0);

  return (
    <section id="results" className="mx-auto max-w-5xl px-4 py-16 scroll-mt-20 sm:px-6">
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">计算结果</h2>
          <p className="mt-1 text-sm text-muted-foreground">共 {results.length} 个年度 · 所有数字均为浏览器本地计算</p>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => downloadFile("tradetax-汇总.csv", toSummaryCSV(results))}
            className="glow-cyan flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-400 px-4 py-2 text-sm font-medium text-white transition hover:brightness-110"
          >
            <Download className="h-4 w-4" />
            导出汇总 CSV
          </button>
        </div>
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <StatCard label="应纳税总额 (全部年度)" value={fmtCNY(totalTaxDue)} />
        <StatCard label="境外已扣税可抵免" value={fmtCNY(totalCredit)} tone="accent" />
        <StatCard label="实际应缴合计" value={fmtCNY(totalPayable)} tone={totalPayable > 0 ? "positive" : "default"} />
      </div>

      <div className="space-y-6">
        {results.map((r) => (
          <YearCard key={r.year} result={r} />
        ))}
      </div>
    </section>
  );
}
