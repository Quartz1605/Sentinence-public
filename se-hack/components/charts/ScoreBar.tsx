import { cn } from "@/lib/utils";

interface ScoreBarProps {
  label: string;
  score: number;
  colorClass?: string;
}

export function ScoreBar({ label, score, colorClass = "bg-indigo-500" }: ScoreBarProps) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-zinc-300">{label}</span>
        <span className="text-sm font-bold text-white">{score}%</span>
      </div>
      <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-1000", colorClass)}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}
