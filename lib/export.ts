/** 税务报告导出 (纯客户端生成, 不经过任何服务器) */

import type { TaxResult } from "@/lib/types";
import { fmt, fmtCNY, fmtQty } from "@/lib/format";

const EXCHANGE_RATE_TOOLTIP = "年度汇算采用纳税年度最后一日人民币汇率中间价";

export function toSummaryCSV(results: TaxResult[]): string {
  const headers = [
    "年度", "成本法", "资本利得(¥)", "资本利得税(¥)", "股息总额(¥)", "股息税(¥)",
    "境外已扣税(¥)", "可抵免(¥)", "利息税(¥)", "应纳税总额(¥)", "实际应缴(¥)",
  ];
  const rows = results.map((r) => [
    String(r.year),
    r.method,
    fmtCNY(r.capitalGains.totalGainCNY),
    fmtCNY(r.capitalGains.taxAmountCNY),
    fmtCNY(r.dividendTax.totalDividendCNY),
    fmtCNY(r.dividendTax.grossTaxCNY),
    fmtCNY(r.dividendTax.foreignTaxPaidCNY),
    fmtCNY(r.dividendTax.taxCreditCNY),
    fmtCNY(r.interestTax.netTaxDueCNY),
    fmtCNY(r.summary.totalTaxDueCNY),
    fmtCNY(r.summary.netTaxPayableCNY),
  ]);
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

export function toGainsCSV(result: TaxResult): string {
  const headers = [
    "代码", "市场", "品类", "买入日期", "卖出日期", "数量", "乘数",
    "买入价", "卖出价", "买入金额", "卖出金额", "费用", "盈亏(原币)", "盈亏(¥)", "成本估算",
  ];
  const rows = result.capitalGains.details.map((d) => [
    d.symbol,
    d.market ?? "",
    d.category,
    d.buyDate,
    d.sellDate,
    fmtQty(d.quantity),
    String(d.multiplier),
    String(d.buyPrice),
    String(d.sellPrice),
    fmt(d.buyAmount.amount, d.buyAmount.currency === "HKD" ? "HK$" : d.buyAmount.currency === "USD" ? "$" : "¥"),
    fmt(d.sellAmount.amount, d.sellAmount.currency === "HKD" ? "HK$" : d.sellAmount.currency === "USD" ? "$" : "¥"),
    fmt(d.fees.amount, "¥"),
    fmt(d.gain.amount, d.gain.currency === "HKD" ? "HK$" : d.gain.currency === "USD" ? "$" : "¥"),
    fmtCNY(d.gainCNY.amount),
    d.isEstimatedCost ? "期初市值估算" : "实际买入",
  ]);
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

export function generateReportText(result: TaxResult): string {
  const line = "═".repeat(52);
  const thin = "─".repeat(52);
  const cg = result.capitalGains;
  const dt = result.dividendTax;
  const it = result.interestTax;
  const lines = [
    line,
    `  ${result.year}年度 境外证券投资个人所得税计算报告 (${result.method})`,
    line,
    "",
    `生成时间: ${new Date().toLocaleString("zh-CN")}`,
    `汇率 (${result.exchangeRate.date}, ${EXCHANGE_RATE_TOOLTIP}):`,
    `  1 USD = ${(result.exchangeRate.USD / 100).toFixed(4)} CNY`,
    `  1 HKD = ${(result.exchangeRate.HKD / 100).toFixed(4)} CNY`,
    `  来源: ${result.exchangeRate.source}`,
    "",
    thin,
    "一、财产转让所得 (资本利得)",
    thin,
    `  交易明细: ${cg.details.length} 笔`,
    `  总盈亏: ${fmtCNY(cg.totalGainCNY)}`,
    `  应税所得: ${fmtCNY(cg.taxableGainCNY)}`,
    `  应纳税额 (20%): ${fmtCNY(cg.taxAmountCNY)}`,
    cg.unmatchedSellsCount > 0 ? `  ※ ${cg.unmatchedSellsCount} 笔卖出缺少成本基础, 未计入 (请检查期初持仓或账单完整性)` : "",
    "",
    thin,
    "二、股息红利所得",
    thin,
    `  股息笔数: ${dt.details.length} 笔`,
    `  股息总额: ${fmtCNY(dt.totalDividendCNY)}`,
    `  应纳税额 (20%): ${fmtCNY(dt.grossTaxCNY)}`,
    `  境外已扣税: ${fmtCNY(dt.foreignTaxPaidCNY)}`,
    `  可抵免税额: ${fmtCNY(dt.taxCreditCNY)}`,
    `  实际应补税: ${fmtCNY(dt.netTaxDueCNY)}`,
    "",
    thin,
    "三、利息所得",
    thin,
    `  利息总额: ${fmtCNY(it.totalInterestCNY)}`,
    `  应纳税额 (20%): ${fmtCNY(it.grossTaxCNY)}`,
    `  境外预扣税: ${fmtCNY(it.foreignTaxPaidCNY)}`,
    `  实际应补税: ${fmtCNY(it.netTaxDueCNY)}`,
    "",
    line,
    "汇  总",
    line,
    `  应纳税总额: ${fmtCNY(result.summary.totalTaxDueCNY)}`,
    `  可抵免总额: ${fmtCNY(result.summary.totalTaxCreditCNY)}`,
    `  实际应缴税额: ${fmtCNY(result.summary.netTaxPayableCNY)}`,
    "",
    "※ 本报告仅供参考, 不构成税务建议, 请以税务机关最终核定为准。",
  ];
  return lines.filter((l) => l !== "").join("\n");
}

export function downloadFile(name: string, content: string, mime = "text/csv") {
  const blob = new Blob(["\uFEFF" + content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
