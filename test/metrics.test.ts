import { describe, expect, it } from "vitest";
import { computeMetrics, type DeterminismResult } from "../src/index.js";

interface Sample {
  size: string | null;
}

function makeResult(runs: Sample[], overallPass: boolean): DeterminismResult<Sample> {
  return {
    caseId: "fixture-a",
    runs,
    outcomes: [
      { name: "AllowedSet(size)", violations: overallPass ? [] : [
        { runIndex: 0, field: "size", actual: "x", allowed: [], message: "bad" },
      ] },
    ],
  };
}

describe("computeMetrics", () => {
  it("computes drift_rate as (n - modal_count) / n", () => {
    const runs: Sample[] = [
      { size: "small" },
      { size: "small" },
      { size: "small" },
      { size: "large" },
      { size: null },
    ];
    const result = makeResult(runs, true);

    const row = computeMetrics(result, {
      buildTs: "123",
      gitSha: "abc",
      env: "test",
      enumFields: { size: (r) => (r as Sample).size },
    });

    // modal count is 3 ("small"), n = 5 -> (5 - 3) / 5 = 0.4
    expect(row.drift_rate.size).toBeCloseTo(0.4);
    expect(row.enum_dist.size["small"]).toBe(3);
    expect(row.enum_dist.size["large"]).toBe(1);
    expect(row.fixture_id).toBe("fixture-a");
    expect(row.repeat_n).toBe(5);
  });

  it("tallies blank/missing values under a single token", () => {
    const runs: Sample[] = [{ size: null }, { size: null }, { size: "small" }];
    const result = makeResult(runs, true);

    const row = computeMetrics(result, {
      buildTs: "123",
      gitSha: "abc",
      env: "test",
      enumFields: { size: (r) => (r as Sample).size },
    });

    expect(row.enum_dist.size["∅"]).toBe(2);
    expect(row.enum_dist.size["small"]).toBe(1);
  });

  it("computes judge_pass_rate when judge calls are supplied", () => {
    const result = makeResult([{ size: "small" }], true);
    const row = computeMetrics(result, {
      buildTs: "123",
      gitSha: "abc",
      env: "test",
      enumFields: {},
      judgeCalls: 4,
      judgePasses: 3,
    });

    expect(row.judge_pass_rate).toBeCloseTo(0.75);
  });

  it("leaves judge_pass_rate null when there are no judge calls", () => {
    const result = makeResult([{ size: "small" }], true);
    const row = computeMetrics(result, {
      buildTs: "123",
      gitSha: "abc",
      env: "test",
      enumFields: {},
    });

    expect(row.judge_pass_rate).toBeNull();
  });

  it("reflects overall_pass from the result", () => {
    const failing = makeResult([{ size: "small" }], false);
    const row = computeMetrics(failing, {
      buildTs: "123",
      gitSha: "abc",
      env: "test",
      enumFields: {},
    });

    expect(row.overall_pass).toBe(false);
  });
});
