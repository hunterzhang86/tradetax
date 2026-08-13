/**
 * 税务计算引擎
 *
 * 税制模型 (中国大陆税务居民, 境外证券投资):
 * - 财产转让所得 (资本利得): 20%, 同一年度内盈亏可互抵
 * - 股息红利所得: 20%, 境外已扣税 (如美股 10% WHT) 限额内抵免
 * - 利息所得: 20% (当前版本主要处理股票与期权)
 *
 * 成本核算: FIFO (先进先出) / HIFO (最高成本优先), 可切换
 * 持仓模型: 带符号持仓, 支持做多与做空 (期权卖出开仓/买入平仓)
 * 期权到期: 未平仓期权在到期日按作废处理 (做多损失权利金, 做空获得权利金)
 * 跨年持仓: 期初持仓市值作为成本基础 (估算, 界面标注)
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
  InterestRecord,
  InterestTaxResult,
  Money,
  ParsedStatement,
  RealizedGain,
  TaxResult,
  TaxSummary,
  Trade,
} from "@/lib/types";

const TAX_RATE = 0.2;
const OPTION_MULTIPLIER = 100;

/** 期权代码匹配: 前缀(US./HK. 可选) + 标的 + YYMMDD + C/P + 行权价 */
const OPTION_RE = /^(?:[A-Z]{2}\.)?([A-Z]{1,6})(\d{6})([CP])\d+(?:\.[\d]+)?$/i;

function isOptionSymbol(symbol: string): boolean {
  return OPTION_RE.test(symbol);
}

/** 从期权代码解析到期日: "AAPL240119C180000" -> "2024-01-19" (失败返回 null) */
function optionExpiryDate(symbol: string): string | null {
  const m = symbol.match(OPTION_RE);
  if (!m) return null;
  const yy = m[2].slice(0, 2);
  const mm = m[2].slice(2, 4);
  const dd = m[2].slice(4, 6);
  const year = Number(yy) + (Number(yy) >= 70 ? 1900 : 2000);
  return `${year}-${mm}-${dd}`;
}

function yearOf(dateStr: string): number {
  const y = Number(dateStr.slice(0, 4));
  return Number.isFinite(y) && y > 0 ? y : 0;
}

interface BaseLot {
  tradeTime: string;
  symbol: string;
  market?: string;
  category: string;
  currency: Currency;
  /** 剩余数量 (随匹配减少) */
  quantity: number;
  price: number;
  /** 单位金额 = 原始成交金额(含乘数) / 原始数量, 匹配时按剩余数量线性折算 */
  unitAmount: number;
  /** 单位费用 = 原始费用 / 原始数量 */
  unitFees: number;
}

interface LongLot extends BaseLot {
  isEstimatedCost: boolean;
}

interface ShortLot extends BaseLot {}

function makeMoney(amount: number, currency: Currency): Money {
  return { amount, currency };
}

/** 按 (代码, 市场, 币种, 品类) 分组 */
function groupKey(t: { symbol: string; market?: string; currency: Currency; category: string }): string {
  return [t.symbol, t.market ?? "", t.currency, t.category].join("|");
}

function toDetail(
  sell: Trade,
  lot: BaseLot,
  matchQty: number,
  targetYear: number,
  isEstimatedCost: boolean,
): CapitalGainDetail {
  const buyAmount = lot.unitAmount * matchQty;
  const sellAmount = (sell.grossAmount * matchQty) / sell.quantity;
  const fees = lot.unitFees * matchQty + (sell.fees * matchQty) / sell.quantity;
  const gain = sellAmount - buyAmount - fees;
  const gainCNY = convertToCNY(gain, sell.currency, targetYear);

  return {
    symbol: sell.symbol,
    market: sell.market,
    category: sell.category,
    buyDate: lot.tradeTime.split(" ")[0],
    sellDate: sell.tradeTime.split(" ")[0],
    quantity: matchQty,
    multiplier: isOptionSymbol(sell.symbol) ? OPTION_MULTIPLIER : 1,
    buyPrice: lot.price,
    sellPrice: sell.price,
    buyAmount: makeMoney(buyAmount, sell.currency),
    sellAmount: makeMoney(sellAmount, sell.currency),
    fees: makeMoney(fees, sell.currency),
    gain: makeMoney(gain, sell.currency),
    gainCNY: makeMoney(gainCNY, "CNY"),
    isEstimatedCost,
  };
}

