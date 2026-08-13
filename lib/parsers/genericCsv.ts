/**
 * 通用 CSV 账单解析器
 *
 * 老虎/长桥等券商导出的 CSV 表头各异, 本模块通过"列关键词映射"配置
 * 将任意 CSV 归一化为内部模型, 并支持股息行识别。表头采用模糊匹配,
 * 对中英文列名、表头顺序变化均有较好容错。
 */

import {
  findColumn,
  normalizeDate,
  parseCSV,
  parseCurrency,
  parseDirection,
  parseNumber,
} from "@/lib/csv";
import type {
  BrokerId,
  DividendRecord,
  ParsedStatement,
  ParseWarning,
  Trade,
} from "@/lib/types";

export interface CsvColumnConfig {
  tradeTime: string[];
  symbol: string[];
  name: string[];
  market: string[];
  /** 交易类型/品类 (股票/期权/股息...) */
  category: string[];
  direction: string[];
  quantity: string[];
  price: string[];
  currency: string[];
  grossAmount: string[];
  /** 总费用列 (佣金/印花税/平台费) */
  fees: string[];
  /** 变动金额/净结算金额 */
  netAmount: string[];
  settlementDate: string[];
  /** 备注/描述 */
  remark: string[];
  /** 股息总额 (股息行专用) */
  dividendAmount: string[];
  /** 预扣税 (股息行专用) */
  withholdingTax: string[];
}

export interface CsvStatementConfig {
  broker: BrokerId;
  /** 分隔符, 默认逗号 */
  delimiter?: string;
  columns: CsvColumnConfig;
  /** 文件名匹配 (识别券商文件) */
  fileMatch: RegExp;
  /** 股息行识别与构造; 返回 null 表示该行不是股息行 */
  detectDividend?: (
    raw: Record<string, string>,
    rowNo: number,
  ) => Omit<DividendRecord, "sourceRow"> | null;
  /** 年份来源: 文件名正则 (可选) */
  yearFromFile?: (fileName: string) => number | null;
}

interface HeaderIndex {
  [key: string]: number;
}

/** 将一行原始数据按配置映射为列索引 -> 值 */
function buildRow(
  headers: string[],
  row: string[],
  columns: CsvColumnConfig,
  skipped: ParseWarning[],
  source: string,
): { value: (key: keyof CsvColumnConfig) => string; raw: Record<string, string> } {
  const idx: HeaderIndex = {};
  for (const key of Object.keys(columns) as Array<keyof CsvColumnConfig>) {
    const keywords = columns[key];
    if (!keywords || keywords.length === 0) continue;
    const found = findColumn(headers, keywords);
    if (found >= 0) idx[key] = found;
  }

  const raw: Record<string, string> = {};
  for (const [key, i] of Object.entries(idx)) {
    raw[key] = String(row[i] ?? "").trim();
  }

  return {
    value: (key: keyof CsvColumnConfig) => raw[key] ?? "",
    raw,
  };
}

/** 将 "2024-01-15 09:30:00" / "2024/1/15 9:30" / "20240115" 归一化 */
function normalizeTradeTime(value: string): string {
  const parts = value.split(/[\sT]+/).filter(Boolean);
  if (parts.length >= 2) {
    const date = normalizeDate(parts[0]);
    const time = parts[1];
    const tm = time.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (date && tm) {
      return `${date} ${tm[1].padStart(2, "0")}:${tm[2]}:${tm[3] ?? "00"}`;
    }
  }
  const date = normalizeDate(value);
  return date ? `${date} 00:00:00` : "";
}

/** 解析一个 CSV 语句文件 */
export function parseStatementCSV(
  text: string,
  fileName: string,
  config: CsvStatementConfig,
): ParsedStatement {
  const rows = parseCSV(text);
  const warnings: ParseWarning[] = [];
  const trades: Trade[] = [];
  const dividends: DividendRecord[] = [];

  if (rows.length < 2) {
    warnings.push({ source: fileName, row: 1, message: "文件为空或缺少表头" });
    return {
      broker: config.broker,
      fileName,
      trades,
      dividends,
      holdings: [],
      warnings,
    };
  }

  const headers = rows[0];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const { value, raw } = buildRow(headers, row, config.columns, warnings, fileName);

    // 1) 先尝试识别为股息行
    if (config.detectDividend) {
      const div = config.detectDividend(raw, i + 1);
      if (div) {
        dividends.push({ ...div, sourceRow: i + 1 });
        continue;
      }
    }

    // 2) 再尝试识别为交易行
    const direction = parseDirection(value("direction"));
    const symbol = value("symbol");
    const currencyRaw = parseCurrency(value("currency"));

    if (!direction || !symbol) {
      // 非交易行: 记录告警 (金额为 0 的纯表头/汇总行不报)
      const amount = parseNumber(value("grossAmount")) || parseNumber(value("netAmount"));
      if (amount !== 0) {
        warnings.push({
          source: fileName,
          row: i + 1,
          message: `无法识别: 方向="${value("direction")}" 代码="${symbol}"`,
        });
      }
      continue;
    }

    const currency = currencyRaw as "USD" | "HKD" | "CNY";
    const quantity = Math.abs(parseNumber(value("quantity")));
    let grossAmount = Math.abs(parseNumber(value("grossAmount")));
    if (grossAmount === 0 && quantity > 0) {
      grossAmount = quantity * Math.abs(parseNumber(value("price")));
    }
    const fees = parseNumber(value("fees"));
    const category = value("category") || "证券";

    const trade: Trade = {
      tradeTime: normalizeTradeTime(value("tradeTime")) || normalizeTradeTime(raw.tradeTime ?? ""),
      symbol,
      name: value("name") || undefined,
      market: value("market") || undefined,
      category,
      direction,
      quantity,
      price: parseNumber(value("price")),
      currency,
      grossAmount,
      fees,
      netAmount: parseNumber(value("netAmount")) || (direction === "BUY" ? -grossAmount : grossAmount),
      settlementDate: value("settlementDate") ? normalizeDate(value("settlementDate")) : undefined,
      remark: value("remark") || undefined,
      sourceRow: i + 1,
    };

    if (!trade.tradeTime) {
      warnings.push({ source: fileName, row: i + 1, message: `交易行缺少日期: ${symbol}` });
    }
    trades.push(trade);
  }

  return {
    broker: config.broker,
    fileName,
    year: config.yearFromFile ? config.yearFromFile(fileName) ?? undefined : undefined,
    trades,
    dividends,
    holdings: [],
    warnings,
  };
}
