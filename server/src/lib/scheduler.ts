import { prisma } from "./prisma.js";
import { withJobLock } from "./job-lock.js";
import { refreshExchangeRates } from "./exchange-rates.js";
import { purgeDeadSessions } from "./session-cleanup.js";
import { generateDueRecurringDocuments } from "./recurring-documents.js";
import { sendDueSoonReminders } from "./due-soon-reminders.js";
import { sendOverdueReminders } from "./overdue-reminders.js";
import { sendQuoteExpiryReminders } from "./quote-expiry-reminders.js";
import { sendOwnerPaymentDigestIfDue } from "./owner-digest.js";
import { reconcilePendingPayments } from "./payment-reconciliation.js";
import { recordJobRun } from "./job-run-log.js";
import { retryDueWebhookDeliveries } from "./webhooks/dispatch.js";

const RUN_INTERVAL_MS = 60 * 60 * 1000;

async function isBusinessActive(businessId: string): Promise<boolean> {
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { ownerId: true } });
  if (!business) return false;
  const owner = await prisma.user.findUnique({ where: { id: business.ownerId } });
  if (!owner) return false;
  const activeUntil = owner.currentPeriodEnd ?? owner.trialEndsAt;
  return activeUntil > new Date();
}

async function runAllJobs(): Promise<void> {
  const businesses = await prisma.business.findMany({ select: { id: true } });

  let recurringGenerated = 0;
  let remindersSent = 0;
  let expiryRemindersSent = 0;
  let digestsSent = 0;
  let recurringFailed = false;
  let remindersFailed = false;
  let expiryRemindersFailed = false;
  let dueSoonSent = 0;
  let dueSoonFailed = false;
  let digestsFailed = false;

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

    try {
      const sent = await sendDueSoonReminders(businessId);
      dueSoonSent += sent.length;
    } catch {
      dueSoonFailed = true;
    }

    try {
      const sent = await sendQuoteExpiryReminders(businessId);
      expiryRemindersSent += sent.length;
    } catch {
      expiryRemindersFailed = true;
    }

    try {
      const digest = await sendOwnerPaymentDigestIfDue(businessId);
      if (digest.sent) digestsSent += 1;
    } catch {
      digestsFailed = true;
    }
  }

  await recordJobRun("recurring-documents", { succeeded: !recurringFailed, resultCount: recurringGenerated });
  await recordJobRun("overdue-reminders", { succeeded: !remindersFailed, resultCount: remindersSent });
  await recordJobRun("due-soon-reminders", { succeeded: !dueSoonFailed, resultCount: dueSoonSent });
  await recordJobRun("quote-expiry-reminders", {
    succeeded: !expiryRemindersFailed,
    resultCount: expiryRemindersSent,
  });
  await recordJobRun("owner-payment-digest", { succeeded: !digestsFailed, resultCount: digestsSent });

  // Global, not per-business: sweeps every still-pending payment across every
  // business/user in one pass, rather than one query per business in the loop above.
  try {
    const result = await reconcilePendingPayments();
    await recordJobRun("payment-reconciliation", {
      succeeded: true,
      resultCount: result.billingResolved + result.momoResolved,
    });
  } catch (err) {
    await recordJobRun("payment-reconciliation", {
      succeeded: false,
      errorMessage: err instanceof Error ? err.message : "Unknown error",
    });
  }

  try {
    const purged = await purgeDeadSessions();
    await recordJobRun("session-cleanup", { succeeded: true, resultCount: purged });
  } catch (err) {
    await recordJobRun("session-cleanup", {
      succeeded: false,
      errorMessage: err instanceof Error ? err.message : "Unknown error",
    });
  }

  // Global too: one set of bank rates for every business. Skipped under test so no run reaches the network.
  if (process.env.NODE_ENV !== "test") {
    try {
      const updated = await refreshExchangeRates();
      await recordJobRun("exchange-rates", { succeeded: true, resultCount: updated });
    } catch (err) {
      await recordJobRun("exchange-rates", {
        succeeded: false,
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  try {
    const retried = await retryDueWebhookDeliveries();
    await recordJobRun("webhook-retries", { succeeded: true, resultCount: retried });
  } catch (err) {
    await recordJobRun("webhook-retries", {
      succeeded: false,
      errorMessage: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

// The hourly pass takes a lease first, so a second server running the same timer skips the pass instead
// of sending every reminder twice. Shorter than the hour, so a server that dies mid-run frees it in time.
const SCHEDULER_LEASE_MS = 50 * 60 * 1000;

export async function runScheduledJobs(): Promise<void> {
  await withJobLock("scheduler", SCHEDULER_LEASE_MS, runAllJobs);
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