/** 期权到期作废: 未平仓期权在到期日实现 */
function toExpiryDetail(
  lot: BaseLot,
  expiry: string,
  isLong: boolean,
  targetYear: number,
): CapitalGainDetail | null {
  if (yearOf(expiry) !== targetYear) return null;
  const amount = lot.unitAmount * lot.quantity;
  const fees = lot.unitFees * lot.quantity;
  const sellAmount = isLong ? 0 : amount;
  const buyAmount = isLong ? amount : 0;
  const gain = sellAmount - buyAmount - fees;
  const gainCNY = convertToCNY(gain, lot.currency, targetYear);

  return {
    symbol: lot.symbol,
    market: lot.market,
    category: lot.category,
    buyDate: lot.tradeTime.split(" ")[0],
    sellDate: expiry,
    quantity: lot.quantity,
    multiplier: OPTION_MULTIPLIER,
    buyPrice: isLong ? lot.price : 0,
    sellPrice: isLong ? 0 : lot.price,
    buyAmount: makeMoney(buyAmount, lot.currency),
    sellAmount: makeMoney(sellAmount, lot.currency),
    fees: makeMoney(fees, lot.currency),
    gain: makeMoney(gain, lot.currency),
    gainCNY: makeMoney(gainCNY, "CNY"),
    isEstimatedCost: false,
  };
}

/**
 * 单组交易匹配 (带符号持仓模型)
 *
 * - 买入: 先平空头 (FIFO), 剩余建立多头
 * - 卖出: 先平多头 (FIFO/HIFO), 剩余建立空头
 * - 非期权标的卖出无买入 -> 计入未匹配告警 (疑似数据缺失)
 * - 仅期权持仓在到期日实现盈亏
 */
