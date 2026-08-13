/**
 * 真实样本回归测试: 富途交易场景 (来源: marlonlu/futu_tax_calculator test_data)
 *
 * 每个场景包含交易输入 (test_data.csv) 与该年度预期已实现盈亏 (test_data_YYYY.csv),
 * 用真实世界的交易数据验证计算引擎 (含期权做多/做空/到期作废/跨年等场景)。
 */

import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCSV } from "@/lib/csv";
import { calculateTax } from "@/lib/calculator";
import type { CostBasisMethod, Currency, ParsedStatement, Trade } from "@/lib/types";

const BASE = "tests/fixtures/futu-scenarios";
const OPTION_RE = /^(?:[A-Z]{2}\.)?[A-Z]{1,6}\d{6}[CP]\d+$/i;

function normalizeTime(v: string): string {
  const m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return v;
  const d = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return m[4]
    ? `${d} ${m[4].padStart(2, "0")}:${m[5]}:${m[6] ?? "00"}`
    : `${d} 00:00:00`;
}

interface ExpectedRow {
  symbol: string;
  sellPrice: number;
  costPrice: number;
  quantity: number;
  profit: number;
  time: string;
  currency: string;
  note: string;
}

function loadScenario(name: string): { trades: Trade[]; expectedByYear: Map<number, ExpectedRow[]> } {
  const tradeRows = parseCSV(readFileSync(`${BASE}/${name}/test_data.csv`, "utf-8"));
  const trades: Trade[] = tradeRows.slice(1).map((r, i) => {
    const symbol = r[0];
    const quantity = Math.abs(Number(r[1]));
    const price = Number(r[2]);
    const side = r[3];
    const currency = r[4] as Currency;
    const fees = Number(r[5]) || 0;
    const isOption = OPTION_RE.test(symbol);
    const direction: "BUY" | "SELL" = /buy/i.test(side) ? "BUY" : "SELL";
    const multiplier = isOption ? 100 : 1;
    return {
      tradeTime: normalizeTime(r[6]),
      symbol,
      market: symbol.startsWith("HK.") ? "HK" : "US",
      category: isOption ? "期权" : "证券",
      direction,
      quantity,
      price,
      currency,
      grossAmount: quantity * price * multiplier,
      fees,
      netAmount: 0,
      sourceRow: i + 1,
    };
  });

  const expectedByYear = new Map<number, ExpectedRow[]>();
  for (const f of readdirSync(`${BASE}/${name}`)) {
    const m = f.match(/^test_data_(\d{4})\.csv$/);
    if (!m) continue;
    const year = Number(m[1]);
    const rows = parseCSV(readFileSync(`${BASE}/${name}/${f}`, "utf-8"));
    expectedByYear.set(
      year,
      rows.slice(1).map((r) => ({
        symbol: r[0],
        sellPrice: Number(r[1]),
        costPrice: Number(r[2]),
        quantity: Number(r[3]),
        profit: Number(r[4]),
        time: r[5],
        currency: r[6],
        note: r[7] ?? "",
      })),
    );
  }

  return { trades, expectedByYear };
}

function runScenario(name: string, method: CostBasisMethod = "WAC") {
  const { trades, expectedByYear } = loadScenario(name);
  const stmt: ParsedStatement = {
    broker: "futu",
    fileName: `${name}.csv`,
    trades,
    dividends: [],
    holdings: [],
    warnings: [],
  };
  const results = calculateTax([stmt], method);

  for (const [year, expected] of expectedByYear) {
    const result = results.find((r) => r.year === year);
    expect(result, `${name}/${year}: 应产出该年度结果`).toBeDefined();

    // 全部预期利润为 0 的场景 (如"仅卖出无买入"): 引擎应报未匹配且不计盈亏
    const allZero = expected.every((e) => e.profit === 0);
    if (allZero) {
      expect(result!.capitalGains.totalGainCNY, `${name}/${year}: 盈亏应为 0`).toBe(0);
      expect(
        result!.capitalGains.unmatchedSellsCount,
        `${name}/${year}: 应报告未匹配卖出`,
      ).toBe(expected.length);
      continue;
    }

    // 逐行核对明细
    expect(
      result!.capitalGains.details.length,
      `${name}/${year}: 明细条数应一致 (实际 ${result!.capitalGains.details.length} vs 预期 ${expected.length})`,
    ).toBe(expected.length);

    for (const exp of expected) {
      const sellDate = exp.time.slice(0, 10);
      const candidates = result!.capitalGains.details.filter(
        (d) =>
          d.symbol === exp.symbol &&
          d.sellDate === sellDate &&
          d.quantity === exp.quantity,
      );
      expect(
        candidates.length,
        `${name}/${year}: 应找到 ${exp.symbol} ${sellDate} x${exp.quantity} 的明细`,
      ).toBe(1);

      const d = candidates[0];
      const symbolLabel = `${name}/${year} ${exp.symbol} ${sellDate}`;

      // 做空期权: 预期"卖出价格"=开仓权利金(对应我明细的 buyPrice), "成本价"=平仓价+费用摊
      const sellPriceMatches = Math.abs(d.sellPrice - exp.sellPrice) < 0.011;
      const flipped = !sellPriceMatches && Math.abs(d.buyPrice - exp.sellPrice) < 0.011;

      if (flipped) {
        expect(Math.abs(d.buyPrice - exp.sellPrice), `${symbolLabel}: 卖出价格(开仓权利金)`).toBeLessThan(0.011);
        expect(Math.abs(d.sellPrice - exp.costPrice), `${symbolLabel}: 成本价(平仓价)`).toBeLessThan(1.0);
      } else {
        expect(Math.abs(d.sellPrice - exp.sellPrice), `${symbolLabel}: 卖出价格`).toBeLessThan(0.011);
        expect(Math.abs(d.buyPrice - exp.costPrice), `${symbolLabel}: 成本价`).toBeLessThan(1.0);
      }

      // 盈亏: 与上游项目同容差 (±1.0)
      expect(
        Math.abs(d.gain.amount - exp.profit),
        `${symbolLabel}: 利润 ${d.gain.amount.toFixed(2)} vs 预期 ${exp.profit.toFixed(2)}`,
      ).toBeLessThanOrEqual(1.0);
    }
  }
}

describe("富途真实交易场景 (marlonlu/futu_tax_calculator)", () => {
  it("01 股票同年完整交易", () => runScenario("01_股票同年完整交易"));
  it("02 股票跨年部分卖出", () => runScenario("02_股票跨年部分卖出"));
  it("03 股票仅卖出无买入 (未匹配)", () => runScenario("03_股票仅卖出无买入"));
  it("04 股票当年买次年卖", () => runScenario("04_股票当年买次年卖"));
  it("05 股票复杂场景", () => runScenario("05_股票复杂场景"));
  it("06 期权做多同年交易", () => runScenario("06_期权做多同年交易"));
  it("07 期权做多跨年交易", () => runScenario("07_期权做多跨年交易"));
  it("08 期权做空同年交易", () => runScenario("08_期权做空同年交易"));
  it("09 期权做空跨年交易", () => runScenario("09_期权做空跨年交易"));
  it("10 期权做多到期作废", () => runScenario("10_期权做多到期作废"));
  it("11 期权做空到期获利", () => runScenario("11_期权做空到期获利"));
  it("12 期权复杂混合交易", () => runScenario("12_期权复杂混合交易"));
  it("13 期权跨年复杂场景", () => runScenario("13_期权跨年复杂场景"));
  it("14 股票期权混合交易", () => runScenario("14_股票期权混合交易"));
});
