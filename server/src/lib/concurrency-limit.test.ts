import { describe, expect, it } from "vitest";
import { createLimiter } from "./concurrency-limit.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe("createLimiter", () => {
  it("runs no more than the limit at once, and the rest in arrival order", async () => {
    const limit = createLimiter(2);
    const gates = [deferred(), deferred(), deferred(), deferred()];
    const started: number[] = [];
    let running = 0;
    let peak = 0;

    const results = gates.map((gate, index) =>
      limit(async () => {
        started.push(index);
        running++;
        peak = Math.max(peak, running);
        await gate.promise;
        running--;
        return index;
      }),
    );

    await Promise.resolve();
    expect(started).toEqual([0, 1]);

    gates[0]!.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(started).toEqual([0, 1, 2]);

    gates[1]!.resolve();
    gates[2]!.resolve();
    await new Promise((r) => setTimeout(r, 0));
    gates[3]!.resolve();

    expect(await Promise.all(results)).toEqual([0, 1, 2, 3]);
    expect(peak).toBe(2);
  });

  it("frees the slot when a task fails, and passes the error on", async () => {
    const limit = createLimiter(1);

    await expect(limit(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");

    expect(await limit(async () => "still works")).toBe("still works");
  });

  it("never goes over the limit when a new call arrives as a slot is handed over", async () => {
    const limit = createLimiter(1);
    const gate = deferred();
    let running = 0;
    let peak = 0;
    const track = async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 1));
      running--;
    };

    const first = limit(async () => {
      await gate.promise;
      await track();
    });
    const second = limit(track);
    gate.resolve();
    const third = limit(track);
    await Promise.all([first, second, third]);

    expect(peak).toBe(1);
  });

  it("gives a fresh limiter room again once everything has finished", async () => {
    const limit = createLimiter(2);
    await Promise.all([limit(async () => 1), limit(async () => 2), limit(async () => 3)]);

    const a = deferred();
    const b = deferred();
    const started: string[] = [];
    const runA = limit(async () => {
      started.push("a");
      await a.promise;
    });
    const runB = limit(async () => {
      started.push("b");
      await b.promise;
    });
    await Promise.resolve();

    expect(started).toEqual(["a", "b"]);
    a.resolve();
    b.resolve();
    await Promise.all([runA, runB]);
  });
});
