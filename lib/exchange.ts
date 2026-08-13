/**
 * 年度汇率模块
 *
 * 依据财税规定, 境外所得折算是按纳税年度最后一日的人民币汇率中间价。
 * 数据来源: 中国国家外汇管理局 / 中国外汇交易中心 (100 外币兑人民币)。
 */

import type { Currency, ExchangeRateData } from "@/lib/types";

/** 年度汇率表 (每年 12/31 或最后交易日中间价) */
export const EXCHANGE_RATES: ExchangeRateData[] = [
  { year: 2025, date: "2025-12-31", USD: 702.88, HKD: 90.322, source: "中国外汇交易中心" },
  { year: 2024, date: "2024-12-31", USD: 718.84, HKD: 92.604, source: "中国国家外汇管理局" },
  { year: 2023, date: "2023-12-29", USD: 708.27, HKD: 90.622, source: "中国国家外汇管理局" },
  { year: 2022, date: "2022-12-30", USD: 696.46, HKD: 89.327, source: "中国国家外汇管理局" },
  { year: 2021, date: "2021-12-31", USD: 637.57, HKD: 81.76, source: "中国国家外汇管理局" },
  { year: 2020, date: "2020-12-31", USD: 652.49, HKD: 84.164, source: "中国国家外汇管理局" },
];

export function getExchangeRate(year: number): ExchangeRateData | null {
  return EXCHANGE_RATES.find((r) => r.year === year) ?? null;
}

export function getSupportedYears(): number[] {
  return EXCHANGE_RATES.map((r) => r.year).sort((a, b) => b - a);
}

/** 外币金额 -> 人民币 (100 外币 = rate 人民币) */
export function convertToCNY(amount: number, currency: Currency, year: number): number {
  if (currency === "CNY") return amount;
  const rate = getExchangeRate(year);
  if (!rate) {
    throw new Error(`暂不支持 ${year} 年 (汇率表覆盖 ${getSupportedYears().join(", ")})`);
  }
  const per100 = currency === "USD" ? rate.USD : rate.HKD;
  return (amount * per100) / 100;
}
