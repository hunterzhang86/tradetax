/**
 * 老虎国际 (Tiger Brokers) Activity Statement CSV 解析器
 *
 * 导出路径: 老虎国际 APP → 老虎账户 → 账单报表 → 自定义 → CSV 格式
 * (勾选「显示详细交易记录」)
 *
 * 格式特征 (已验证, 来源: MarketMonk 解析器测试夹具):
 * - 第 1 行: 元数据 "Activity Statement,,,2025-01-01 - 2025-12-31"
 * - 各区块有独立表头行, 行首为区块名 ("Trades", "Dividends" ...)
 * - 固定列索引 (非表头匹配), 交易时间是多行引号字段
 * - 费用分散在多个专列 (佣金/印花税/平台费/结算费...), 汇总后计入成本
 */

import { decodeBuffer, normalizeDate, parseCSV, parseNumber } from "@/lib/csv";
import type { DividendRecord, ParsedStatement, ParseWarning, Trade } from "@/lib/types";

const TIGER_HEADER_KEY = "ACTIVITY STATEMENT";

/** 列索引 (基于已验证表头) */
const COL = {
  rowType: 0,
  productType: 1,
  dataMarker: 3,
  symbol: 4,
  market: 5,
  exchange: 6,
  activityType: 7,
  quantity: 8,
  price: 9,
  amount: 10,
  // 费用列区间 (交易费/其他三方费/结算费/SEC费/期权监管费/印花税/征费/清算费/
  // 交易活跃费/交易所费/期货监管费/佣金/平台费/期权结算费/认购费/赎回费/转换费/
  // 菲律宾股票交易税/税务服务费/征费/交易费/经纪费/过户费/证券管理费/各类转仓费)
  feesStart: 12,
  feesEnd: 48, // 半开区间 12..47: 各类费用, 不含第 48 列 Realized P/L
  tradeTime: 50,
  settleDate: 51,
  currency: 52,
} as const;

interface StatementSection {
  headerRow: number;
  dataRows: number[];
}

/** 定位各区块 (表头行 = 行首为区块名且第 5 列是 "Symbol") */
function findSections(rows: string[][]): Map<string, StatementSection> {
  const sections = new Map<string, StatementSection>();
  let current: StatementSection | null = null;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowType = (row[COL.rowType] ?? "").trim();
    const symbolCol = (row[COL.symbol] ?? "").trim().toUpperCase();

    if (symbolCol === "SYMBOL" && rowType) {
      current = { headerRow: i, dataRows: [] };
      sections.set(rowType.toUpperCase(), current);
      continue;
    }

    if (current && rowType && (row[COL.dataMarker] ?? "").toUpperCase() === "DATA") {
      current.dataRows.push(i);
    }
  }

  return sections;
}

/** 从 "Apple (AAPL)" 提取 AAPL; 无括号则原样返回 */
function extractSymbol(raw: string): string {
  const match = raw.trim().match(/\(([^)]+)\)\s*$/);
  return (match ? match[1] : raw.trim()).toUpperCase();
}

function sumFees(row: string[]): number {
  let total = 0;
  for (let i = COL.feesStart; i < COL.feesEnd; i++) {
    const v = parseNumber(row[i]);
    if (v !== 0) total += Math.abs(v);
  }
  return total;
}

