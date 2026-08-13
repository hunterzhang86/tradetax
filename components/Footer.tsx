import { Github } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-white/[0.06] py-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 sm:px-6 md:flex-row md:justify-between">
        <div className="text-center text-xs text-muted-foreground md:text-left">
          <p>© {new Date().getFullYear()} TradeTax · 开源项目 (MIT License)</p>
          <p className="mt-1">
            仅供参考, 不构成税务建议 · 汇率来源: 中国国家外汇管理局
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <a
            href="#privacy"
            className="text-muted-foreground transition hover:text-foreground"
          >
            隐私说明
          </a>
          <a
            href="#method"
            className="text-muted-foreground transition hover:text-foreground"
          >
            计算方式
          </a>
          <a
            href="https://github.com/hunterzhang86/tradetax"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-muted-foreground transition hover:text-foreground"
          >
            <Github className="h-4 w-4" />
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
