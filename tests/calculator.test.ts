import { describe, expect, it } from "vitest";
import { calculateTax, calculateTaxForYear } from "@/lib/calculator";
import { convertToCNY } from "@/lib/exchange";
import type { ParsedStatement, Trade } from "@/lib/types";

function trade(partial: Partial<Trade> & Pick<Trade, "symbol" | "tradeTime" | "direction" | "quantity">): Trade {
  return {
    name: undefined,
    market: undefined,
    category: "证券",
    price: 0,
    currency: "USD",
    grossAmount: 0,
    fees: 0,
    netAmount: 0,
    settlementDate: undefined,
    remark: undefined,
    sourceRow: 1,
    ...partial,
  };
}

function stmt(overrides?: Partial<ParsedStatement>): ParsedStatement {
  return {
    broker: "longbridge",
    fileName: "test.csv",
    year: 2024,
    trades: [],
    dividends: [],
    holdings: [],
    warnings: [],
    ...overrides,
  };
}

describe("汇率", () => {
  it("2024 年美元汇率换算", () => {
    expect(convertToCNY(100, "USD", 2024)).toBeCloseTo(718.84, 2);
    expect(convertToCNY(100, "HKD", 2024)).toBeCloseTo(92.604, 2);
    expect(convertToCNY(100, "CNY", 2024)).toBe(100);
  });

  it("不支持的年份抛错", () => {
    expect(() => convertToCNY(100, "USD", 2019)).toThrow();
  });
});

describe("资本利得税 (FIFO)", () => {
  const s = stmt({
    trades: [
      trade({ symbol: "AAPL", tradeTime: "2024-02-01 09:30:00", direction: "BUY", quantity: 100, price: 150, grossAmount: 15000, fees: 2.5 }),
      trade({ symbol: "AAPL", tradeTime: "2024-06-01 10:00:00", direction: "SELL", quantity: 50, price: 200, grossAmount: 10000, fees: 2 }),
    ],
  });

  const result = calculateTax([s], "FIFO")[0];

  it("计算已实现盈亏 (含费用)", () => {
    // 卖出 50 股: 50*200 - 50*150 - (2.5*50/100 + 2) = 2496.75 USD
    expect(result.capitalGains.details).toHaveLength(1);
    const d = result.capitalGains.details[0];
    expect(d.gain.amount).toBeCloseTo(2496.75, 2);
    expect(d.gainCNY.amount).toBeCloseTo(2496.75 * 7.1884, 2);
  });

  it("应税所得与税额", () => {
    const cg = result.capitalGains;
    expect(cg.totalGainCNY).toBeCloseTo(2496.75 * 7.1884, 2);
    expect(cg.taxableGainCNY).toBe(cg.totalGainCNY);
    expect(cg.taxAmountCNY).toBeCloseTo(cg.totalGainCNY * 0.2, 2);
  });
});

describe("年度盈亏互抵", () => {
  it("盈利与亏损互抵后仅对净盈利计税", () => {
    const s = stmt({
      trades: [
        trade({ symbol: "AAPL", tradeTime: "2024-02-01 09:30:00", direction: "BUY", quantity: 100, price: 150, grossAmount: 15000 }),
        trade({ symbol: "AAPL", tradeTime: "2024-06-01 10:00:00", direction: "SELL", quantity: 100, price: 120, grossAmount: 12000 }),
        trade({ symbol: "MSFT", tradeTime: "2024-03-01 09:30:00", direction: "BUY", quantity: 10, price: 100, grossAmount: 1000 }),
        trade({ symbol: "MSFT", tradeTime: "2024-04-01 10:00:00", direction: "SELL", quantity: 10, price: 200, grossAmount: 2000 }),
      ],
    });
    const cg = calculateTax([s])[0].capitalGains;
    // AAPL 亏 3000, MSFT 赚 1000 -> 净亏 2000 -> 应税 0
    expect(cg.totalGainCNY).toBeCloseTo(-2000 * 7.1884, 2);
    expect(cg.taxableGainCNY).toBe(0);
    expect(cg.taxAmountCNY).toBe(0);
  });
});

describe("FIFO vs HIFO", () => {
  const trades = [
    trade({ symbol: "AAPL", tradeTime: "2024-01-01 09:30:00", direction: "BUY", quantity: 100, price: 100, grossAmount: 10000 }),
    trade({ symbol: "AAPL", tradeTime: "2024-03-01 09:30:00", direction: "BUY", quantity: 100, price: 200, grossAmount: 20000 }),
    trade({ symbol: "AAPL", tradeTime: "2024-05-01 10:00:00", direction: "SELL", quantity: 100, price: 150, grossAmount: 15000 }),
  ];

  it("FIFO 优先匹配最早买入", () => {
    const d = calculateTax([stmt({ trades })], "FIFO")[0].capitalGains.details[0];
    expect(d.buyPrice).toBe(100); // 成本用 100 的批次
    expect(d.gain.amount).toBeCloseTo(5000, 2);
  });

  it("HIFO 优先匹配成本最高批次", () => {
    const d = calculateTax([stmt({ trades })], "HIFO")[0].capitalGains.details[0];
    expect(d.buyPrice).toBe(200); // 成本用 200 的批次
    expect(d.gain.amount).toBeCloseTo(-5000, 2);
  });
});

