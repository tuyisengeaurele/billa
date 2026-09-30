import { formatRwf } from "./money.js";

export interface InstallmentInput {
  label?: string | null;
  amount: number;
  // A calendar date, "2026-10-01", or a full ISO timestamp.
  dueDate: string;
}

export type InstallmentStatus = "PAID" | "PARTIALLY_PAID" | "OVERDUE" | "UNPAID";

export interface ScheduleStep {
  label: string | null;
  amount: number;
  dueDate: string;
  paid: number;
  remaining: number;
  status: InstallmentStatus;
  isOverdue: boolean;
  number: number;
  count: number;
}

export const MAX_INSTALLMENTS = 12;

/** Why a payment plan cannot be saved, or null when it is fine. The total is whatever the document's lines come to. */
export function validateInstallmentPlan(total: number, plan: InstallmentInput[]): string | null {
  if (plan.length < 2) return "Add at least two instalments, or choose to pay in full.";
  if (plan.length > MAX_INSTALLMENTS) return `Use ${MAX_INSTALLMENTS} instalments or fewer.`;
  for (const step of plan) {
    if (!Number.isInteger(step.amount) || step.amount <= 0) return "Each instalment must be a whole amount greater than zero.";
    if (Number.isNaN(Date.parse(step.dueDate))) return "Each instalment needs a valid due date.";
  }
  const sum = plan.reduce((acc, step) => acc + step.amount, 0);
  if (sum !== total) {
    return `The instalments add up to ${formatRwf(sum)} but the total is ${formatRwf(total)}.`;
  }
  return null;
}

/**
 * The plan in date order, with each step marked by how much of it has been covered. Money is
 * applied to the earliest instalment first; nothing is stored, so it can never fall out of step
 * with the payments recorded on the invoice.
 */
export function buildSchedule(plan: InstallmentInput[], settled: number, now: Date): ScheduleStep[] {
  const ordered = plan
    .map((step, index) => ({ step, index }))
    .sort((a, b) => Date.parse(a.step.dueDate) - Date.parse(b.step.dueDate) || a.index - b.index)
    .map(({ step }) => step);

  let left = Math.max(settled, 0);
  return ordered.map((step, index) => {
    const paid = Math.min(step.amount, left);
    left -= paid;
    const remaining = step.amount - paid;
    const isOverdue = remaining > 0 && Date.parse(step.dueDate) < now.getTime();
    // Part-paid wins over overdue: money has come in, and isOverdue still says the date has gone by.
    const status: InstallmentStatus =
      remaining === 0 ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : isOverdue ? "OVERDUE" : "UNPAID";
    return {
      label: step.label ?? null,
      amount: step.amount,
      dueDate: step.dueDate,
      paid,
      remaining,
      status,
      isOverdue,
      number: index + 1,
      count: ordered.length,
    };
  });
}

/** The step the customer should pay next: the first one with something still owing. */
export function nextInstallmentDue(schedule: ScheduleStep[]): ScheduleStep | null {
  return schedule.find((step) => step.remaining > 0) ?? null;
}

/** A percentage of the total in whole francs, kept between nothing and the whole total. */
export function percentOfTotal(total: number, percent: number): number {
  return Math.min(Math.max(Math.round((total * percent) / 100), 0), total);
}

/** The total shared over some instalments; any leftover francs go on the last one. */
export function splitEvenly(total: number, parts: number): number[] {
  const each = Math.floor(total / parts);
  const amounts = Array.from({ length: parts }, () => each);
  amounts[parts - 1] = total - each * (parts - 1);
  return amounts;
}
