/**
 * 富途 (Futu/moomoo) 年度账单 xlsx 解析器
 *
 * 支持文件: 富途牛牛 APP → 账户 → 更多 → 我的税表 → 年度账单 下载的
 * 「XXXX_年度账单_XXXXXXXX.xlsx」
 *
 * 工作表: 账户信息 / 持仓总览 / 交易流水 / 资金进出 / 资金总览 ...
 */

import * as XLSX from "xlsx";
import {
  findColumn,
  normalizeDate,
  normalizeDateTime,
  parseCurrency,
  parseDirection,
  parseNumber,
} from "@/lib/csv";
import type {
  DividendRecord,
  HoldingSnapshot,
  ParsedStatement,
  ParseWarning,
  Trade,
} from "@/lib/types";

interface RowContext {
  headers: string[];
  row: unknown[];
  skipped: ParseWarning[];
  source: string;
}

function getCol(ctx: RowContext, name: string): unknown {
  const idx = findColumn(ctx.headers, [name]);
  return idx >= 0 ? ctx.row[idx] : undefined;
}

/** 从文件名提取年份: 2024_年度账单_xxx.xlsx */
function extractYearFromFileName(fileName: string): number | null {
  const m = fileName.match(/(?:^|[^\d])((?:19|20)\d{2})(?=[^\d]*(?:年度账单|利息股息|月结单))/);
  return m ? parseInt(m[1], 10) : null;
}

function parseAccountSheets(workbook: XLSX.WorkBook, skipped: ParseWarning[]): {
  year?: number;
  holdings: HoldingSnapshot[];
  trades: Trade[];
  fundFlows: Array<{ date: string; currency: string; amount: number; remark: string; sourceRow: number }>;
} {
  const holdings: HoldingSnapshot[] = [];
  const trades: Trade[] = [];
  const fundFlows: Array<{ date: string; currency: string; amount: number; remark: string; sourceRow: number }> = [];
  let year: number | undefined;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 }) as unknown[][];
    if (!data || data.length < 2) continue;

    const headers = (data[0] ?? []).map((h) => String(h ?? ""));
    const ctx: RowContext = { headers, row: [], skipped, source: sheetName };

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;
      ctx.row = row;

      if (sheetName.includes("账户信息")) {
        const y = parseNumber(getCol(ctx, "年份"));
        if (y > 0) year = y;
      } else if (sheetName.includes("持仓总览")) {
        const holding = parseHoldingRow(ctx, i + 1);
        if (holding) holdings.push(holding);
      } else if (sheetName.includes("交易流水")) {
        const trade = parseTradeRow(ctx, i + 1);
        if (trade) trades.push(trade);
      } else if (sheetName.includes("资金进出")) {
        const flow = parseFundFlowRow(ctx, i + 1);
        if (flow) fundFlows.push(flow);
      }
    }
  }

  return { year, holdings, trades, fundFlows };
}

function parseHoldingRow(ctx: RowContext, rowNo: number): HoldingSnapshot | null {
  const periodType = String(getCol(ctx, "时期类型") ?? "");
  if (!periodType.includes("期初") && !periodType.includes("期末")) return null;

  const currency = parseCurrency(getCol(ctx, "币种"));
  if (!currency) return null;

  return {
    periodType: periodType.includes("期初") ? "期初" : "期末",
    date: normalizeDate(getCol(ctx, "日期")),
    symbol: String(getCol(ctx, "代码名称") ?? ""),
    market: String(getCol(ctx, "交易所") ?? getCol(ctx, "市场") ?? ""),
    category: String(getCol(ctx, "品类") ?? "证券") || "证券",
    currency: currency as "USD" | "HKD" | "CNY",
    quantity: Math.abs(parseNumber(getCol(ctx, "数量") ?? getCol(ctx, "面值"))),
    price: parseNumber(getCol(ctx, "价格")),
    multiplier: parseNumber(getCol(ctx, "乘数")) || 1,
    marketValue: parseNumber(getCol(ctx, "市值")),
  };
}

function parseTradeRow(ctx: RowContext, rowNo: number): Trade | null {
  const direction = parseDirection(getCol(ctx, "方向"));
  if (!direction) {
    const symbol = String(getCol(ctx, "代码名称") ?? "");
    if (symbol) {
      ctx.skipped.push({
        source: ctx.source,
        row: rowNo,
        message: `未识别方向字段: "${String(getCol(ctx, "方向"))}"`,
      });
    }
    return null;
  }

  const currencyRaw = parseCurrency(getCol(ctx, "币种"));
  if (!currencyRaw) return null;
  const currency = currencyRaw as "USD" | "HKD" | "CNY";
  const category = String(getCol(ctx, "品类") ?? "证券") || "证券";

  const quantity = Math.abs(parseNumber(getCol(ctx, "数量") ?? getCol(ctx, "面值")));
  const grossAmount = Math.abs(parseNumber(getCol(ctx, "成交金额")));
  const fees = parseNumber(getCol(ctx, "总费用")) + parseNumber(getCol(ctx, "其他费用"));

  return {
    tradeTime: normalizeDateTime(getCol(ctx, "成交时间"), getCol(ctx, "成交时间")),
    symbol: String(getCol(ctx, "代码名称") ?? ""),
    market: String(getCol(ctx, "交易所") ?? getCol(ctx, "市场") ?? ""),
    category,
    direction,
    quantity,
    price: parseNumber(getCol(ctx, "价格")),
    currency,
    grossAmount,
    fees,
    netAmount: parseNumber(getCol(ctx, "变动金额")),
    settlementDate: normalizeDate(getCol(ctx, "交收日期")),
    sourceRow: rowNo,
  };
}

