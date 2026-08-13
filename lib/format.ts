/** 金额格式化工具 (UI 展示) */

const SYMBOLS: Record<string, string> = {
  CNY: "¥",
  USD: "$",
  HKD: "HK$",
};

export function fmt(n: number, symbol = "¥"): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}${symbol}${Math.abs(n).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function fmtCNY(n: number): string {
  return fmt(n, SYMBOLS.CNY);
}

export function fmtSigned(n: number, symbol = "¥"): string {
  const prefix = n >= 0 ? "+" : "-";
  return `${prefix}${symbol}${Math.abs(n).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function fmtNum(n: number, digits = 2): string {
  return n.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtQty(n: number): string {
  return n.toLocaleString("zh-CN", { maximumFractionDigits: 4 });
}