describe("股息税与境外抵免", () => {
  it("境外已扣税限额内抵免", () => {
    const s = stmt({
      dividends: [
        { date: "2024-03-15", symbol: "AAPL", currency: "USD", grossAmount: 100, withholdingTax: 10, netAmount: 90, sourceRow: 1 },
      ],
    });
    const dt = calculateTax([s])[0].dividendTax;
    // 100 USD = 718.84 CNY, 税 143.768, 抵免 min(71.884, 143.768)
    expect(dt.totalDividendCNY).toBeCloseTo(718.84, 2);
    expect(dt.grossTaxCNY).toBeCloseTo(143.768, 2);
    expect(dt.taxCreditCNY).toBeCloseTo(71.884, 2);
    expect(dt.netTaxDueCNY).toBeCloseTo(71.884, 2);
  });
});

describe("期初持仓成本估算", () => {
  it("期初持仓作为跨年买入成本并标注估算", () => {
    const s = stmt({
      holdings: [
        { periodType: "期初", date: "2024-01-01", symbol: "AAPL", category: "证券", currency: "USD", quantity: 100, price: 150, multiplier: 1, marketValue: 15000 },
      ],
      trades: [
        trade({ symbol: "AAPL", tradeTime: "2024-06-01 10:00:00", direction: "SELL", quantity: 50, price: 200, grossAmount: 10000 }),
      ],
    });
    const d = calculateTax([s])[0].capitalGains.details[0];
    expect(d.isEstimatedCost).toBe(true);
    expect(d.buyPrice).toBe(150);
    expect(d.gain.amount).toBeCloseTo(2500, 2); // 50*200 - 50*150
  });
});

describe("未匹配卖出", () => {
  it("超出买入数量的卖出计入未匹配", () => {
    const s = stmt({
      trades: [
        trade({ symbol: "AAPL", tradeTime: "2024-02-01 09:30:00", direction: "BUY", quantity: 10, price: 100, grossAmount: 1000 }),
        trade({ symbol: "AAPL", tradeTime: "2024-06-01 10:00:00", direction: "SELL", quantity: 15, price: 200, grossAmount: 3000 }),
      ],
    });
    const cg = calculateTax([s])[0].capitalGains;
    expect(cg.details).toHaveLength(1); // 只匹配 10 股
    expect(cg.unmatchedSellsQty).toBe(5);
    expect(cg.unmatchedSellsCount).toBe(1);
  });
});

describe("汇总与多年度", () => {
  it("汇总应纳税总额与实际应缴", () => {
    const s = stmt({
      trades: [
        trade({ symbol: "AAPL", tradeTime: "2024-02-01 09:30:00", direction: "BUY", quantity: 100, price: 150, grossAmount: 15000 }),
        trade({ symbol: "AAPL", tradeTime: "2024-06-01 10:00:00", direction: "SELL", quantity: 100, price: 200, grossAmount: 20000 }),
      ],
    });
    const r = calculateTax([s])[0];
    const gainCNY = 5000 * 7.1884;
    expect(r.summary.totalTaxDueCNY).toBeCloseTo(gainCNY * 0.2, 2);
    expect(r.summary.netTaxPayableCNY).toBeCloseTo(gainCNY * 0.2, 2);
    expect(r.stats.tradeCount).toBe(2);
  });

  it("多年度分别计算并按年份倒序", () => {
    const s = stmt({
      trades: [
        trade({ symbol: "AAPL", tradeTime: "2023-02-01 09:30:00", direction: "BUY", quantity: 10, price: 100, grossAmount: 1000 }),
        trade({ symbol: "AAPL", tradeTime: "2023-06-01 10:00:00", direction: "SELL", quantity: 10, price: 150, grossAmount: 1500 }),
        trade({ symbol: "AAPL", tradeTime: "2024-02-01 09:30:00", direction: "BUY", quantity: 10, price: 100, grossAmount: 1000 }),
        trade({ symbol: "AAPL", tradeTime: "2024-06-01 10:00:00", direction: "SELL", quantity: 10, price: 150, grossAmount: 1500 }),
      ],
    });
    const results = calculateTax([s]);
    expect(results.map((r) => r.year)).toEqual([2024, 2023]);
    expect(results[0].exchangeRate.USD).toBe(718.84);
    expect(results[1].exchangeRate.USD).toBe(708.27);
  });

  it("无汇率数据的年份被跳过", () => {
    const s = stmt({
      year: 2019,
      trades: [
        trade({ symbol: "AAPL", tradeTime: "2019-02-01 09:30:00", direction: "BUY", quantity: 10, price: 100, grossAmount: 1000 }),
        trade({ symbol: "AAPL", tradeTime: "2019-06-01 10:00:00", direction: "SELL", quantity: 10, price: 150, grossAmount: 1500 }),
      ],
    });
    expect(calculateTax([s])).toHaveLength(0);
    expect(calculateTaxForYear(2019, [s])).toBeNull();
  });
});
