import { Lock } from "lucide-react";

export function EnvBadge({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-mono text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-800 rounded px-1.5 py-0.5 select-none">
      <Lock className="h-3 w-3 shrink-0" />
      {name}
    </span>
  );
}
