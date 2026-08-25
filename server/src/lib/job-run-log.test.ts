import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "./prisma.js";
import { resetDb } from "../test/db.js";
import { recordJobRun } from "./job-run-log.js";

beforeEach(resetDb);

describe("recordJobRun", () => {
  it("writes a success row with a result count", async () => {
    await recordJobRun("recurring-documents", { succeeded: true, resultCount: 3 });

    const rows = await prisma.jobRunLog.findMany({ where: { jobName: "recurring-documents" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ succeeded: true, resultCount: 3, errorMessage: null });
  });

  it("writes a failure row with an error message", async () => {
    await recordJobRun("overdue-reminders", { succeeded: false, errorMessage: "boom" });

    const rows = await prisma.jobRunLog.findMany({ where: { jobName: "overdue-reminders" } });
    expect(rows[0]).toMatchObject({ succeeded: false, errorMessage: "boom", resultCount: null });
  });
});
