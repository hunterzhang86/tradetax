/**
 * 老虎国际税表 xlsx 解析器测试
 *
 * 使用与真实文件 (2025_税表_账户号.xlsx) 相同结构的合成样本验证:
 * 工作表 税务总览 / 交易所得及盈亏 / 股息收入 / 利息与票息收入 / 参考汇率
 */

import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseTigerTaxFromBuffer } from "@/lib/parsers/tigerTax";
import { detectBroker } from "@/lib/parsers";
import { calculateTax } from "@/lib/calculator";

function makeTigerTaxWorkbook(): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["1. 报表信息"],
      [],
      ["券商", "Tiger Brokers (NZ) Limited"],
      ["账户号", "640373"],
      ["账户类型", "保证金账户"],
      ["税年", 2025],
      ["报告范围", "2025-04-01~2026-03-31"],
      ["成本法", "FIFO（成本含佣金与税费）"],
      ["基础货币", "USD"],
      ["生成时间", "2026-06-03 20:37:53"],
    ]),
    "税务总览",
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["注："],
      ["1. 已实现盈亏按先进先出（FIFO）原则计算；计算所用交易成本已包含佣金及相关税费。"],
      ["市场", "品类", "交易类型", "金额", "已实现盈亏", "币种"],
      ["HK", "基金", "买入交易", "-92,842.70", "0.00", "HKD"],
      ["HK", "基金", "卖出交易", "65,364.89", "150.26", "HKD"],
      ["HK", "基金", "卖出交易", "37,666.90", "306.74", "USD"],
      ["US", "期权", "买入交易", "-50.00", "-6.41", "USD"],
      ["US", "证券", "买入交易", "-26,762.00", "0.00", "USD"],
      ["HK", "证券", "卖出交易", "11,488.00", "5,816.21", "HKD"],
      ["US", "证券", "卖出交易", "33,905.00", "1,289.05", "USD"],
      ["US", "期权", "期权行权", "0.00", "203.14", "USD"],
      ["合计（基础币种）", "", "", "0.00", "2,553.54", "USD"],
    ]),
    "交易所得及盈亏",
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["注：当您持有某只股票的负持仓时，可能需要支付负分红。"],
      [null, "现金分红金额", "份额分红市值", "负分红金额", "分红税", "已退回税额", "币种"],
      ["美股", "154.36", "0.00", "0.00", "-11.44", "0.00", "USD"],
      ["合计（基础币种）", "154.36", "0.00", "0.00", "-11.44", "0.00", "USD"],
    ]),
    "股息收入",
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      [null, "利息或票息金额", "预扣税", "币种"],
      ["美股", "120.00", "-5.00", "USD"],
      ["合计（基础币种）", "120.00", "-5.00", "USD"],
    ]),
    "利息与票息收入",
  );

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["日期", 46112],
      ["USD", "1.00000"],
    ]),
    "参考汇率",
  );

  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

const buffer = makeTigerTaxWorkbook();

describe("老虎税表 xlsx 解析", () => {
  const stmt = parseTigerTaxFromBuffer(buffer, "2025_税表_640373.xlsx");

  it("识别为老虎账单", () => {
    expect(detectBroker(buffer, "2025_税表_640373.xlsx")).toBe("tiger");
  });

  it("提取税年与报表说明", () => {
    expect(stmt.year).toBe(2025);
    expect(stmt.reportNote).toContain("报告范围: 2025-04-01~2026-03-31");
    expect(stmt.reportNote).toContain("FIFO");
    expect(stmt.broker).toBe("tiger");
  });

  it("解析券商预计算已实现盈亏 (按币种, 不含合计行)", () => {
    expect(stmt.realizedGains).toHaveLength(6);
    const hkd = stmt.realizedGains!.filter((g) => g.currency === "HKD");
    const usd = stmt.realizedGains!.filter((g) => g.currency === "USD");
    expect(hkd.reduce((s, g) => s + g.amount, 0)).toBeCloseTo(5966.47, 2); // 150.26 + 5816.21
    expect(usd.reduce((s, g) => s + g.amount, 0)).toBeCloseTo(1792.52, 2); // 306.74 - 6.41 + 1289.05 + 203.14
    // 合计行 (2553.54) 不应被计入
    expect(stmt.realizedGains!.some((g) => Math.abs(g.amount - 2553.54) < 0.01)).toBe(false);
  });

  it("解析股息与分红税", () => {
    expect(stmt.dividends).toHaveLength(1);
    const div = stmt.dividends[0];
    expect(div.grossAmount).toBe(154.36);
    expect(div.withholdingTax).toBe(11.44);
    expect(div.currency).toBe("USD");
  });

  it("解析利息与预扣税", () => {
    expect(stmt.interests).toHaveLength(1);
    expect(stmt.interests![0].amount).toBe(120);
    expect(stmt.interests![0].withholdingTax).toBe(5);
  });
});

describe("老虎税表计算结果", () => {
  const stmt = parseTigerTaxFromBuffer(buffer, "2025_税表_640373.xlsx");
  const result = calculateTax([stmt])[0];

  it("标记为券商预计算口径", () => {
    expect(result.precomputedGains).toBe(true);
    expect(result.capitalGains.precomputed).toBe(true);
    expect(result.year).toBe(2025);
  });

  it("资本利得按币种折算入账", () => {
    // HKD 5966.47 × 0.90322 + USD 1792.52 × 7.0288
    const expectedCNY = 5966.47 * 0.90322 + 1792.52 * 7.0288;
    expect(result.capitalGains.totalGainCNY).toBeCloseTo(expectedCNY, 1);
    expect(result.capitalGains.taxAmountCNY).toBeCloseTo(expectedCNY * 0.2, 1);
  });

  it("股息税含境外已扣税抵免", () => {
    const dt = result.dividendTax;
    expect(dt.totalDividendCNY).toBeCloseTo(154.36 * 7.0288, 1);
    expect(dt.taxCreditCNY).toBeCloseTo(11.44 * 7.0288, 1);
    // net = grossTax - credit = (gross×20% - 预扣税) × 汇率
    expect(dt.netTaxDueCNY).toBeCloseTo((154.36 * 0.2 - 11.44) * 7.0288, 1);
  });

  it("利息税含预扣税抵免", () => {
    const it = result.interestTax;
    expect(it.totalInterestCNY).toBeCloseTo(120 * 7.0288, 1);
    expect(it.grossTaxCNY).toBeCloseTo(120 * 7.0288 * 0.2, 1);
    expect(it.taxCreditCNY).toBeCloseTo(5 * 7.0288, 1);
    expect(it.netTaxDueCNY).toBeCloseTo((120 * 0.2 - 5) * 7.0288, 1);
  });
});