function parseTradeRow(row: string[], rowNo: number, warnings: ParseWarning[]): Trade | null {
  const symbol = extractSymbol(row[COL.symbol] ?? "");
  const activityType = (row[COL.activityType] ?? "").toUpperCase();
  const quantityRaw = parseNumber(row[COL.quantity]);
  const currency = ((row[COL.currency] ?? "").trim().toUpperCase() || "USD") as "USD" | "HKD" | "CNY";
  const amount = Math.abs(parseNumber(row[COL.amount]));
  const quantity = Math.abs(quantityRaw);

  if (!symbol || quantity === 0 || amount === 0) {
    if (symbol) {
      warnings.push({ source: "Trades", row: rowNo, message: `交易行数据不完整: ${symbol}` });
    }
    return null;
  }

  const direction: "BUY" | "SELL" =
    activityType === "OPEN" || quantityRaw > 0 ? "BUY" : "SELL";

  const timeRaw = (row[COL.tradeTime] ?? "").trim();
  const [datePart, timePart] = timeRaw.split(/\n/);
  const date = normalizeDate(datePart ?? "");
  const timeMatch = timePart?.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  const tradeTime = date
    ? `${date} ${timeMatch ? `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}:${timeMatch[3] ?? "00"}` : "00:00:00"}`
    : "";

  const fees = sumFees(row);

  return {
    tradeTime,
    symbol,
    name: (row[COL.symbol] ?? "").trim() || undefined,
    market: (row[COL.market] ?? "").trim() || undefined,
    category: (row[COL.productType] ?? "").trim() === "Stock" ? "证券" : (row[COL.productType] ?? "").trim() || "证券",
    direction,
    quantity,
    price: parseNumber(row[COL.price]),
    currency,
    grossAmount: amount,
    fees,
    netAmount: direction === "BUY" ? -(amount + fees) : amount - fees,
    settlementDate: normalizeDate(row[COL.settleDate] ?? ""),
    sourceRow: rowNo,
  };
}

function parseDividendRow(row: string[], rowNo: number): DividendRecord | null {
  const symbol = extractSymbol(row[COL.symbol] ?? "");
  const amount = Math.abs(parseNumber(row[COL.amount]));
  const currency = ((row[COL.currency] ?? "").trim().toUpperCase() || "USD") as "USD" | "HKD" | "CNY";

  if (!symbol || amount === 0) return null;

  const date = normalizeDate((row[COL.tradeTime] ?? "").split(/\n/)[0] ?? "");

  // 预扣税通常出现在费用列 (负数), 取其中的税务类费用
  const feeSum = sumFees(row);

  return {
    date,
    symbol,
    currency,
    grossAmount: amount,
    withholdingTax: feeSum,
    netAmount: amount - feeSum,
    sourceRow: rowNo,
  };
}

export function parseTigerFromBuffer(buffer: ArrayBuffer, fileName: string): ParsedStatement {
  const text = decodeBuffer(buffer);
  const rows = parseCSV(text);
  const warnings: ParseWarning[] = [];
  const trades: Trade[] = [];
  const dividends: DividendRecord[] = [];

  if (rows.length < 2) {
    warnings.push({ source: fileName, row: 1, message: "文件为空或缺少表头" });
    return { broker: "tiger", fileName, trades, dividends, holdings: [], warnings };
  }

  const firstLine = rows[0][0] ?? "";
  if (!firstLine.toUpperCase().includes(TIGER_HEADER_KEY)) {
    warnings.push({
      source: fileName,
      row: 1,
      message: "未识别到 Activity Statement 标记, 文件可能不是老虎账单导出",
    });
  }

  const sections = findSections(rows);
  const tradeSection = sections.get("TRADES");
  const dividendSection = sections.get("DIVIDENDS") ?? sections.get("DIVIDEND");

  if (tradeSection) {
    for (const i of tradeSection.dataRows) {
      const trade = parseTradeRow(rows[i], i + 1, warnings);
      if (trade) trades.push(trade);
    }
  }

  if (dividendSection) {
    for (const i of dividendSection.dataRows) {
      const div = parseDividendRow(rows[i], i + 1);
      if (div) dividends.push(div);
    }
  }

  if (trades.length === 0 && dividends.length === 0 && warnings.length === 0) {
    warnings.push({ source: fileName, row: 1, message: "未解析到任何交易或股息记录" });
  }

  return {
    broker: "tiger",
    fileName,
    year: undefined,
    trades,
    dividends,
    holdings: [],
    warnings,
  };
}
