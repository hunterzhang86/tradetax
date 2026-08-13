import { Github, ShieldCheck } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <a href="#" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 via-cyan-400 to-purple-500 glow-cyan">
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-white" aria-hidden>
              <path
                d="M4 15 L9 9 L13 12 L20 4"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M15 4 L20 4 L20 9"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-base font-semibold tracking-tight">TradeTax</span>
            <span className="hidden text-xs text-muted-foreground sm:inline">港美股投资个税计算器</span>
          </div>
        </a>

        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300 md:inline-flex">
            <ShieldCheck className="h-3.5 w-3.5" />
            数据不出浏览器
          </span>
          <a
            href="https://github.com/hunterzhang86/tradetax"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-muted-foreground transition hover:border-white/25 hover:text-foreground"
          >
            <Github className="h-4 w-4" />
            <span className="hidden sm:inline">开源</span>
          </a>
        </div>
      </div>
    </header>
  );
}
