/**
 * 健壮的 CSV 解析器 (自实现, 零依赖)
 *
 * 支持:
 * - UTF-8 BOM 剥离
 * - 引号包裹的字段 (内含逗号/换行/双引号转义)
 * - CRLF / LF 换行
 * - 表头模糊匹配 (大小写/空格/常见别名)
 */

/**
 * 解码账单文件字节: 优先 UTF-8 (含 BOM 剥离), 失败则回退 GBK/GB18030。
 * 老虎/长桥部分历史导出为 GBK 编码, 浏览器默认按 UTF-8 解码会乱码。
 */
export function decodeBuffer(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("gb18030").decode(buffer);
  }
}

/** 将 CSV 文本解析为二维字符串数组 */
export function parseCSV(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) {
        rows.push(row);
      }
      row = [];
    } else {
      field += ch;
    }
  }

  // 最后一行
  row.push(field);
  if (row.some((c) => c.trim() !== "")) {
    rows.push(row);
  }

  return rows;
}

/** 规范化表头: 转大写、去空白、去常见分隔符 */
export function normalizeHeader(header: string): string {
  return header
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[（）()\[\]【】·.\-_/\\]/g, "");
}

/**
 * 在表头行中查找包含关键词的列索引 (模糊匹配)
 * @param headers 表头行
 * @param keywords 候选关键词, 命中任意一个即返回 (按顺序)
 */
export function findColumn(
  headers: string[],
  keywords: string[],
): number {
  const normalized = headers.map(normalizeHeader);
  for (const kw of keywords) {
    const nk = normalizeHeader(kw);
    const idx = normalized.findIndex((h) => h.includes(nk));
    if (idx >= 0) return idx;
  }
  return -1;
}

/** 安全解析数字: 去除千分位逗号、货币符号、百分号, 支持负数/括号负数 */
export function parseNumber(value: unknown): number {
  if (typeof value === "number") return isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;
  const cleaned = value
    .replace(/[,\s]/g, "")
    .replace(/[¥$HK€]/g, "")
    .trim();
  if (cleaned === "" || cleaned === "-" || cleaned === "--") return 0;
  // 括号负数: (123) => -123
  const parenNeg = cleaned.match(/^\((.*)\)$/);
  if (parenNeg) {
    const n = parseFloat(parenNeg[1]);
    return isNaN(n) ? 0 : -n;
  }
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/** 识别币种 (中英文/符号) */
export function parseCurrency(value: unknown): string {
  const upper = String(value ?? "")
    .toUpperCase()
    .trim();
  if (!upper) return "";
  if (upper.includes("USD") || upper.includes("美元") || upper.includes("$")) return "USD";
  if (upper.includes("HKD") || upper.includes("港") || upper.includes("HK$")) return "HKD";
  if (upper.includes("CNY") || upper.includes("人民币") || upper.includes("RMB") || upper.includes("¥")) return "CNY";
  return upper;
}

/** 方向归一化: 买/申 -> BUY, 卖/赎 -> SELL */
export function parseDirection(value: unknown): "BUY" | "SELL" | null {
  const upper = String(value ?? "").toUpperCase();
  if (/买|申|BUY|BOUGHT|PURCHASE/.test(upper)) return "BUY";
  if (/卖|赎|SELL|SOLD|REDEEM/.test(upper)) return "SELL";
  return null;
}

/** 日期归一化: 兼容 2024-01-15 / 2024/01/15 / 20240115 / 2024.1.15 -> YYYY-MM-DD */
export function normalizeDate(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const m = raw.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    return `${compact[1]}-${compact[2]}-${compact[3]}`;
  }
  return raw;
}

/** 日期 + 时间 -> 可排序字符串 "YYYY-MM-DD HH:mm:ss" */
export function normalizeDateTime(date: unknown, time?: unknown): string {
  const d = normalizeDate(date);
  if (!d) return "";
  const t = String(time ?? "").trim();
  if (!t) return `${d} 00:00:00`;
  const tm = t.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (tm) {
    const hh = tm[1].padStart(2, "0");
    const mm = tm[2];
    const ss = tm[3] ?? "00";
    return `${d} ${hh}:${mm}:${ss}`;
  }
  return `${d} ${t}`;
}
