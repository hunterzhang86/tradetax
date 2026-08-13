/**
 * 税务计算引擎
 *
 * 税制模型 (中国大陆税务居民, 境外证券投资):
 * - 财产转让所得 (资本利得): 20%, 同一年度内盈亏可互抵
 * - 股息红利所得: 20%, 境外已扣税 (如美股 10% WHT) 限额内抵免
 * - 利息所得: 20% (当前版本主要处理股票与期权)
 *
 * 成本核算: FIFO (先进先出) / HIFO (最高成本优先), 可切换
 * 跨年持仓: 使用期初持仓市值作为成本基础 (估算, 界面标注)
 */

import { convertToCNY, getExchangeRate } from "@/lib/exchange";
import type {
  AnnualReturn,
  CapitalGainDetail,
  CapitalGainsResult,
  CostBasisMethod,
  Currency,
  CurrencyGainSummary,
  DividendRecord,
  DividendTaxResult,
  HoldingSnapshot,
  InterestTaxResult,
  Money,
  ParsedStatement,
  TaxResult,
  TaxSummary,
  Trade,
} from "@/lib/types";

const TAX_RATE = 0.2;

interface BuyLot {
  tradeTime: string;
  symbol: string;
  market?: string;
  category: string;
  currency: Currency;
  quantity: number;
  price: number;
  /** 成交金额 (含期权乘数) */
  amount: number;
  fees: number;
  isEstimatedCost: boolean;
}

interface SellRecord {
  tradeTime: string;
  symbol: string;
  market?: string;
  category: string;
  currency: Currency;
  quantity: number;
  price: number;
  amount: number;
  fees: number;
}

const OPTION_MULTIPLIER = 100;

function makeMoney(amount: number, currency: Currency): Money {
  return { amount, currency };
}

/** 按 (代码, 市场, 币种, 品类) 分组 */
function groupKey(t: { symbol: string; market?: string; currency: Currency; category: string }): string {
  return [t.symbol, t.market ?? "", t.currency, t.category].join("|");
}

/** 构建买入池与卖出序列 (含期初持仓虚拟买入) */
function buildLots(
  trades: Trade[],
  startHolding: HoldingSnapshot | null,
): { buys: BuyLot[]; sells: SellRecord[] } {
  const buys: BuyLot[] = [];
  const sells: SellRecord[] = [];

  if (startHolding && startHolding.quantity > 0) {
    buys.push({
      tradeTime: `${startHolding.date} 00:00:00`,
      symbol: startHolding.symbol,
      market: startHolding.market,
      category: startHolding.category,
      currency: startHolding.currency,
      quantity: startHolding.quantity,
      price: startHolding.price,
      amount: startHolding.marketValue,
      fees: 0,
      isEstimatedCost: true,
    });
  }

  for (const tx of trades) {
    const amount = Math.abs(tx.grossAmount);
    if (tx.direction === "BUY") {
      buys.push({
        tradeTime: tx.tradeTime,
        symbol: tx.symbol,
        market: tx.market,
        category: tx.category,
        currency: tx.currency,
        quantity: tx.quantity,
        price: tx.price,
        amount,
        fees: tx.fees,
        isEstimatedCost: false,
      });
    } else {
      sells.push({
        tradeTime: tx.tradeTime,
        symbol: tx.symbol,
        market: tx.market,
        category: tx.category,
        currency: tx.currency,
        quantity: tx.quantity,
        price: tx.price,
        amount,
        fees: tx.fees,
      });
    }
  }

  buys.sort((a, b) => a.tradeTime.localeCompare(b.tradeTime));
  sells.sort((a, b) => a.tradeTime.localeCompare(b.tradeTime));
  return { buys, sells };
}

/**
 * 逐笔卖出匹配买入成本 (FIFO: 最早买入先出; HIFO: 成本最高先出, 同价按时间)
 * 返回 [匹配明细, 无法匹配的卖出数量]
 */
