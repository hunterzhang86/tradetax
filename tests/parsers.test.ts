import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { parseFutuFromBuffer } from "@/lib/parsers/futu";
import { parseTigerFromBuffer } from "@/lib/parsers/tiger";
import { parseLongbridgeFromBuffer } from "@/lib/parsers/longbridge";
import { detectBroker } from "@/lib/parsers";

function futuWorkbookBuffer(): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["姓名", "牛牛号", "账户号码", "账户名称", "年份"],
      ["张三", "123456", "ACC001", "综合账户", 2024],
    ]),
    "账户信息",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["时期类型", "日期", "代码名称", "交易所/市场", "币种", "数量/面值", "价格", "市值"],
      ["期初", "20240101", "AAPL", "NASDAQ", "USD", 100, 150, 15000],
      ["期末", "20241231", "AAPL", "NASDAQ", "USD", 50, 200, 10000],
    ]),
    "证券-持仓总览",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["成交时间", "代码名称", "交易所/市场", "方向", "币种", "数量/面值", "价格", "成交金额", "总费用", "变动金额"],
      ["2024-02-01 09:30:00", "AAPL", "NASDAQ", "买入", "USD", 100, 150, 15000, 2.5, -15002.5],
      ["2024-06-01 10:00:00", "AAPL", "NASDAQ", "卖出", "USD", 50, 200, 10000, 2, 9998],
    ]),
    "证券-交易流水",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["日期", "类型", "方向", "币种", "变动金额", "备注"],
      ["2024-03-15", "股息", "IN", "USD", 100, "AAPL 10 SHARES DIVIDENDS 10 USD PER SHARE"],
      ["2024-03-15", "股息税", "OUT", "USD", -10, "AAPL 10 SHARES WITHHOLDING TAX -10 USD PER SHARE - TAX"],
    ]),
    "证券-资金进出",
  );
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

function tigerStatementCsv(): string {
  const feesRow = Array.from({ length: 36 }, (_, i) => (i === 23 ? "-2.00" : "0.00")).join(",");
  const dividendFeesRow = Array.from({ length: 36 }, (_, i) => (i === 30 ? "-1.00" : "0.00")).join(",");
  return [
    "Activity Statement,,,2024-01-01 - 2024-12-31",
    "Trades,,,,Symbol,Market,Exchange,Activity Type,Quantity,Trade Price,Amount,Accrued Interest in Trade,Transaction Fee,Other Tripartite fees,Settlement Fee,SEC Fee,Option Regulatory Fee,Stamp Duty,Transaction Levy,Clearing Fee,Trading Activity Fee,Exchange Fee,Future Regulatory Fee,Commission,Platform Fee,Option Settlement Fee,Subscription Fee,Redemption Fee,Switching Fee,PH Stock Transaction Tax,Tax Service Fee,AFRC Transaction Levy,Trading Tariff,Transaction Fee,Brokerage fee,Handing Fee,Securities Management Fee,Transfer Fees (CSDC),Transfer Fees (HKSCC),Stamp Duty On Stock Borrowing,Consolidated Audit Trail Fee,Processing Fee,CM DA SI Fee,DVP SI Fee,IPO Transaction Fee,IPO Process Fee,Ipo Settle Fee,IPO Channel Fee,Realized P/L,Notes,Trade Time,Settle Date,Currency",
    `Trades,Stock,,DATA,"Apple Inc. (AAPL)",US,NASDAQ,Open,100,150.00,15000.00,0.00,${feesRow},,,"2024-02-01\n09:30:00, US/Eastern",2024-02-03,USD`,
    `Trades,Stock,,DATA,"Apple Inc. (AAPL)",US,NASDAQ,Close,-50,200.00,10000.00,0.00,${feesRow},,,"2024-06-01\n10:00:00, US/Eastern",2024-06-03,USD`,
    "Dividends,,,,Symbol,Market,Exchange,Activity Type,Quantity,Trade Price,Amount,Accrued Interest in Trade,Transaction Fee,Other Tripartite fees,Settlement Fee,SEC Fee,Option Regulatory Fee,Stamp Duty,Transaction Levy,Clearing Fee,Trading Activity Fee,Exchange Fee,Future Regulatory Fee,Commission,Platform Fee,Option Settlement Fee,Subscription Fee,Redemption Fee,Switching Fee,PH Stock Transaction Tax,Tax Service Fee,AFRC Transaction Levy,Trading Tariff,Transaction Fee,Brokerage fee,Handing Fee,Securities Management Fee,Transfer Fees (CSDC),Transfer Fees (HKSCC),Stamp Duty On Stock Borrowing,Consolidated Audit Trail Fee,Processing Fee,CM DA SI Fee,DVP SI Fee,IPO Transaction Fee,IPO Process Fee,Ipo Settle Fee,IPO Channel Fee,Realized P/L,Notes,Trade Time,Settle Date,Currency",
    `Dividends,Stock,,DATA,"Apple Inc. (AAPL)",US,NASDAQ,Cash Dividend,10,0.00,100.00,0.00,${dividendFeesRow},,,"2024-03-15\n00:00:00, US/Eastern",2024-03-16,USD`,
  ].join("\n");
}

