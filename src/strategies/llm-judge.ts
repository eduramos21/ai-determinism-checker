import { PerRunStrategy, type Violation } from "../strategy.js";
import type { JudgeClient } from "../judge.js";

/**
 * Extracts free text from a run and hands it, plus fixed criteria, to a
 * `JudgeClient`. Fails the run if the verdict is not a pass.
 *
 * Two distinct uses:
 *  - field-level: grade one prose field against criteria about that field.
 *  - whole-output faithfulness: extract the input plus the entire
 *    serialized output, and ask whether the result is faithful to what
 *    was actually given. This catches contradictions no per-field rule
 *    can see (e.g. a validly-shaped value that is simply the wrong one).
 *
 * Criteria belong to the fixture, not the strategy — they describe
 * *this* input, so pass a criteria string built for the specific case.
 */
export class LlmJudgeStrategy<T> extends PerRunStrategy<T> {
  constructor(
    private readonly field: string,
    private readonly textExtractor: (run: T) => string,
    private readonly criteria: string,
    private readonly judgeClient: JudgeClient,
  ) {
    super();
  }

  name(): string {
    return `LlmJudge(${this.field})`;
  }

  protected async checkRun(run: T, runIndex: number): Promise<Violation | undefined> {
    const content = this.textExtractor(run);
    const verdict = await this.judgeClient.judge(content, this.criteria);

    if (verdict.pass) {
      return undefined;
    }

    return {
      runIndex,
      field: this.field,
      actual: content,
      allowed: `judge criteria: ${this.criteria}`,
      message: verdict.reason,
    };
  }
}
