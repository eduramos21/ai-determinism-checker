import { describe, expect, it } from "vitest";
import {
  LlmJudgeStrategy,
  StubJudgeClient,
  type Verdict,
} from "../src/index.js";

interface Sample {
  id: number;
  description: string;
}

describe("LlmJudgeStrategy with StubJudgeClient", () => {
  it("passes when the judge passes", async () => {
    const judge = new StubJudgeClient((): Verdict => ({ pass: true, reason: "ok" }));
    const strategy = new LlmJudgeStrategy<Sample>(
      "description",
      (s) => s.description,
      "must mention a scratch",
      judge,
    );

    const violations = await strategy.check([{ id: 1, description: "a scratch" }]);
    expect(violations).toHaveLength(0);
  });

  it("fails with the judge's reason when the judge fails", async () => {
    const judge = new StubJudgeClient(
      (): Verdict => ({ pass: false, reason: "invents a part not mentioned" }),
    );
    const strategy = new LlmJudgeStrategy<Sample>(
      "description",
      (s) => s.description,
      "must not invent details",
      judge,
    );

    const violations = await strategy.check([{ id: 1, description: "a scratch on the door" }]);
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toBe("invents a part not mentioned");
    expect(violations[0].field).toBe("description");
  });

  it("flags only the bad run in a mixed run set", async () => {
    const judge = new StubJudgeClient(
      (content): Verdict =>
        content.includes("bad")
          ? { pass: false, reason: "bad content" }
          : { pass: true, reason: "fine" },
    );
    const strategy = new LlmJudgeStrategy<Sample>(
      "description",
      (s) => s.description,
      "criteria",
      judge,
    );

    const runs: Sample[] = [
      { id: 1, description: "good content" },
      { id: 2, description: "bad content" },
      { id: 3, description: "good content" },
    ];

    const violations = await strategy.check(runs);
    expect(violations).toHaveLength(1);
    expect(violations[0].runIndex).toBe(1);
  });
});
