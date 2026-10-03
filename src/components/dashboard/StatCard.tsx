import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconBg?: string;
  className?: string;
}

export function StatCard({ label, value, icon: Icon, iconBg = "bg-pz-secondary/10", className }: StatCardProps) {
  return (
    <div className={cn("p-4 md:p-5 rounded-xl border border-pz-secondary/20 bg-pz-surface-container/50 hover:border-pz-secondary transition-all group", className)}>
      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0 mb-3", iconBg)}>
        <Icon className="w-5 h-5 text-pz-secondary" />
      </div>
      <p className="text-pz-on-surface-variant text-[11px] font-label uppercase tracking-widest">{label}</p>
      <p className="font-headline font-bold text-xl text-pz-on-surface mt-0.5 group-hover:translate-x-1 transition-transform">{value}</p>
    </div>
  );
}
