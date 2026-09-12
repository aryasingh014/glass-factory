import React from "react";
import { cn } from "@/lib/utils";

type StatusVariant = "completed" | "in-progress" | "pending" | "rejected" | "rework";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const variantMap: Record<string, StatusVariant> = {
  completed: "completed",
  finished: "completed",
  "in production": "in-progress",
  "in-production": "in-progress",
  "in progress": "in-progress",
  "in-progress": "in-progress",
  processing: "in-progress",
  pending: "pending",
  queued: "pending",
  rejected: "rejected",
  failed: "rejected",
  rework: "rework",
  "re-work": "rework",
};

const variantStyles: Record<StatusVariant, string> = {
  completed: "bg-emerald-100 text-emerald-800 border border-emerald-300",
  "in-progress": "bg-amber-100 text-amber-900 border border-amber-300",
  pending: "bg-purple-100 text-purple-800 border border-purple-300",
  rejected: "bg-red-100 text-red-800 border border-red-300",
  rework: "bg-orange-100 text-orange-800 border border-orange-300",
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className }) => {
  const normalised = (status || "").toLowerCase().trim();
  const variant = variantMap[normalised] ?? "in-progress";
  const styles = variantStyles[variant];

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider rounded-full whitespace-nowrap leading-tight shrink-0 select-none",
        styles,
        className,
      )}
    >
      {status}
    </span>
  );
};
