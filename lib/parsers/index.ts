/**
 * 券商适配器注册表: 自动识别文件属于哪家券商并解析
 */

import type { BrokerId, ParsedStatement } from "@/lib/types";
import * as XLSX from "xlsx";
import { parseFutuFromBuffer } from "./futu";
import { parseLongbridgeFromBuffer } from "./longbridge";
import { parseTigerFromBuffer } from "./tiger";
import { parseTigerTaxFromBuffer } from "./tigerTax";

export interface BrokerMeta {
  id: BrokerId;
  name: string;
  shortName: string;
  fileHint: string;
}

export const BROKERS: BrokerMeta[] = [
  { id: "futu", name: "富途牛牛 / moomoo", shortName: "富途", fileHint: "年度账单.xlsx" },
  { id: "tiger", name: "老虎国际", shortName: "老虎", fileHint: "交易明细.csv / 税表.xlsx" },
  { id: "longbridge", name: "长桥", shortName: "长桥", fileHint: "交易记录.csv" },
];

function isExcel(fileName: string): boolean {
  return /\.(xlsx|xls)$/i.test(fileName);
}

/** xlsx 文件按工作表名区分券商 (富途年度账单 vs 老虎税表) */
function sniffExcelBroker(buffer: ArrayBuffer, fileName: string): BrokerId | null {
  if (/税表|税务|tax/i.test(fileName) && !/年度账单/.test(fileName)) return "tiger";
  try {
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheets = workbook.SheetNames.join(" ");
    if (/交易流水|持仓总览|账户信息/.test(sheets)) return "futu";
    if (/税务总览|交易所得及盈亏/.test(sheets)) return "tiger";
  } catch {
    return null;
  }
  return null;
}

function sniffHeader(buffer: ArrayBuffer): string {
  const text = new TextDecoder("utf-8").decode(buffer.slice(0, 4096));
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .slice(0, 3)
    .join("\n");
}

/**
 * 识别文件所属券商:
 * - xlsx -> 按文件名/工作表名区分富途年度账单与老虎税表
 * - csv -> 按表头关键词区分老虎/长桥
 */
export function detectBroker(buffer: ArrayBuffer, fileName: string): BrokerId {
  if (isExcel(fileName)) {
    return sniffExcelBroker(buffer, fileName) ?? "futu";
  }

  const header = sniffHeader(buffer).toUpperCase();
  const isTiger =
    /ACTIVITY STATEMENT|ACTIVITY TYPE|TRADE PRICE|SETTLE DATE/.test(header) ||
    (/TICKER|股票代码|证券代码/.test(header) && /SIDE|方向/.test(header));
  const isLongbridge =
    /LONGBRIDGE|长桥|SOURCE_COUNTRY|GROSS_AMOUNT|WITHHOLDING_TAX|业务时间|业务分类/.test(header) ||
    (/代码|SYMBOL|CODE/.test(header) && /SIDE|方向/.test(header) && /DATE|时间|日期|TIME/.test(header));

  if (isTiger && !isLongbridge) return "tiger";
  if (isLongbridge && !isTiger) return "longbridge";
  if (/长桥|LONGBRIDGE/i.test(fileName)) return "longbridge";
  if (/老虎|TIGER/i.test(fileName)) return "tiger";
  if (/富途|FUTU|MOOMOO/i.test(fileName)) return "futu";
  return "tiger";
}

/** 自动识别并解析账单文件 */
export function parseStatement(buffer: ArrayBuffer, fileName: string): ParsedStatement {
  const broker = detectBroker(buffer, fileName);
  switch (broker) {
    case "futu":
      return parseFutuFromBuffer(buffer, fileName);
    case "tiger":
      // 税表 xlsx 走汇总解析器; Activity Statement CSV 走逐笔解析器
      if (isExcel(fileName)) return parseTigerTaxFromBuffer(buffer, fileName);
      return parseTigerFromBuffer(buffer, fileName);
    case "longbridge":
      return parseLongbridgeFromBuffer(buffer, fileName);
  }
}