function matchCosts(
  buys: BuyLot[],
  sells: SellRecord[],
  method: CostBasisMethod,
  year: number,
): { details: CapitalGainDetail[]; unmatchedQty: number; unmatchedCount: number } {
  const details: CapitalGainDetail[] = [];
  let unmatchedQty = 0;
  let unmatchedCount = 0;

  // 卖出按时间处理, 买入池按需增长 (只使用卖出时刻之前已发生的买入)
  let buyIdx = 0;
  const pool: BuyLot[] = [];

  for (const sell of sells) {
    // 将 sell 时刻之前的买入加入池
    while (buyIdx < buys.length && buys[buyIdx].tradeTime <= sell.tradeTime) {
      pool.push(buys[buyIdx]);
      buyIdx++;
    }

    let remaining = sell.quantity;
    const poolRemaining = pool.filter((b) => b.quantity > 0);

    if (poolRemaining.length === 0) {
      unmatchedQty += remaining;
      unmatchedCount++;
      continue;
    }

    // 按成本方法排序可用买入
    const ordered = method === "HIFO"
      ? [...poolRemaining].sort((a, b) => b.price - a.price || a.tradeTime.localeCompare(b.tradeTime))
      : [...poolRemaining].sort((a, b) => a.tradeTime.localeCompare(b.tradeTime));

    for (const lot of ordered) {
      if (remaining <= 0) break;
      const matchQty = Math.min(remaining, lot.quantity);
      if (matchQty <= 0) continue;

      const buyAmount = (lot.amount * matchQty) / lot.quantity;
      const sellAmount = (sell.amount * matchQty) / sell.quantity;
      const fees = (lot.fees * matchQty) / lot.quantity + (sell.fees * matchQty) / sell.quantity;
      const gain = sellAmount - buyAmount - fees;
      const gainCNY = convertToCNY(gain, sell.currency, year);

      details.push({
        symbol: sell.symbol,
        market: sell.market,
        category: sell.category,
        buyDate: lot.tradeTime.split(" ")[0],
        sellDate: sell.tradeTime.split(" ")[0],
        quantity: matchQty,
        multiplier: sell.category === "期权" ? OPTION_MULTIPLIER : 1,
        buyPrice: lot.price,
        sellPrice: sell.price,
        buyAmount: makeMoney(buyAmount, sell.currency),
        sellAmount: makeMoney(sellAmount, sell.currency),
        fees: makeMoney(fees, sell.currency),
        gain: makeMoney(gain, sell.currency),
        gainCNY: makeMoney(gainCNY, "CNY"),
        isEstimatedCost: lot.isEstimatedCost,
      });

      lot.quantity -= matchQty;
      remaining -= matchQty;
    }

    if (remaining > 0) {
      unmatchedQty += remaining;
      unmatchedCount++;
    }
  }

  return { details, unmatchedQty, unmatchedCount };
}

/** 资本利得税 */
function calcCapitalGains(
  trades: Trade[],
  holdings: HoldingSnapshot[],
  year: number,
  method: CostBasisMethod,
): CapitalGainsResult {
  const startHoldings = holdings.filter((h) => h.periodType === "期初");

  // 分组计算
  const groups = new Map<string, { trades: Trade[]; holding: HoldingSnapshot | null }>();
  for (const tx of trades) {
    const key = groupKey(tx);
    if (!groups.has(key)) groups.set(key, { trades: [], holding: null });
    groups.get(key)!.trades.push(tx);
  }
  for (const h of startHoldings) {
    const key = groupKey(h);
    if (!groups.has(key)) groups.set(key, { trades: [], holding: null });
    groups.get(key)!.holding = h;
  }

  let totalGainCNY = 0;
  let unmatchedQtyTotal = 0;
  let unmatchedCountTotal = 0;
  const byCurrencyMap = new Map<Currency, { gain: number; gainCNY: number }>();
  const details: CapitalGainDetail[] = [];

  for (const group of groups.values()) {
    const { buys, sells } = buildLots(group.trades, group.holding);
    const { details: groupDetails, unmatchedQty, unmatchedCount } = matchCosts(buys, sells, method, year);
    unmatchedQtyTotal += unmatchedQty;
    unmatchedCountTotal += unmatchedCount;

    for (const d of groupDetails) {
      details.push(d);
      totalGainCNY += d.gainCNY.amount;
      const cur = d.gain.currency;
      if (!byCurrencyMap.has(cur)) byCurrencyMap.set(cur, { gain: 0, gainCNY: 0 });
      byCurrencyMap.get(cur)!.gain += d.gain.amount;
      byCurrencyMap.get(cur)!.gainCNY += d.gainCNY.amount;
    }
  }

  const byCurrency: CurrencyGainSummary[] = Array.from(byCurrencyMap.entries()).map(
    ([currency, { gain, gainCNY }]) => ({ currency, totalGain: gain, totalGainCNY: gainCNY }),
  );

  const taxableGain = Math.max(0, totalGainCNY);
  return {
    totalGainCNY,
    taxableGainCNY: taxableGain,
    taxAmountCNY: taxableGain * TAX_RATE,
    byCurrency,
    details,
    unmatchedSellsQty: unmatchedQtyTotal,
    unmatchedSellsCount: unmatchedCountTotal,
  };
}