function matchGroup(
  trades: Trade[],
  startHolding: HoldingSnapshot | null,
  method: CostBasisMethod,
  targetYear: number,
): { details: CapitalGainDetail[]; unmatchedQty: number; unmatchedCount: number } {
  const details: CapitalGainDetail[] = [];
  let unmatchedQty = 0;
  let unmatchedCount = 0;
  const longs: LongLot[] = [];
  const shorts: ShortLot[] = [];

  if (startHolding && startHolding.quantity > 0) {
    longs.push({
      tradeTime: `${startHolding.date} 00:00:00`,
      symbol: startHolding.symbol,
      market: startHolding.market,
      category: startHolding.category,
      currency: startHolding.currency,
      quantity: startHolding.quantity,
      price: startHolding.price,
      unitAmount: startHolding.marketValue / startHolding.quantity,
      unitFees: 0,
      isEstimatedCost: true,
    });
  }

  for (const trade of trades) {
    const option = isOptionSymbol(trade.symbol);

    if (trade.direction === "BUY") {
      let q = trade.quantity;
      while (q > 0 && shorts.length > 0) {
        const lot = shorts[0];
        const m = Math.min(q, lot.quantity);
        const closeAmount = (trade.grossAmount * m) / trade.quantity;
        const openAmount = lot.unitAmount * m;
        const fees = lot.unitFees * m + (trade.fees * m) / trade.quantity;
        const gain = openAmount - closeAmount - fees;
        const gainCNY = convertToCNY(gain, trade.currency, targetYear);

        if (yearOf(trade.tradeTime) === targetYear) {
          details.push({
            symbol: trade.symbol,
            market: trade.market,
            category: trade.category,
            buyDate: lot.tradeTime.split(" ")[0],
            sellDate: trade.tradeTime.split(" ")[0],
            quantity: m,
            multiplier: option ? OPTION_MULTIPLIER : 1,
            buyPrice: lot.price,
            sellPrice: trade.price,
            buyAmount: makeMoney(openAmount, trade.currency),
            sellAmount: makeMoney(closeAmount, trade.currency),
            fees: makeMoney(fees, trade.currency),
            gain: makeMoney(gain, trade.currency),
            gainCNY: makeMoney(gainCNY, "CNY"),
            isEstimatedCost: false,
          });
        }

        lot.quantity -= m;
        q -= m;
        if (lot.quantity <= 0) shorts.shift();
      }

      if (q > 0) {
        longs.push({
          tradeTime: trade.tradeTime,
          symbol: trade.symbol,
          market: trade.market,
          category: trade.category,
          currency: trade.currency,
          quantity: q,
          price: trade.price,
          unitAmount: trade.grossAmount / trade.quantity,
          unitFees: trade.fees / trade.quantity,
          isEstimatedCost: false,
        });
      }
      continue;
    }

    // SELL
    let q = trade.quantity;
    while (q > 0 && longs.length > 0) {
      const lot = method === "HIFO"
        ? longs.reduce((best, l) =>
            l.quantity > 0 && (l.price > best.price || (l.price === best.price && l.tradeTime < best.tradeTime)) ? l : best,
          longs[0],
        )
        : longs[0];

      const m = Math.min(q, lot.quantity);
      const sellAmount = (trade.grossAmount * m) / trade.quantity;
      const buyAmount = lot.unitAmount * m;
      const fees = lot.unitFees * m + (trade.fees * m) / trade.quantity;
      const gain = sellAmount - buyAmount - fees;
      const gainCNY = convertToCNY(gain, trade.currency, targetYear);

      if (yearOf(trade.tradeTime) === targetYear) {
        details.push({
          symbol: trade.symbol,
          market: trade.market,
          category: trade.category,
          buyDate: lot.tradeTime.split(" ")[0],
          sellDate: trade.tradeTime.split(" ")[0],
          quantity: m,
          multiplier: option ? OPTION_MULTIPLIER : 1,
          buyPrice: lot.price,
          sellPrice: trade.price,
          buyAmount: makeMoney(buyAmount, trade.currency),
          sellAmount: makeMoney(sellAmount, trade.currency),
          fees: makeMoney(fees, trade.currency),
          gain: makeMoney(gain, trade.currency),
          gainCNY: makeMoney(gainCNY, "CNY"),
          isEstimatedCost: lot.isEstimatedCost,
        });
      }

      lot.quantity -= m;
      q -= m;
      if (lot.quantity <= 0) {
        const idx = longs.indexOf(lot);
        longs.splice(idx, 1);
      }
    }

    if (q > 0) {
      if (!option) {
        unmatchedQty += q;
        unmatchedCount++;
      }
      shorts.push({
        tradeTime: trade.tradeTime,
        symbol: trade.symbol,
        market: trade.market,
        category: trade.category,
        currency: trade.currency,
        quantity: q,
        price: trade.price,
        unitAmount: trade.grossAmount / trade.quantity,
        unitFees: trade.fees / trade.quantity,
      });
    }
  }

  // 期权到期作废: 未平仓期权在到期日实现盈亏
  for (const lot of longs) {
    const expiry = optionExpiryDate(lot.symbol);
    if (expiry) {
      const detail = toExpiryDetail(lot, expiry, true, targetYear);
      if (detail) details.push(detail);
    }
  }
  for (const lot of shorts) {
    const expiry = optionExpiryDate(lot.symbol);
    if (expiry) {
      const detail = toExpiryDetail(lot, expiry, false, targetYear);
      if (detail) details.push(detail);
    }
  }

  return { details, unmatchedQty, unmatchedCount };
}

