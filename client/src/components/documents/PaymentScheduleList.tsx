import { formatRwf, type ScheduleStep } from "@billa/shared";

const STATUS_LABELS: Record<ScheduleStep["status"], string> = {
  PAID: "Paid",
  PARTIALLY_PAID: "Partly paid",
  OVERDUE: "Overdue",
  UNPAID: "Due",
};

const STATUS_COLORS: Record<ScheduleStep["status"], string> = {
  PAID: "bg-emerald-100 text-emerald-700",
  PARTIALLY_PAID: "bg-amber-100 text-amber-700",
  OVERDUE: "bg-red-100 text-red-700",
  UNPAID: "bg-neutral-100 text-neutral-600",
};

export function instalmentName(step: Pick<ScheduleStep, "label" | "number">): string {
  return step.label?.trim() || `Instalment ${step.number}`;
}

/** The instalments of an invoice with what has been paid against each. */
export function PaymentScheduleList({ schedule }: { schedule: ScheduleStep[] }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-surface px-5 py-4">
      <p className="font-sans text-sm font-medium text-neutral-900">Payment plan</p>
      <ul className="flex flex-col divide-y divide-neutral-100">
        {schedule.map((step) => (
          <li
            key={step.number}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 font-sans text-sm"
          >
            <span className="flex flex-col">
              <span className="font-medium text-neutral-900">{instalmentName(step)}</span>
              <span className="text-xs text-neutral-500">Due {step.dueDate.slice(0, 10)}</span>
            </span>
            <span className="flex items-center gap-3">
              <span className="text-neutral-700">{formatRwf(step.amount)}</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[step.status]}`}>
                {STATUS_LABELS[step.status]}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