function parseFundFlowRow(ctx: RowContext, rowNo: number): { date: string; currency: string; amount: number; remark: string; sourceRow: number } | null {
  const amount = parseNumber(getCol(ctx, "变动金额"));
  const remark = String(getCol(ctx, "备注") ?? "");
  const currencyRaw = parseCurrency(getCol(ctx, "币种"));
  if (!currencyRaw) return null;

  return {
    date: normalizeDate(getCol(ctx, "日期")),
    currency: currencyRaw as "USD" | "HKD" | "CNY",
    amount,
    remark,
    sourceRow: rowNo,
  };
}

/**
 * 从资金进出记录中提取股息与预扣税
 *
 * 富途备注格式 (已验证):
 *   英文: "MRK 100.00000000 SHARES DIVIDENDS 0.77 USD PER SHARE"
 *         "MRK 100.00000000 SHARES WITHHOLDING TAX -0.07700024 USD PER SHARE - TAX"
 *   标记: "F/D" (现金分红), "S/D" (股票分红), "W/TAX" (预扣税),
 *         "股息税" / "红利税" / "预扣税" / "DIVIDEND"
 */
function extractDividends(
  flows: Array<{ date: string; currency: string; amount: number; remark: string; sourceRow: number }>,
  skipped: ParseWarning[],
): DividendRecord[] {
  const map = new Map<string, DividendRecord>();

  const dividendRe = /^(\S+)\s+([\d.]+)\s+SHARES\s+DIVIDENDS?\s+([\d.]+)\s+(\w+)\s+PER\s+SHARE/i;
  const taxRe = /^(\S+)\s+([\d.]+)\s+SHARES\s+WITHHOLDING\s+TAX/i;
  const IS_DIVIDEND = /F\/D|S\/D|现金分红|股票分红|DIVIDEND|股息|红利/i;
  const IS_TAX = /W\/TAX|WITHHOLDING|股息税|红利税|预扣税|代扣税/i;

  for (const flow of flows) {
    const remark = flow.remark.toUpperCase().trim();
    if (!remark) continue;

    const divMatch = remark.match(dividendRe);
    const taxMatch = remark.match(taxRe);
    const isDividend = divMatch ? true : taxMatch ? false : IS_DIVIDEND.test(remark) && !IS_TAX.test(remark);
    const isTax = taxMatch ? true : !divMatch && IS_TAX.test(remark);

    if (isDividend) {
      const symbol = divMatch ? divMatch[1] : (remark.match(/^(\S+)/) ?? ["", ""])[1];
      if (!symbol) continue;
      const key = `${flow.date}-${symbol}-${flow.currency}-${flow.sourceRow}`;
      if (!map.has(key)) {
        map.set(key, {
          date: flow.date,
          symbol,
          currency: (divMatch ? parseCurrency(divMatch[4]) : flow.currency) as "USD" | "HKD" | "CNY",
          grossAmount: flow.amount,
          withholdingTax: 0,
          netAmount: flow.amount,
          sourceRow: flow.sourceRow,
        });
      }
      continue;
    }

    if (isTax) {
      const symbol = (remark.match(/^(\S+)/) ?? ["", ""])[1];
      const candidates = symbol
        ? Array.from(map.values()).filter((d) => d.symbol === symbol && d.withholdingTax === 0)
        : Array.from(map.values()).filter((d) => d.withholdingTax === 0);
      if (candidates.length > 0) {
        const record = candidates[candidates.length - 1];
        record.withholdingTax = Math.abs(flow.amount);
        record.netAmount = record.grossAmount - record.withholdingTax;
      }
    }
  }

  return Array.from(map.values()).filter((d) => d.grossAmount > 0);
}

/** 解析富途年度账单 xlsx */
export function parseFutuWorkbook(workbook: XLSX.WorkBook, fileName: string): ParsedStatement {
  const warnings: ParseWarning[] = [];
  const { year: accountYear, holdings, trades, fundFlows } = parseAccountSheets(workbook, warnings);
  const fileYear = extractYearFromFileName(fileName);
  const dividends = extractDividends(fundFlows, warnings);

  return {
    broker: "futu",
    fileName,
    year: fileYear ?? accountYear,
    trades,
    dividends,
    holdings,
    warnings,
  };
}

/** 从 ArrayBuffer 解析富途年度账单 */
export function parseFutuFromBuffer(buffer: ArrayBuffer, fileName: string): ParsedStatement {
  const workbook = XLSX.read(buffer, { type: "array" });
  return parseFutuWorkbook(workbook, fileName);
}
