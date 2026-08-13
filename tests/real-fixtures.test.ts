/**
 * 真实样本回归测试: 老虎国际 Activity Statement (来源: MarketMonk 解析器测试夹具)
 *
 * 验证真实导出的解析: 固定列索引、多行引号时间字段、负数金额(卖出)、
 * 费用列汇总、Realized P/L 忽略、Holdings 区块忽略。
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseTigerFromBuffer } from "@/lib/parsers/tiger";
import { calculateTax } from "@/lib/calculator";
import { detectBroker } from "@/lib/parsers";

function fixtureBuffer(name: string): ArrayBuffer {
  const text = readFileSync(`tests/fixtures/${name}`, "utf-8");
  return new TextEncoder().encode(text).buffer;
}

describe("老虎 Activity Statement 真实夹具", () => {
  const stmt = parseTigerFromBuffer(fixtureBuffer("tiger-activity-statement.csv"), "tiger-activity-statement.csv");

  it("识别为老虎账单", () => {
    expect(detectBroker(fixtureBuffer("tiger-activity-statement.csv"), "s.csv")).toBe("tiger");
  });

  it("解析 3 笔交易 (AAPL 开/平 + META 开), 忽略 Holdings 区块", () => {
    expect(stmt.trades).toHaveLength(3);
    expect(stmt.dividends).toHaveLength(0);
  });

  it("Open/Close 方向正确, 负数金额取绝对值", () => {
    const [aaplOpen, aaplClose, metaOpen] = stmt.trades;
    expect(aaplOpen.direction).toBe("BUY");
    expect(aaplOpen.symbol).toBe("AAPL");
    expect(aaplOpen.quantity).toBe(10);
    expect(aaplOpen.price).toBe(150);
    expect(aaplOpen.grossAmount).toBe(1500);
    expect(aaplOpen.fees).toBe(2);

    expect(aaplClose.direction).toBe("SELL");
    expect(aaplClose.quantity).toBe(5);
    expect(aaplClose.grossAmount).toBe(900); // -900 取绝对值
    expect(aaplClose.fees).toBe(2);

    expect(metaOpen.direction).toBe("BUY");
    expect(metaOpen.symbol).toBe("META"); // 引号内 "Name (TICKER)" 提取
    expect(metaOpen.quantity).toBe(3);
  });

  it("多行引号时间字段正确归一化", () => {
    expect(stmt.trades[0].tradeTime).toBe("2025-03-01 09:30:00");
    expect(stmt.trades[1].tradeTime).toBe("2025-06-01 09:30:00");
    expect(stmt.trades[2].tradeTime).toBe("2025-04-01 09:30:00");
  });

  it("计算已实现盈亏: AAPL 5 股平仓", () => {
    const result = calculateTax([stmt])[0];
    expect(result.year).toBe(2025);
    const d = result.capitalGains.details.find((x) => x.symbol === "AAPL");
    // 900 - 1500*5/10 - (2*5/10 + 2) = 900 - 750 - 3 = 147
    expect(d?.gain.amount).toBeCloseTo(147, 2);
  });
});

describe("老虎 NVDA 平仓真实夹具", () => {
  const stmt = parseTigerFromBuffer(fixtureBuffer("tiger-nvda-closed.csv"), "tiger-nvda-closed.csv");

  it("解析 2 笔交易并计算盈亏 (含 Realized P/L 列被忽略)", () => {
    expect(stmt.trades).toHaveLength(2);
    const result = calculateTax([stmt])[0];
    const d = result.capitalGains.details.find((x) => x.symbol === "NVDA");
    // 2000 - 1000 - (2 + 2) = 996
    expect(d?.gain.amount).toBeCloseTo(996, 2);
    // 费用不应把 Realized P/L (1,000.00) 计入
    expect(d?.fees.amount).toBe(4);
  });
});
