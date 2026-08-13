import { describe, expect, it } from "vitest";
import {
  decodeBuffer,
  findColumn,
  normalizeDate,
  normalizeDateTime,
  parseCSV,
  parseCurrency,
  parseDirection,
  parseNumber,
} from "@/lib/csv";

describe("parseCSV", () => {
  it("解析简单 CSV", () => {
    expect(parseCSV("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("剥离 UTF-8 BOM", () => {
    expect(parseCSV("\uFEFFa,b\n1,2")[0]).toEqual(["a", "b"]);
  });

  it("支持 CRLF 换行", () => {
    expect(parseCSV("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("支持引号包裹含逗号的字段", () => {
    const rows = parseCSV('name,note\n"Apple, Inc.",hello');
    expect(rows[1]).toEqual(["Apple, Inc.", "hello"]);
  });

  it("支持引号内换行 (多行字段)", () => {
    const rows = parseCSV('a,b\n"2024-01-01\n09:30:00, US/Eastern",x');
    expect(rows[1][0]).toBe("2024-01-01\n09:30:00, US/Eastern");
  });

  it("支持双引号转义", () => {
    const rows = parseCSV('a\n"say ""hi"""');
    expect(rows[1][0]).toBe('say "hi"');
  });

  it("跳过空行", () => {
    expect(parseCSV("a,b\n\n1,2\n\n")).toHaveLength(2);
  });

  it("处理中文与 GBK 回退解码", () => {
    const gbk = new TextEncoder().encode("类型,金额\n买入,100");
    // 正常 UTF-8 文本不应触发回退
    const buf = gbk.buffer.slice(gbk.byteOffset, gbk.byteOffset + gbk.byteLength) as ArrayBuffer;
    expect(decodeBuffer(buf)).toContain("买入");
  });
});

describe("findColumn", () => {
  it("模糊匹配中英文表头", () => {
    const headers = ["成交时间", "代码名称", "交易所/市场", "方向", "币种"];
    expect(findColumn(headers, ["成交时间", "时间"])).toBe(0);
    expect(findColumn(headers, ["Ticker", "代码"])).toBe(1);
    expect(findColumn(headers, ["方向", "Side"])).toBe(3);
    expect(findColumn(headers, ["不存在的列"])).toBe(-1);
  });
});

describe("parseNumber", () => {
  it("解析千分位与货币符号", () => {
    expect(parseNumber("1,234.56")).toBe(1234.56);
    expect(parseNumber("$150.00")).toBe(150);
    expect(parseNumber("-2.00")).toBe(-2);
    expect(parseNumber("(100)")).toBe(-100);
    expect(parseNumber("")).toBe(0);
    expect(parseNumber("--")).toBe(0);
  });
});

describe("parseCurrency / parseDirection", () => {
  it("识别币种", () => {
    expect(parseCurrency("USD")).toBe("USD");
    expect(parseCurrency("美元")).toBe("USD");
    expect(parseCurrency("HKD")).toBe("HKD");
    expect(parseCurrency("港币")).toBe("HKD");
    expect(parseCurrency("CNY")).toBe("CNY");
  });

  it("识别买卖方向", () => {
    expect(parseDirection("买入")).toBe("BUY");
    expect(parseDirection("卖出开仓")).toBe("SELL");
    expect(parseDirection("买入平仓")).toBe("BUY");
    expect(parseDirection("buy")).toBe("BUY");
    expect(parseDirection("sell")).toBe("SELL");
    expect(parseDirection("Open")).toBe(null); // 老虎的 Open/Close 由专用解析器处理
    expect(parseDirection("")).toBe(null);
  });
});

describe("normalizeDate / normalizeDateTime", () => {
  it("归一化多种日期格式", () => {
    expect(normalizeDate("2024-01-15")).toBe("2024-01-15");
    expect(normalizeDate("2024/1/15")).toBe("2024-01-15");
    expect(normalizeDate("20240115")).toBe("2024-01-15");
    expect(normalizeDate("2024年1月15日")).toBe("2024-01-15");
  });

  it("日期时间合并归一化", () => {
    expect(normalizeDateTime("2024-01-15", "09:30")).toBe("2024-01-15 09:30:00");
    expect(normalizeDateTime("2024-01-15", "9:30:05")).toBe("2024-01-15 09:30:05");
  });
});