/**
 * 移动加权平均成本法 (WAC)
 *
 * 每次买入后按总成本(含费用)/总数量重算单位成本, 卖出按当前加权平均成本核算。
 * 富途官方账单即采用该方法; 做空期权按权利金净额(扣除开仓费用)加权。
 */
function matchGroupWAC(
  trades: Trade[],
  startHolding: HoldingSnapshot | null,
  targetYear: number,
): { details: CapitalGainDetail[]; unmatchedQty: number; unmatchedCount: number } {
  const details: CapitalGainDetail[] = [];
  let unmatchedQty = 0;
  let unmatchedCount = 0;

  let longQty = 0;
  let longAvg = 0;
  let shortQty = 0;
  let shortAvg = 0;
  let lastBuyTime = "";

  const multOf = (symbol: string) => (isOptionSymbol(symbol) ? OPTION_MULTIPLIER : 1);

  if (startHolding && startHolding.quantity > 0) {
    longQty = startHolding.quantity;
    longAvg = startHolding.marketValue / (startHolding.quantity * multOf(startHolding.symbol));
    lastBuyTime = `${startHolding.date} 00:00:00`;
  }

  const emit = (input: {
    sell: Trade;
    qty: number;
    avg: number;
    isShort: boolean;
    sellAmount: number;
    sellFees: number;
    estCost: boolean;
  }) => {
    const mult = multOf(input.sell.symbol);
    const gain = (input.isShort ? input.avg - input.sell.price : input.sell.price - input.avg) * input.qty * mult - input.sellFees;
    const gainCNY = convertToCNY(gain, input.sell.currency, targetYear);
    if (yearOf(input.sell.tradeTime) !== targetYear) return;
    details.push({
      symbol: input.sell.symbol,
      market: input.sell.market,
      category: input.sell.category,
      buyDate: lastBuyTime ? lastBuyTime.split(" ")[0] : input.sell.tradeTime.split(" ")[0],
      sellDate: input.sell.tradeTime.split(" ")[0],
      quantity: input.qty,
      multiplier: mult,
      buyPrice: input.avg,
      sellPrice: input.sell.price,
      buyAmount: makeMoney(input.avg * input.qty * mult, input.sell.currency),
      sellAmount: makeMoney(input.sellAmount, input.sell.currency),
      fees: makeMoney(input.sellFees, input.sell.currency),
      gain: makeMoney(gain, input.sell.currency),
      gainCNY: makeMoney(gainCNY, "CNY"),
      isEstimatedCost: input.estCost,
    });
  };

  for (const trade of trades) {
    const mult = multOf(trade.symbol);

    if (trade.direction === "BUY") {
      let q = trade.quantity;
      // 先平空头
      while (q > 0 && shortQty > 0) {
        const m = Math.min(q, shortQty);
        const closeAmount = (trade.grossAmount * m) / trade.quantity;
        const closeFees = (trade.fees * m) / trade.quantity;
        emit({ sell: trade, qty: m, avg: shortAvg, isShort: true, sellAmount: closeAmount, sellFees: closeFees, estCost: false });
        shortQty -= m;
        q -= m;
      }
      if (shortQty === 0) shortAvg = 0;

      if (q > 0) {
        const addedAmount = (trade.grossAmount * q) / trade.quantity;
        const addedFees = (trade.fees * q) / trade.quantity;
        const totalQty = longQty + q;
        longAvg = (longAvg * longQty + (addedAmount + addedFees) / mult) / totalQty;
        longQty = totalQty;
        lastBuyTime = trade.tradeTime;
      }
      continue;
    }

    let q = trade.quantity;
    while (q > 0 && longQty > 0) {
      const m = Math.min(q, longQty);
      const sellAmount = (trade.grossAmount * m) / trade.quantity;
      const sellFees = (trade.fees * m) / trade.quantity;
      emit({ sell: trade, qty: m, avg: longAvg, isShort: false, sellAmount, sellFees, estCost: false });
      longQty -= m;
      q -= m;
    }
    if (longQty === 0) longAvg = 0;

    if (q > 0) {
      if (!isOptionSymbol(trade.symbol)) {
        unmatchedQty += q;
        unmatchedCount++;
      }
      const addedAmount = (trade.grossAmount * q) / trade.quantity;
      const addedFees = (trade.fees * q) / trade.quantity;
      const totalQty = shortQty + q;
      shortAvg = (shortAvg * shortQty + (addedAmount - addedFees) / mult) / totalQty;
      shortQty = totalQty;
    }
  }

  // 期权到期作废
  if (longQty > 0 && longAvg > 0) {
    const symbol = trades[0]?.symbol ?? "";
    const expiry = optionExpiryDate(symbol);
    if (expiry && yearOf(expiry) === targetYear) {
      details.push({
        symbol,
        market: trades[0]?.market,
        category: trades[0]?.category ?? "期权",
        buyDate: lastBuyTime ? lastBuyTime.split(" ")[0] : "",
        sellDate: expiry,
        quantity: longQty,
        multiplier: OPTION_MULTIPLIER,
        buyPrice: longAvg,
        sellPrice: 0,
        buyAmount: makeMoney(longAvg * longQty * OPTION_MULTIPLIER, trades[0]!.currency),
        sellAmount: makeMoney(0, trades[0]!.currency),
        fees: makeMoney(0, trades[0]!.currency),
        gain: makeMoney(-longAvg * longQty * OPTION_MULTIPLIER, trades[0]!.currency),
        gainCNY: makeMoney(convertToCNY(-longAvg * longQty * OPTION_MULTIPLIER, trades[0]!.currency, targetYear), "CNY"),
        isEstimatedCost: false,
      });
    }
  }
  if (shortQty > 0 && shortAvg > 0) {
    const symbol = trades[0]?.symbol ?? "";
    const expiry = optionExpiryDate(symbol);
    if (expiry && yearOf(expiry) === targetYear) {
      details.push({
        symbol,
        market: trades[0]?.market,
        category: trades[0]?.category ?? "期权",
        buyDate: lastBuyTime ? lastBuyTime.split(" ")[0] : "",
        sellDate: expiry,
        quantity: shortQty,
        multiplier: OPTION_MULTIPLIER,
        buyPrice: 0,
        sellPrice: shortAvg,
        buyAmount: makeMoney(0, trades[0]!.currency),
        sellAmount: makeMoney(shortAvg * shortQty * OPTION_MULTIPLIER, trades[0]!.currency),
        fees: makeMoney(0, trades[0]!.currency),
        gain: makeMoney(shortAvg * shortQty * OPTION_MULTIPLIER, trades[0]!.currency),
        gainCNY: makeMoney(convertToCNY(shortAvg * shortQty * OPTION_MULTIPLIER, trades[0]!.currency, targetYear), "CNY"),
        isEstimatedCost: false,
      });
    }
  }

  return { details, unmatchedQty, unmatchedCount };
}

