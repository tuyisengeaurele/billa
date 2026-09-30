import type { DocumentInstalment } from "@prisma/client";
import { buildSchedule, nextInstallmentDue, validateInstallmentPlan } from "@billa/shared";
import type { InstallmentInput, ScheduleStep } from "@billa/shared";
import { getInvoiceOutstandingBalance } from "./invoice-payment-status.js";

const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

export function toPlan(installments: Pick<DocumentInstalment, "label" | "amount" | "dueDate">[]): InstallmentInput[] {
  return installments.map((step) => ({ label: step.label, amount: step.amount, dueDate: dateOnly(step.dueDate) }));
}

/** Rows for a new plan, in date order, plus the date the whole invoice is finally due (the last step). */
export function installmentRows(plan: InstallmentInput[]) {
  const ordered = plan
    .map((step, index) => ({ step, index }))
    .sort((a, b) => Date.parse(a.step.dueDate) - Date.parse(b.step.dueDate) || a.index - b.index)
    .map(({ step }) => step);
  return {
    create: ordered.map((step, index) => ({
      sortOrder: index,
      label: step.label ?? null,
      amount: step.amount,
      dueDate: new Date(step.dueDate),
    })),
    finalDueDate: new Date(ordered[ordered.length - 1]!.dueDate),
  };
}

/** The message to send back when a plan does not match the document's total, or null when it is fine. */
export function planProblem(total: number, plan: InstallmentInput[] | undefined): string | null {
  return plan ? validateInstallmentPlan(total, plan) : null;
}

interface ScheduledDocument {
  id: string;
  type: string;
  status: string;
  total: number;
  installments: Pick<DocumentInstalment, "label" | "amount" | "dueDate">[];
}

/**
 * Adds the plan's progress to a document: how much of each step is covered and which is next. What
 * counts as covered is the total less what is still owed, so payments and credit notes both count.
 */
export async function withSchedule<T extends ScheduledDocument>(
  document: T,
  now: Date = new Date(),
): Promise<T & { schedule: ScheduleStep[] | null; nextInstallment: ScheduleStep | null }> {
  if (document.installments.length === 0) return { ...document, schedule: null, nextInstallment: null };

  let settled = 0;
  if (document.status === "FINALIZED" && document.type === "INVOICE") {
    const balance = await getInvoiceOutstandingBalance(document.id);
    settled = balance ? document.total - balance.amountOwed : 0;
  }
  const schedule = buildSchedule(toPlan(document.installments), settled, now);
  return { ...document, schedule, nextInstallment: nextInstallmentDue(schedule) };
}