function longbridgeCsv(): string {
  return [
    "type,date,symbol,market,side,quantity,price,fees,currency,source_country,gross_amount,withholding_tax",
    "trade,2024-02-01,AAPL,US,buy,100,150,2.5,USD,US,,",
    "trade,2024-06-01,AAPL,US,sell,50,200,2,USD,US,,",
    "dividend,2024-03-15,AAPL,US,,,,,USD,US,100,10",
  ].join("\n");
}

function bufferFromString(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

describe("富途 xlsx 解析器", () => {
  const stmt = parseFutuFromBuffer(futuWorkbookBuffer(), "2024_年度账单_20240101.xlsx");

  it("识别年份与账户", () => {
    expect(stmt.year).toBe(2024);
  });

  it("解析交易流水 (2 笔, 方向/金额正确)", () => {
    expect(stmt.trades).toHaveLength(2);
    const [buy, sell] = stmt.trades;
    expect(buy.direction).toBe("BUY");
    expect(buy.symbol).toBe("AAPL");
    expect(buy.quantity).toBe(100);
    expect(buy.price).toBe(150);
    expect(buy.currency).toBe("USD");
    expect(buy.grossAmount).toBe(15000);
    expect(buy.fees).toBe(2.5);
    expect(sell.direction).toBe("SELL");
    expect(sell.quantity).toBe(50);
    expect(sell.grossAmount).toBe(10000);
  });

  it("解析期初/期末持仓", () => {
    expect(stmt.holdings).toHaveLength(2);
    const start = stmt.holdings.find((h) => h.periodType === "期初");
    expect(start?.symbol).toBe("AAPL");
    expect(start?.quantity).toBe(100);
    expect(start?.marketValue).toBe(15000);
  });

  it("从资金进出提取股息与预扣税", () => {
    expect(stmt.dividends).toHaveLength(1);
    const div = stmt.dividends[0];
    expect(div.symbol).toBe("AAPL");
    expect(div.grossAmount).toBe(100);
    expect(div.withholdingTax).toBe(10);
    expect(div.netAmount).toBe(90);
  });
});

describe("老虎 Activity Statement 解析器", () => {
  const stmt = parseTigerFromBuffer(bufferFromString(tigerStatementCsv()), "tiger-statement.csv");

  it("识别文件为老虎账单", () => {
    expect(detectBroker(bufferFromString(tigerStatementCsv()), "tiger.csv")).toBe("tiger");
  });

  it("解析交易 (2 笔, 方向由 Open/Close 决定)", () => {
    expect(stmt.trades).toHaveLength(2);
    const [buy, sell] = stmt.trades;
    expect(buy.direction).toBe("BUY");
    expect(buy.symbol).toBe("AAPL");
    expect(buy.quantity).toBe(100);
    expect(buy.price).toBe(150);
    expect(buy.grossAmount).toBe(15000);
    expect(buy.fees).toBe(2);
    expect(sell.direction).toBe("SELL");
    expect(sell.quantity).toBe(50);
    expect(sell.grossAmount).toBe(10000);
  });

  it("解析多行引号字段的交易时间", () => {
    expect(stmt.trades[0].tradeTime).toBe("2024-02-01 09:30:00");
    expect(stmt.trades[1].tradeTime).toBe("2024-06-01 10:00:00");
  });

  it("解析股息区块 (含预扣税)", () => {
    expect(stmt.dividends).toHaveLength(1);
    expect(stmt.dividends[0].grossAmount).toBe(100);
    expect(stmt.dividends[0].withholdingTax).toBe(1);
  });
});

describe("长桥 CSV 解析器", () => {
  const stmt = parseLongbridgeFromBuffer(bufferFromString(longbridgeCsv()), "longbridge.csv");

  it("识别文件为长桥账单", () => {
    expect(detectBroker(bufferFromString(longbridgeCsv()), "lb.csv")).toBe("longbridge");
  });

  it("解析交易 (含金额兜底计算)", () => {
    expect(stmt.trades).toHaveLength(2);
    const [buy, sell] = stmt.trades;
    expect(buy.direction).toBe("BUY");
    expect(buy.symbol).toBe("AAPL");
    expect(buy.quantity).toBe(100);
    expect(buy.price).toBe(150);
    expect(buy.grossAmount).toBe(15000); // 100 * 150
    expect(buy.fees).toBe(2.5);
    expect(sell.direction).toBe("SELL");
  });

  it("解析股息行 (type=dividend)", () => {
    expect(stmt.dividends).toHaveLength(1);
    const div = stmt.dividends[0];
    expect(div.symbol).toBe("AAPL");
    expect(div.grossAmount).toBe(100);
    expect(div.withholdingTax).toBe(10);
    expect(div.netAmount).toBe(90);
  });
});

describe("券商识别", () => {
  it("xlsx 一律识别为富途", () => {
    expect(detectBroker(new ArrayBuffer(8), "2024_年度账单.xlsx")).toBe("futu");
  });
});