/** 资本利得税: 只计算目标年度内实现的盈亏 (跨年买入提供成本基础) */
function calcCapitalGains(
  trades: Trade[],
  holdings: HoldingSnapshot[],
  realizedGains: RealizedGain[],
  year: number,
  method: CostBasisMethod,
  precomputed: boolean,
): CapitalGainsResult {
  const startHoldings = holdings.filter((h) => h.periodType === "期初");
  const sorted = [...trades].sort((a, b) => a.tradeTime.localeCompare(b.tradeTime));

  const groups = new Map<string, { trades: Trade[]; holding: HoldingSnapshot | null }>();
  for (const tx of sorted) {
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
    const groupResult =
      method === "WAC"
        ? matchGroupWAC(group.trades, group.holding, year)
        : matchGroup(group.trades, group.holding, method, year);
    const { details: groupDetails, unmatchedQty, unmatchedCount } = groupResult;
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

  // 券商预计算的已实现盈亏 (老虎税表汇总口径) 直接计入
  for (const rg of realizedGains) {
    totalGainCNY += convertToCNY(rg.amount, rg.currency, year);
    if (!byCurrencyMap.has(rg.currency)) byCurrencyMap.set(rg.currency, { gain: 0, gainCNY: 0 });
    byCurrencyMap.get(rg.currency)!.gain += rg.amount;
    byCurrencyMap.get(rg.currency)!.gainCNY += convertToCNY(rg.amount, rg.currency, year);
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
    precomputed,
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

/** 利息税: 20% 税率, 境外预扣税限额内抵免 */
function calcInterestTax(interests: InterestRecord[], year: number): InterestTaxResult {
  let totalInterestCNY = 0;
  let totalWithholdingCNY = 0;

  for (const int of interests) {
    totalInterestCNY += convertToCNY(int.amount, int.currency, year);
    totalWithholdingCNY += convertToCNY(int.withholdingTax, int.currency, year);
  }

  const grossTax = totalInterestCNY * TAX_RATE;
  const taxCredit = Math.min(totalWithholdingCNY, grossTax);
  const netTaxDue = Math.max(0, grossTax - taxCredit);

  return {
    totalInterestCNY,
    foreignTaxPaidCNY: totalWithholdingCNY,
    grossTaxCNY: grossTax,
    taxCreditCNY: taxCredit,
    netTaxDueCNY: netTaxDue,
  };
}

function calcSummary(
  capitalGains: CapitalGainsResult,
  dividendTax: DividendTaxResult,
  interestTax: InterestTaxResult,
): TaxSummary {
  const totalTaxDue =
    capitalGains.taxAmountCNY + dividendTax.grossTaxCNY + interestTax.grossTaxCNY;
  const totalCredit = dividendTax.taxCreditCNY + interestTax.taxCreditCNY;
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

/** 计算单个年度的税务结果 (只包含该年度实现的事件) */
export function calculateTaxForYear(
  year: number,
  statements: ParsedStatement[],
  method: CostBasisMethod = "FIFO",
): TaxResult | null {
  const exchangeRate = getExchangeRate(year);
  if (!exchangeRate) return null;

  const allTrades: Trade[] = [];
  const allDividends: DividendRecord[] = [];
  const allHoldings: HoldingSnapshot[] = [];
  const allRealizedGains: RealizedGain[] = [];
  const allInterests: InterestRecord[] = [];
  let reportNote: string | undefined;

  for (const stmt of statements) {
    allTrades.push(...stmt.trades);
    allDividends.push(...stmt.dividends);
    allHoldings.push(...stmt.holdings);
    if (stmt.realizedGains) allRealizedGains.push(...stmt.realizedGains);
    if (stmt.interests) allInterests.push(...stmt.interests);
    if (stmt.reportNote) reportNote = stmt.reportNote;
  }

  const precomputed = allRealizedGains.length > 0;

  const yearDividends = allDividends.filter((d) => yearOf(d.date) === year || d.date === "");
  const yearTrades = allTrades.filter((t) => yearOf(t.tradeTime) === year);
  const yearHoldings = allHoldings.filter((h) => yearOf(h.date) === year || yearOf(h.date) === 0);

  const capitalGains = calcCapitalGains(
    allTrades,
    allHoldings,
    allRealizedGains,
    year,
    method,
    precomputed,
  );
  const dividendTax = calcDividendTax(yearDividends, year);
  const interestTax = calcInterestTax(allInterests, year);
  const summary = calcSummary(capitalGains, dividendTax, interestTax);
  const annualReturn = calcAnnualReturn(yearHoldings, yearTrades, yearDividends, year);

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
    precomputedGains: precomputed,
    reportNote,
    stats: {
      tradeCount: yearTrades.length,
      dividendCount: yearDividends.length,
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
      const y = yearOf(tx.tradeTime);
      if (y > 0) years.add(y);
    }
    for (const div of stmt.dividends) {
      const y = yearOf(div.date);
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
