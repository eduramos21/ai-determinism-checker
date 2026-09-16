import { describe, expect, it } from "vitest";
import {
  AllowedSetStrategy,
  determinismResultPassed,
  executeDeterminismTestCase,
  repeat,
  type DeterminismTestCase,
} from "../src/index.js";

interface Sample {
  color: string;
}

/** Feeds a fixed sequence of values, one per call — no network involved. */
function cyclingProducer(values: readonly Sample[]): () => Sample {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("repeat", () => {
  it("rejects n < 1", async () => {
    await expect(repeat(() => 1, 0)).rejects.toThrow(/n must be >= 1/);
  });

  it("calls the producer n times", async () => {
    const values = [1, 2, 3];
    let i = 0;
    const runs = await repeat(() => values[i++], 3);
    expect(runs).toEqual([1, 2, 3]);
  });
});

describe("executeDeterminismTestCase with AllowedSetStrategy", () => {
  it("flags a bad run with the right runIndex, field, and actual", async () => {
    const values: Sample[] = [
      { color: "red" },
      { color: "red" },
      { color: "purple" }, // not allowed
      { color: "blue" },
    ];

    const testCase: DeterminismTestCase<Sample> = {
      id: "cycling-fixture",
      inputRef: "n/a",
      producer: cyclingProducer(values),
      strategies: [
        new AllowedSetStrategy<Sample, string>("color", (s) => s.color, [
          "red",
          "blue",
        ]),
      ],
      n: 4,
    };

    const result = await executeDeterminismTestCase(testCase);

    expect(determinismResultPassed(result)).toBe(false);
    expect(result.outcomes).toHaveLength(1);

    const [outcome] = result.outcomes;
    expect(outcome.violations).toHaveLength(1);

    const [violation] = outcome.violations;
    expect(violation.runIndex).toBe(2);
    expect(violation.field).toBe("color");
    expect(violation.actual).toBe("purple");
  });

  it("passes when every run is in the allowed set", async () => {
    const values: Sample[] = [{ color: "red" }, { color: "blue" }];

    const testCase: DeterminismTestCase<Sample> = {
      id: "all-good",
      inputRef: "n/a",
      producer: cyclingProducer(values),
      strategies: [
        new AllowedSetStrategy<Sample, string>("color", (s) => s.color, [
          "red",
          "blue",
        ]),
      ],
      n: 2,
    };

    const result = await executeDeterminismTestCase(testCase);
    expect(determinismResultPassed(result)).toBe(true);
  });
});
