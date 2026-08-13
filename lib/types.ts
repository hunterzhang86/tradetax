/**
 * TradeTax 核心数据模型
 *
 * 所有券商适配器 (富途/老虎/长桥) 最终都归一化到这套模型,
 * 计算引擎只依赖这里的类型, 与具体券商格式完全解耦。
 */

export type Currency = "USD" | "HKD" | "CNY";

export type BrokerId = "futu" | "tiger" | "longbridge";

export type TradeDirection = "BUY" | "SELL";

export type CostBasisMethod = "FIFO" | "HIFO" | "WAC";

export interface Money {
  amount: number;
  currency: Currency;
}

/** 一笔已成交交易 (归一化) */
export interface Trade {
  /** 成交时间, 统一为 "YYYY-MM-DD HH:mm:ss", 可直接字符串排序 */
  tradeTime: string;
  symbol: string;
  name?: string;
  market?: string;
  /** 品类: 证券 / 期权 / 基金 ... */
  category: string;
  direction: TradeDirection;
  quantity: number;
  price: number;
  currency: Currency;
  /** 成交金额 (正数, 已含期权乘数) */
  grossAmount: number;
  /** 总费用: 佣金 + 印花税 + 平台费 + 结算费 */
  fees: number;
  /** 变动金额 (带符号, 买入为负/卖出为正), 用于年度收益口径 */
  netAmount: number;
  settlementDate?: string;
  remark?: string;
  /** 原始文件中的行号, 用于错误定位 */
  sourceRow: number;
}

/** 股息/分红记录 */
export interface DividendRecord {
  date: string;
  symbol: string;
  name?: string;
  currency: Currency;
  /** 税前股息 */
  grossAmount: number;
  /** 境外预扣税 (如美股 10% WHT) */
  withholdingTax: number;
  /** 税后净额 = gross - withholding */
  netAmount: number;
  sourceRow: number;
}

/** 期初/期末持仓快照 (用于跨年持仓成本估算) */
export interface HoldingSnapshot {
  periodType: "期初" | "期末";
  date: string;
  symbol: string;
  market?: string;
  category: string;
  currency: Currency;
  quantity: number;
  price: number;
  /** 期权乘数, 股票为 1 */
  multiplier: number;
  marketValue: number;
}

/** 解析告警 (未识别行/缺失字段等) */
export interface ParseWarning {
  source: string;
  row: number;
  message: string;
}

/** 一个券商文件的解析结果 */
export interface ParsedStatement {
  broker: BrokerId;
  fileName: string;
  year?: number;
  trades: Trade[];
  dividends: DividendRecord[];
  holdings: HoldingSnapshot[];
  warnings: ParseWarning[];
}

// ================= 税务计算结果 =================

/** 单笔已实现盈亏明细 */
export interface CapitalGainDetail {
  symbol: string;
  market?: string;
  category: string;
  buyDate: string;
  sellDate: string;
  quantity: number;
  multiplier: number;
  buyPrice: number;
  sellPrice: number;
  buyAmount: Money;
  sellAmount: Money;
  fees: Money;
  /** 盈亏 (原币种) */
  gain: Money;
  /** 盈亏 (折算人民币) */
  gainCNY: Money;
  /** 成本是否为期初市价估算 (非实际买入价) */
  isEstimatedCost: boolean;
}

export interface CurrencyGainSummary {
  currency: Currency;
  totalGain: number;
  totalGainCNY: number;
}

export interface CapitalGainsResult {
  /** 已实现盈亏合计 (人民币, 盈亏已互抵) */
  totalGainCNY: number;
  /** 应税所得 = max(0, totalGainCNY) */
  taxableGainCNY: number;
  /** 应纳税额 = taxableGain * 20% */
  taxAmountCNY: number;
  byCurrency: CurrencyGainSummary[];
  details: CapitalGainDetail[];
  /** 无法匹配到买入成本的卖出数量 (缺少成本基础) */
  unmatchedSellsQty: number;
  unmatchedSellsCount: number;
}

export interface DividendTaxResult {
  totalDividendCNY: number;
  foreignTaxPaidCNY: number;
  /** 可抵免税额 = min(境外已扣税, 应纳税额) */
  taxCreditCNY: number;
  /** 毛应纳税额 = totalDividend * 20% */
  grossTaxCNY: number;
  /** 实际应补税额 = max(0, grossTax - credit) */
  netTaxDueCNY: number;
  details: DividendRecord[];
}

export interface InterestTaxResult {
  totalInterestCNY: number;
  taxAmountCNY: number;
}

export interface TaxSummary {
  /** 应纳税总额 = 资本利得税 + 股息毛税 + 利息税 */
  totalTaxDueCNY: number;
  /** 可抵免总额 (境外已扣税) */
  totalTaxCreditCNY: number;
  /** 实际应缴 = totalTaxDue - credit */
  netTaxPayableCNY: number;
}

/** 年度收益 (市值变化法, 含未实现盈亏, 用于参考) */
export interface AnnualReturn {
  startValueCNY: number;
  endValueCNY: number;
  netCashFlowCNY: number;
  totalReturnCNY: number;
  dividendIncomeCNY: number;
}

export interface TaxResult {
  year: number;
  method: CostBasisMethod;
  exchangeRate: {
    USD: number;
    HKD: number;
    source: string;
    date: string;
  };
  capitalGains: CapitalGainsResult;
  dividendTax: DividendTaxResult;
  interestTax: InterestTaxResult;
  summary: TaxSummary;
  annualReturn?: AnnualReturn;
  /** 用于复核: 导入的交易/股息/持仓条数 */
  stats: {
    tradeCount: number;
    dividendCount: number;
    warningCount: number;
  };
}

// ================= 汇率 =================

/** 年度汇率 (100 外币兑人民币, 纳税年度 12/31 中间价) */
export interface ExchangeRateData {
  year: number;
  date: string;
  USD: number;
  HKD: number;
  source: string;
}

// ================= 券商适配器 =================

export interface BrokerAdapter {
  id: BrokerId;
  name: string;
  /** 文件名/内容匹配判断是否本券商文件 */
  detect(fileName: string): boolean;
  parse(buffer: ArrayBuffer, fileName: string): ParsedStatement;
}
