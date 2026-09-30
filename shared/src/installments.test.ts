import { describe, expect, it } from "vitest";
import {
  buildSchedule,
  nextInstallmentDue,
  percentOfTotal,
  splitEvenly,
  validateInstallmentPlan,
} from "./installments.js";

const NOW = new Date("2026-10-10T09:00:00.000Z");

const PLAN = [
  { label: "Deposit", amount: 40000, dueDate: "2026-10-01" },
  { label: "Second", amount: 30000, dueDate: "2026-10-20" },
  { label: "Balance", amount: 30000, dueDate: "2026-11-15" },
];

describe("validateInstallmentPlan", () => {
  it("accepts a plan that adds up to the total", () => {
    expect(validateInstallmentPlan(100000, PLAN)).toBeNull();
  });

  it("rejects a plan that does not add up, saying by how much", () => {
    expect(validateInstallmentPlan(120000, PLAN)).toBe("The instalments add up to 100,000 RWF but the total is 120,000 RWF.");
  });

  it("needs at least two instalments", () => {
    expect(validateInstallmentPlan(40000, [PLAN[0]!])).toBe("Add at least two instalments, or choose to pay in full.");
  });

  it("rejects a zero or negative instalment", () => {
    expect(validateInstallmentPlan(100000, [{ ...PLAN[0]!, amount: 0 }, { ...PLAN[1]!, amount: 100000 }])).toMatch(
      /greater than zero/,
    );
  });

  it("rejects a date that is not a date", () => {
    expect(validateInstallmentPlan(100000, [{ ...PLAN[0]!, dueDate: "soon" }, { ...PLAN[1]!, amount: 60000 }])).toMatch(
      /due date/i,
    );
  });

  it("accepts a plan with no labels", () => {
    expect(
      validateInstallmentPlan(100000, [
        { amount: 50000, dueDate: "2026-10-01" },
        { amount: 50000, dueDate: "2026-11-01" },
      ]),
    ).toBeNull();
  });
});

describe("buildSchedule", () => {
  it("marks earlier instalments paid first as money comes in", () => {
    const schedule = buildSchedule(PLAN, 55000, NOW);

    expect(schedule.map((step) => [step.paid, step.remaining, step.status])).toEqual([
      [40000, 0, "PAID"],
      [15000, 15000, "PARTIALLY_PAID"],
      [0, 30000, "UNPAID"],
    ]);
  });

  it("calls an unpaid instalment overdue once its date has passed", () => {
    const schedule = buildSchedule(PLAN, 0, NOW);

    expect(schedule.map((step) => step.status)).toEqual(["OVERDUE", "UNPAID", "UNPAID"]);
    expect(schedule[0]!.isOverdue).toBe(true);
    expect(schedule[1]!.isOverdue).toBe(false);
  });

  it("keeps a part-paid instalment overdue when its date has passed", () => {
    const schedule = buildSchedule(PLAN, 10000, NOW);

    expect(schedule[0]).toMatchObject({ paid: 10000, remaining: 30000, status: "PARTIALLY_PAID", isOverdue: true });
  });

  it("puts the instalments in date order whatever order they were given", () => {
    const shuffled = [PLAN[2]!, PLAN[0]!, PLAN[1]!];

    expect(buildSchedule(shuffled, 0, NOW).map((step) => step.label)).toEqual(["Deposit", "Second", "Balance"]);
  });

  it("does not credit more than the plan is worth", () => {
    const schedule = buildSchedule(PLAN, 500000, NOW);

    expect(schedule.every((step) => step.status === "PAID")).toBe(true);
    expect(schedule.reduce((sum, step) => sum + step.paid, 0)).toBe(100000);
  });

  it("numbers each step out of the total", () => {
    expect(buildSchedule(PLAN, 0, NOW).map((step) => `${step.number} of ${step.count}`)).toEqual([
      "1 of 3",
      "2 of 3",
      "3 of 3",
    ]);
  });
});

describe("nextInstallmentDue", () => {
  it("is the first instalment with something left to pay", () => {
    const next = nextInstallmentDue(buildSchedule(PLAN, 55000, NOW));

    expect(next).toMatchObject({ label: "Second", remaining: 15000, dueDate: "2026-10-20" });
  });

  it("is null once everything is paid", () => {
    expect(nextInstallmentDue(buildSchedule(PLAN, 100000, NOW))).toBeNull();
  });
});

describe("percentOfTotal", () => {
  it("turns a percentage into whole francs", () => {
    expect(percentOfTotal(100000, 30)).toBe(30000);
    expect(percentOfTotal(100001, 33.33)).toBe(33330);
  });

  it("never goes below zero or above the total", () => {
    expect(percentOfTotal(100000, -5)).toBe(0);
    expect(percentOfTotal(100000, 250)).toBe(100000);
  });
});

describe("splitEvenly", () => {
  it("shares the total, putting any leftover francs on the last instalment", () => {
    expect(splitEvenly(100000, 3)).toEqual([33333, 33333, 33334]);
    expect(splitEvenly(90000, 3)).toEqual([30000, 30000, 30000]);
  });

  it("always adds back up to the total", () => {
    for (const [total, parts] of [[1, 2], [7, 3], [999999, 12]] as const) {
      expect(splitEvenly(total, parts).reduce((sum, amount) => sum + amount, 0)).toBe(total);
    }
  });
});