/** 股息税: 20% 税率, 境外已扣税限额内抵免 */
function calcDividendTax(dividends: DividendRecord[], year: number): DividendTaxResult {
  let totalDividendCNY = 0;
  let totalWithholdingCNY = 0;

  for (const div of dividends) {
    totalDividendCNY += convertToCNY(div.grossAmount, div.currency, year);
    totalWithholdingCNY += convertToCNY(div.withholdingTax, div.currency, year);
  }

  const grossTax = totalDividendCNY * TAX_RATE;
  const taxCredit = Math.min(totalWithholdingCNY, grossTax);
  const netTaxDue = Math.max(0, grossTax - taxCredit);

  return {
    totalDividendCNY,
    foreignTaxPaidCNY: totalWithholdingCNY,
    taxCreditCNY: taxCredit,
    grossTaxCNY: grossTax,
    netTaxDueCNY: netTaxDue,
    details: dividends,
  };
}

/** 利息税 (当前版本暂未从账单提取利息记录) */
function calcInterestTax(): InterestTaxResult {
  return { totalInterestCNY: 0, taxAmountCNY: 0 };
}

function calcSummary(
  capitalGains: CapitalGainsResult,
  dividendTax: DividendTaxResult,
  interestTax: InterestTaxResult,
): TaxSummary {
  const totalTaxDue = capitalGains.taxAmountCNY + dividendTax.grossTaxCNY + interestTax.taxAmountCNY;
  const totalCredit = dividendTax.taxCreditCNY;
  return {
    totalTaxDueCNY: totalTaxDue,
    totalTaxCreditCNY: totalCredit,
    netTaxPayableCNY: Math.max(0, totalTaxDue - totalCredit),
  };
}

/** 年度收益 (市值变化法, 含未实现盈亏, 与税务口径不同, 仅供参考) */
function calcAnnualReturn(
  holdings: HoldingSnapshot[],
  trades: Trade[],
  dividends: DividendRecord[],
  year: number,
): AnnualReturn {
  const start = holdings.filter((h) => h.periodType === "期初");
  const end = holdings.filter((h) => h.periodType === "期末");

  const sumValue = (list: HoldingSnapshot[]) =>
    list.reduce((sum, h) => sum + convertToCNY(h.marketValue, h.currency, year), 0);
  const netCashFlow = trades.reduce((sum, t) => sum + convertToCNY(t.netAmount, t.currency, year), 0);
  const dividendIncome = dividends.reduce(
    (sum, d) => sum + convertToCNY(d.grossAmount, d.currency, year),
    0,
  );

  const startValue = sumValue(start);
  const endValue = sumValue(end);

  return {
    startValueCNY: startValue,
    endValueCNY: endValue,
    netCashFlowCNY: netCashFlow,
    totalReturnCNY: endValue - startValue + netCashFlow,
    dividendIncomeCNY: dividendIncome,
  };
}

/** 计算单个年度的税务结果 */
export function calculateTaxForYear(
  year: number,
  statements: ParsedStatement[],
  method: CostBasisMethod = "FIFO",
): TaxResult | null {
  const exchangeRate = getExchangeRate(year);
  if (!exchangeRate) {
    return null;
  }

  const allTrades: Trade[] = [];
  const allDividends: DividendRecord[] = [];
  const allHoldings: HoldingSnapshot[] = [];

  for (const stmt of statements) {
    allTrades.push(...stmt.trades);
    allDividends.push(...stmt.dividends);
    allHoldings.push(...stmt.holdings);
  }

  const capitalGains = calcCapitalGains(allTrades, allHoldings, year, method);
  const dividendTax = calcDividendTax(allDividends, year);
  const interestTax = calcInterestTax();
  const summary = calcSummary(capitalGains, dividendTax, interestTax);
  const annualReturn = calcAnnualReturn(allHoldings, allTrades, allDividends, year);

  return {
    year,
    method,
    exchangeRate: {
      USD: exchangeRate.USD,
      HKD: exchangeRate.HKD,
      source: exchangeRate.source,
      date: exchangeRate.date,
    },
    capitalGains,
    dividendTax,
    interestTax,
    summary,
    annualReturn,
    stats: {
      tradeCount: allTrades.length,
      dividendCount: allDividends.length,
      warningCount: statements.reduce((sum, s) => sum + s.warnings.length, 0),
    },
  };
}

/** 按年度分组所有账单并计算 */
export function calculateTax(
  statements: ParsedStatement[],
  method: CostBasisMethod = "FIFO",
): TaxResult[] {
  const years = new Set<number>();
  for (const stmt of statements) {
    const stmtYear = stmt.year;
    if (stmtYear) years.add(stmtYear);
    for (const tx of stmt.trades) {
      const y = Number(tx.tradeTime.slice(0, 4));
      if (y > 0) years.add(y);
    }
    for (const div of stmt.dividends) {
      const y = Number(div.date.slice(0, 4));
      if (y > 0) years.add(y);
    }
  }

  const results: TaxResult[] = [];
  for (const year of Array.from(years).sort((a, b) => b - a)) {
    const result = calculateTaxForYear(year, statements, method);
    if (result) results.push(result);
  }
  return results;
}
