/**
 * 老虎国际 (Tiger Brokers) 税表 xlsx 解析器
 *
 * 导出路径: 老虎国际 App → 报表/账单报表 → 税表 (或网页平台 报表 → 税务报表)
 * 文件形如 "2025_税表_账户号.xlsx", 工作表:
 *   税务总览 (报表信息 + 关键金额汇总)
 *   交易所得及盈亏 (市场/品类/交易类型/金额/已实现盈亏/币种)
 *   股息收入 (现金分红金额/份额分红市值/负分红金额/分红税/已退回税额/币种)
 *   利息与票息收入 (利息或票息金额/预扣税/币种)
 *   参考汇率
 *
 * 注意: 该税表为券商预计算汇总口径, 已实现盈亏按 FIFO(成本含佣金税费)汇总,
 * 不含逐笔交易, 因此产出 realizedGains 而非逐笔明细。
 */

import * as XLSX from "xlsx";
import { parseNumber } from "@/lib/csv";
import type {
  Currency,
  DividendRecord,
  InterestRecord,
  ParsedStatement,
  ParseWarning,
  RealizedGain,
} from "@/lib/types";

function toCurrency(raw: string): Currency {
  const u = (raw ?? "").toUpperCase().trim();
  if (u.includes("USD") || u.includes("美元")) return "USD";
  if (u.includes("HKD") || u.includes("港")) return "HKD";
  return "CNY";
}

/** 从 税务总览 提取报表信息 (键值对形式) */
function parseOverview(sheet: XLSX.WorkSheet): {
  taxYear?: number;
  costMethod?: string;
  baseCurrency?: string;
  reportRange?: string;
} {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 }) as unknown[][];
  const info: { taxYear?: number; costMethod?: string; baseCurrency?: string; reportRange?: string } = {};
  for (const row of rows) {
    const key = String(row[0] ?? "").trim();
    if (key === "税年") info.taxYear = parseNumber(row[1]);
    if (key === "成本法") info.costMethod = String(row[1] ?? "");
    if (key === "基础货币") info.baseCurrency = String(row[1] ?? "");
    if (key === "报告范围") info.reportRange = String(row[1] ?? "");
  }
  return info;
}

/** 交易所得及盈亏: 已实现盈亏按币种汇总 (券商 FIFO 预计算) */
function parseRealizedGains(sheet: XLSX.WorkSheet, skipped: ParseWarning[]): RealizedGain[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 }) as unknown[][];
  const gains: RealizedGain[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    // 表头/合计行: 交易类型列为空 (数据行必有 买入交易/卖出交易/期权行权 等)
    const tradeType = String(row[2] ?? "").trim();
    if (!tradeType || tradeType === "交易类型") continue;
    const realized = parseNumber(row[4]);
    if (realized === 0) continue;

    const currency = toCurrency(String(row[5] ?? ""));
    if (currency === "CNY") {
      skipped.push({ source: "交易所得及盈亏", row: i + 1, message: `未识别币种: "${String(row[5])}"` });
      continue;
    }
    gains.push({ currency, amount: realized, sourceRow: i + 1 });
  }
  return gains;
}

/** 股息收入: 现金分红金额 + 分红税 */
function parseDividends(sheet: XLSX.WorkSheet): DividendRecord[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 }) as unknown[][];
  const dividends: DividendRecord[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    if (String(row[1] ?? "").trim() === "现金分红金额") continue; // 表头行
    if (String(row[0] ?? "").includes("合计")) continue; // 合计行
    const gross = parseNumber(row[1]);
    if (gross === 0) continue;

    const currency = toCurrency(String(row[6] ?? ""));
    const withholding = Math.abs(parseNumber(row[4])); // 分红税 (负数 = 已扣)
    dividends.push({
      date: "",
      symbol: String(row[0] ?? "汇总"),
      currency,
      grossAmount: gross,
      withholdingTax: withholding,
      netAmount: gross - withholding,
      sourceRow: i + 1,
    });
  }
  return dividends;
}

/** 利息与票息收入: 利息金额 + 预扣税 */
function parseInterests(sheet: XLSX.WorkSheet): InterestRecord[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 }) as unknown[][];
  const interests: InterestRecord[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    if (String(row[1] ?? "").trim() === "利息或票息金额") continue; // 表头行
    if (String(row[0] ?? "").includes("合计")) continue; // 合计行
    const amount = parseNumber(row[1]);
    if (amount === 0) continue;

    const currency = toCurrency(String(row[3] ?? ""));
    interests.push({
      date: "",
      currency,
      amount,
      withholdingTax: Math.abs(parseNumber(row[2])),
      sourceRow: i + 1,
    });
  }
  return interests;
}

/** 从文件名提取年份: "2025_税表_640373.xlsx" -> 2025 */
function yearFromFileName(fileName: string): number | null {
  const m = fileName.match(/(?:^|[^\d])((?:19|20)\d{2})(?=[^\d]*(?:税表|tax))/i);
  return m ? parseInt(m[1], 10) : null;
}

/** 解析老虎税表 xlsx */
export function parseTigerTaxWorkbook(workbook: XLSX.WorkBook, fileName: string): ParsedStatement {
  const warnings: ParseWarning[] = [];
  const overview = parseOverview(workbook.Sheets["税务总览"] ?? {});

  let realizedGains: RealizedGain[] = [];
  let dividends: DividendRecord[] = [];
  let interests: InterestRecord[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (sheetName.includes("交易所得及盈亏")) {
      realizedGains = parseRealizedGains(sheet, warnings);
    } else if (sheetName.includes("股息")) {
      dividends = parseDividends(sheet);
    } else if (sheetName.includes("利息")) {
      interests = parseInterests(sheet);
    }
  }

  if (realizedGains.length === 0 && dividends.length === 0 && interests.length === 0) {
    warnings.push({ source: fileName, row: 1, message: "未从税表中解析到任何收入/盈亏数据" });
  }

  return {
    broker: "tiger",
    fileName,
    year: overview.taxYear ?? yearFromFileName(fileName) ?? undefined,
    trades: [],
    dividends,
    holdings: [],
    warnings,
    realizedGains,
    interests,
    reportNote: [
      overview.reportRange ? `报告范围: ${overview.reportRange}` : "",
      overview.costMethod ? `成本法: ${overview.costMethod}` : "",
      overview.baseCurrency ? `基础货币: ${overview.baseCurrency}` : "",
    ]
      .filter(Boolean)
      .join(" · ") || undefined,
  };
}

/** 从 ArrayBuffer 解析老虎税表 xlsx */
export function parseTigerTaxFromBuffer(buffer: ArrayBuffer, fileName: string): ParsedStatement {
  const workbook = XLSX.read(buffer, { type: "array" });
  return parseTigerTaxWorkbook(workbook, fileName);
}
