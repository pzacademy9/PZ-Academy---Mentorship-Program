import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type StateAction = { label: string; href?: string; onClick?: () => void };

function ActionButton({ action, variant }: { action: StateAction; variant: "default" | "outline" }) {
  if (action.href) {
    return (
      <Button asChild variant={variant} className="max-md:w-full">
        <Link href={action.href}>{action.label}</Link>
      </Button>
    );
  }
  return <Button variant={variant} onClick={action.onClick} className="max-md:w-full">{action.label}</Button>;
}

export function EmptyState({
  icon: Icon, title, description, action, secondaryAction, className,
}: {
  icon: LucideIcon; title: string; description?: string;
  action?: StateAction; secondaryAction?: StateAction; className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-4 py-10 text-center md:py-14", className)}>
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <Icon className="h-8 w-8 text-primary" aria-hidden="true" />
      </div>
      <h3 className="font-headline text-lg font-bold text-foreground">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {(action || secondaryAction) && (
        <div className="mt-5 flex w-full flex-col gap-2 md:w-auto md:flex-row">
          {action && <ActionButton action={action} variant="default" />}
          {secondaryAction && <ActionButton action={secondaryAction} variant="outline" />}
        </div>
      )}
    </div>
  );
}
