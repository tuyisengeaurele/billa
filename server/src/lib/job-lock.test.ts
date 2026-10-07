import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "./prisma.js";
import { resetDb } from "../test/db.js";
import { withJobLock } from "./job-lock.js";

beforeEach(resetDb);

function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

describe("withJobLock", () => {
  it("runs the work and hands back its result", async () => {
    const result = await withJobLock("jobs", 60_000, async () => 42);

    expect(result).toEqual({ ran: true, value: 42 });
  });

  it("lets only one of two simultaneous callers run", async () => {
    const hold = gate();
    let runs = 0;
    const first = withJobLock("jobs", 60_000, async () => {
      runs += 1;
      await hold.promise;
    });
    // Give the first caller time to take the lease before the second one asks.
    await new Promise((resolve) => setTimeout(resolve, 100));

    const second = await withJobLock("jobs", 60_000, async () => {
      runs += 1;
    });
    hold.open();
    await first;

    expect(second).toEqual({ ran: false });
    expect(runs).toBe(1);
  });

  it("lets the job run again once the first run has finished", async () => {
    await withJobLock("jobs", 60_000, async () => undefined);

    const again = await withJobLock("jobs", 60_000, async () => "second");

    expect(again).toEqual({ ran: true, value: "second" });
  });

  it("frees the lease when the work throws, and passes the error on", async () => {
    await expect(
      withJobLock("jobs", 60_000, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect((await withJobLock("jobs", 60_000, async () => 1)).ran).toBe(true);
  });

  it("takes over a lease that has expired, for instance after a crash", async () => {
    await prisma.jobLock.create({ data: { name: "jobs", lockedUntil: new Date(Date.now() - 1000), lockedBy: "crashed" } });

    const result = await withJobLock("jobs", 60_000, async () => "recovered");

    expect(result).toEqual({ ran: true, value: "recovered" });
  });

  it("does not block a job with a different name", async () => {
    const hold = gate();
    const first = withJobLock("one", 60_000, () => hold.promise);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const other = await withJobLock("two", 60_000, async () => "free");
    hold.open();
    await first;

    expect(other).toEqual({ ran: true, value: "free" });
  });

  it("does not release a lease that another server took after this one expired", async () => {
    const hold = gate();
    const slow = withJobLock("jobs", 1, async () => {
      await hold.promise;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    // This server's lease ran out, so a second server takes it.
    const takeover = withJobLock("jobs", 60_000, async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    hold.open();
    await slow;

    const stillHeld = await withJobLock("jobs", 60_000, async () => "intruder");
    await takeover;

    expect(stillHeld).toEqual({ ran: false });
  });
});
