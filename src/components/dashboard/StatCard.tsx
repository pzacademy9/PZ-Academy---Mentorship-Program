import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconBg?: string;
  className?: string;
}

export function StatCard({ label, value, icon: Icon, iconBg = "bg-pz-sage/20", className }: StatCardProps) {
  return (
    <div className={cn("bg-white rounded-xl shadow-card p-5 flex items-center gap-4", className)}>
      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", iconBg)}>
        <Icon className="w-6 h-6 text-pz-pine" />
      </div>
      <div>
        <p className="text-pz-muted text-xs font-medium uppercase tracking-wide">{label}</p>
        <p className="font-montserrat font-bold text-2xl text-pz-forest mt-0.5">{value}</p>
      </div>
    </div>
  );
}
