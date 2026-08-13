/**
 * 长桥 (Longbridge) CSV 交易记录解析
 *
 * 导出路径: 长桥 APP → 交易 → 更多 → 导出交易记录
 * 支持中英文表头, 列名模糊匹配。
 *
 * 注: 各版本导出的列名存在差异, 解析器对列顺序/命名有较强容错;
 * 若你的导出无法识别, 请参考 docs/SUPPORTED_FORMATS.md 反馈样本。
 */

import { decodeBuffer } from "@/lib/csv";
import type { ParsedStatement } from "@/lib/types";
import { parseStatementCSV, type CsvStatementConfig } from "./genericCsv";

const longbridgeConfig: CsvStatementConfig = {
  broker: "longbridge",
  columns: {
    tradeTime: ["业务时间", "时间", "成交时间", "日期", "date", "Time", "Date"],
    symbol: ["股票代码", "代码", "证券代码", "symbol", "Symbol", "Code", "Ticker"],
    name: ["名称", "证券名称", "股票名称", "Name"],
    market: ["source_country", "交易所", "市场", "market", "Exchange", "Market"],
    category: ["业务分类", "交易类型", "类型", "品类", "type", "Type", "Category"],
    direction: ["账户流向", "方向", "买卖方向", "side", "Side", "Direction"],
    quantity: ["数量", "成交数量", "quantity", "Quantity", "Shares"],
    price: ["价格", "成交价", "成交价格", "price", "Price"],
    currency: ["币种", "结算币种", "currency", "Currency"],
    grossAmount: ["金额", "成交金额", "成交额", "amount", "Amount"],
    fees: ["手续费", "佣金", "印花税", "平台费", "fees", "Fees", "Commission"],
    netAmount: ["净额", "变动金额", "结算金额", "net", "Net"],
    settlementDate: ["交收日期", "结算日期", "Settle"],
    remark: ["备注", "说明", "Remark", "Memo"],
    dividendAmount: ["gross_amount", "股息", "红利", "Dividend"],
    withholdingTax: ["withholding_tax", "预扣税", "代扣税", "Withholding", "Tax"],
  },
  fileMatch: /longbridge|长桥/i,
  detectDividend: (raw) => {
    const type = raw.category?.toUpperCase() || "";
    const remark = raw.remark?.toUpperCase() || "";
    const isDividend = /DIVIDEND|股息|红利/.test(type + " " + remark);
    if (!isDividend) return null;

    const amount = Math.abs(Number(raw.dividendAmount ?? raw.grossAmount ?? 0) || 0);
    if (amount <= 0) return null;

    const currency = (raw.currency?.toUpperCase() === "USD" ||
      raw.currency?.includes("美元") ||
      raw.currency?.includes("$")
      ? "USD"
      : raw.currency?.toUpperCase() === "HKD" || raw.currency?.includes("港")
        ? "HKD"
        : "CNY") as "USD" | "HKD" | "CNY";

    const withholding = Math.abs(Number(raw.withholdingTax ?? 0) || 0);

    return {
      date: raw.tradeTime?.slice(0, 10) || "",
      symbol: raw.symbol || "未知",
      name: raw.name,
      currency,
      grossAmount: amount,
      withholdingTax: withholding,
      netAmount: amount - withholding,
    };
  },
  yearFromFile: (fileName) => {
    const m = fileName.match(/(?:^|[^\d])((?:19|20)\d{2})/);
    return m ? parseInt(m[1], 10) : null;
  },
};

export function parseLongbridgeFromBuffer(buffer: ArrayBuffer, fileName: string): ParsedStatement {
  return parseStatementCSV(decodeBuffer(buffer), fileName, longbridgeConfig);
}
