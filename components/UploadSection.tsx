"use client";

import { useCallback, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  FileSpreadsheet,
  RefreshCw,
  Trash2,
  UploadCloud,
} from "lucide-react";
import type { CostBasisMethod, ParsedStatement } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "./ui";

const BROKER_GUIDES = [
  {
    id: "futu",
    name: "富途牛牛 / moomoo",
    steps: ["打开富途牛牛 APP", "账户 → 更多 → 我的税表 → 年度账单", "选择年份, 下载「年度账单.xlsx」"],
  },
  {
    id: "tiger",
    name: "老虎国际",
    steps: ["打开老虎国际 APP", "交易 → 历史成交(或账单), 选择导出", "导出「交易明细」CSV 文件"],
  },
  {
    id: "longbridge",
    name: "长桥",
    steps: ["打开长桥 APP", "交易 → 更多 → 导出交易记录", "导出 CSV 文件并保存到本地"],
  },
];

export function UploadSection({
  statements,
  isProcessing,
  error,
  method,
  onFiles,
  onMethodChange,
  onClear,
}: {
  statements: ParsedStatement[];
  isProcessing: boolean;
  error: string | null;
  method: CostBasisMethod;
  onFiles: (files: File[]) => void;
  onMethodChange: (method: CostBasisMethod) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [openGuide, setOpenGuide] = useState<string | null>("futu");

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) onFiles(files);
    },
    [onFiles],
  );

  const totalWarnings = statements.reduce((sum, s) => sum + s.warnings.length, 0);
  const totalTrades = statements.reduce((sum, s) => sum + s.trades.length, 0);
  const totalDividends = statements.reduce((sum, s) => sum + s.dividends.length, 0);

  return (
    <section id="upload" className="mx-auto max-w-5xl px-4 py-16 scroll-mt-20 sm:px-6">
      <div className="glass-card p-6 md:p-8">
        {/* 拖拽区 */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/15 px-6 py-12 text-center transition",
            dragging && "dropzone-active",
            !dragging && "hover:border-cyan-400/40 hover:bg-cyan-400/[0.03]",
          )}
        >
          <UploadCloud className={cn("mb-4 h-10 w-10", dragging ? "text-cyan-300" : "text-muted-foreground")} />
          <p className="text-sm font-medium">
            {dragging ? "松开以导入" : "拖拽账单文件到这里, 或点击选择文件"}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            支持富途「年度账单.xlsx」、老虎/长桥「交易明细.csv」, 可多文件多年度
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) onFiles(files);
              e.target.value = "";
            }}
          />
        </div>

        {/* 已导入文件 */}
        {statements.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                已导入 {statements.length} 个文件
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {totalTrades} 笔交易 · {totalDividends} 笔股息
                  {totalWarnings > 0 && (
                    <span className="ml-1 text-amber-400">· {totalWarnings} 条告警</span>
                  )}
                </span>
              </p>
              <button
                onClick={onClear}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-muted-foreground transition hover:border-rose-400/40 hover:text-rose-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
                清空
              </button>
            </div>

            <ul className="mt-3 space-y-2">
              {statements.map((s, i) => (
                <li key={`${s.fileName}-${i}`} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-sm">
                  <FileSpreadsheet className="h-4 w-4 shrink-0 text-cyan-300" />
                  <span className="truncate font-mono text-xs">{s.fileName}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-2">
                    <Badge tone={s.broker === "futu" ? "cyan" : s.broker === "tiger" ? "purple" : "emerald"}>
                      {s.broker === "futu" ? "富途" : s.broker === "tiger" ? "老虎" : "长桥"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {s.trades.length} 笔 · {s.dividends.length} 股息
                    </span>
                    {s.warnings.length > 0 && (
                      <span className="flex items-center gap-1 text-xs text-amber-400" title={s.warnings.map((w) => `第${w.row}行: ${w.message}`).join("\n")}>
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {s.warnings.length}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 成本法切换 */}
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-6">
          <span className="text-xs text-muted-foreground">成本核算方法:</span>
          <div className="flex rounded-lg border border-white/10 p-0.5">
            {(["FIFO", "HIFO"] as CostBasisMethod[]).map((m) => (
              <button
                key={m}
                onClick={() => onMethodChange(m)}
                className={cn(
                  "rounded-md px-4 py-1.5 text-sm font-medium transition",
                  method === m
                    ? "bg-gradient-to-r from-blue-500 to-cyan-400 text-white"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {method === "FIFO" ? "先进先出 — 先买入的先卖出, 最常用" : "最高成本优先 — 先卖出成本最高的持仓"}
          </p>
        </div>

        {isProcessing && (
          <div className="mt-4 flex items-center gap-2 text-sm text-cyan-300">
            <RefreshCw className="h-4 w-4 animate-spin" />
            正在解析文件...
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-sm text-rose-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* 券商导出指引 */}
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {BROKER_GUIDES.map((b) => (
          <div key={b.id} className="glass-card p-4">
            <button
              onClick={() => setOpenGuide(openGuide === b.id ? null : b.id)}
              className="flex w-full items-center justify-between text-sm font-medium"
            >
              {b.name}
              <ChevronDown
                className={cn("h-4 w-4 text-muted-foreground transition", openGuide === b.id && "rotate-180")}
              />
            </button>
            {openGuide === b.id && (
              <ol className="mt-3 space-y-1.5">
                {b.steps.map((step, i) => (
                  <li key={i} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-cyan-400/15 font-mono text-[10px] text-cyan-300">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
