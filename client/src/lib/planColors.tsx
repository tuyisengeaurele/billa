export type PlanKey = "NONE" | "MONTHLY" | "ANNUAL";

export const PLAN_LABELS: Record<PlanKey, string> = {
  NONE: "Trial",
  MONTHLY: "Monthly",
  ANNUAL: "Annual",
};

export const PLAN_CHART_COLORS: Record<PlanKey, string> = {
  NONE: "#a1a1aa",
  MONTHLY: "#c2185b",
  ANNUAL: "#0d9488",
};

const PLAN_BADGE_CLASSES: Record<PlanKey, { bg: string; text: string; dot: string }> = {
  NONE: { bg: "bg-neutral-100", text: "text-neutral-600", dot: "bg-neutral-400" },
  MONTHLY: { bg: "bg-primary-100", text: "text-primary-700", dot: "bg-primary-500" },
  ANNUAL: {
    bg: "bg-teal-100 dark:!bg-teal-500/15",
    text: "text-teal-700 dark:!text-teal-300",
    dot: "bg-teal-500",
  },
};

export function PlanBadge({ plan }: { plan: PlanKey }) {
  const c = PLAN_BADGE_CLASSES[plan];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-sans text-xs font-semibold ${c.bg} ${c.text}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.dot}`} aria-hidden="true" />
      {PLAN_LABELS[plan]}
    </span>
  );
}

const PLAN_ORDER: PlanKey[] = ["NONE", "MONTHLY", "ANNUAL"];

export function PlanLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 font-sans text-xs text-neutral-600">
      {PLAN_ORDER.map((plan) => (
        <span key={plan} className="flex items-center gap-1.5">
          <span className={`h-2 w-2 shrink-0 rounded-full ${PLAN_BADGE_CLASSES[plan].dot}`} aria-hidden="true" />
          {PLAN_LABELS[plan]}
        </span>
      ))}
    </div>
  );
}
