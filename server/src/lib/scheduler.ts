import { prisma } from "./prisma.js";
import { generateDueRecurringDocuments } from "./recurring-documents.js";
import { sendOverdueReminders } from "./overdue-reminders.js";
import { recordJobRun } from "./job-run-log.js";

const RUN_INTERVAL_MS = 60 * 60 * 1000;

async function isBusinessActive(businessId: string): Promise<boolean> {
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { ownerId: true } });
  if (!business) return false;
  const owner = await prisma.user.findUnique({ where: { id: business.ownerId } });
  if (!owner) return false;
  const activeUntil = owner.currentPeriodEnd ?? owner.trialEndsAt;
  return activeUntil > new Date();
}

export async function runScheduledJobs(): Promise<void> {
  const businesses = await prisma.business.findMany({ select: { id: true } });

  let recurringGenerated = 0;
  let remindersSent = 0;
  let recurringFailed = false;
  let remindersFailed = false;

  for (const { id: businessId } of businesses) {
    let active: boolean;
    try {
      active = await isBusinessActive(businessId);
    } catch {
      continue;
    }
    if (!active) continue;

    try {
      const generated = await generateDueRecurringDocuments(businessId);
      recurringGenerated += generated.length;
    } catch {
      recurringFailed = true;
    }

    try {
      const sent = await sendOverdueReminders(businessId);
      remindersSent += sent.length;
    } catch {
      remindersFailed = true;
    }
  }

  await recordJobRun("recurring-documents", { succeeded: !recurringFailed, resultCount: recurringGenerated });
  await recordJobRun("overdue-reminders", { succeeded: !remindersFailed, resultCount: remindersSent });
}

let started = false;

export function startScheduler(): void {
  if (started) return;
  started = true;

  const tick = () => {
    runScheduledJobs().catch(() => {
      // Errors are already recorded per-job in the job run log; a scheduler tick
      // never crashes the process.
    });
  };

  setTimeout(tick, 60 * 1000);
  setInterval(tick, RUN_INTERVAL_MS);
}
