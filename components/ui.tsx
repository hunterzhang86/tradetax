import { cn } from "@/lib/utils";

export function Section({
  id,
  title,
  subtitle,
  children,
  className,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("py-16 md:py-20 scroll-mt-20", className)}>
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mb-10">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="mt-3 text-sm md:text-base text-muted-foreground leading-relaxed max-w-2xl">{subtitle}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

export function Badge({
  children,
  tone = "cyan",
  className,
}: {
  children: React.ReactNode;
  tone?: "cyan" | "purple" | "emerald" | "amber" | "red" | "muted";
  className?: string;
}) {
  const tones: Record<string, string> = {
    cyan: "bg-cyan-400/10 text-cyan-300 border-cyan-400/25",
    purple: "bg-purple-400/10 text-purple-300 border-purple-400/25",
    emerald: "bg-emerald-400/10 text-emerald-300 border-emerald-400/25",
    amber: "bg-amber-400/10 text-amber-300 border-amber-400/25",
    red: "bg-rose-400/10 text-rose-300 border-rose-400/25",
    muted: "bg-white/5 text-muted-foreground border-white/10",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  sub,
  tone = "default",
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "positive" | "negative" | "accent";
  className?: string;
}) {
  const valueTone = {
    default: "text-foreground",
    positive: "text-emerald-400",
    negative: "text-rose-400",
    accent: "text-cyan-300",
  }[tone];
  return (
    <div className={cn("glass-card p-5", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-2 text-xl md:text-2xl font-semibold num", valueTone)}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
