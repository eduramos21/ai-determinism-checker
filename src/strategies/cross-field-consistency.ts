import { PerRunStrategy, type Violation } from "../strategy.js";

/**
 * A caller-supplied invariant must hold within one run.
 *
 * These are the cheapest and most valuable rules: no model call, and
 * they catch the failure mode that matters most — the model expressing
 * certainty it does not have (e.g. "if a field was left blank, a
 * follow-up question must exist").
 */
export class CrossFieldConsistencyStrategy<T> extends PerRunStrategy<T> {
  constructor(
    private readonly ruleName: string,
    private readonly predicate: (run: T) => boolean,
    private readonly message: string,
  ) {
    super();
  }

  name(): string {
    return `CrossFieldConsistency(${this.ruleName})`;
  }

  protected checkRun(run: T, runIndex: number): Violation | undefined {
    if (this.predicate(run)) {
      return undefined;
    }

    return {
      runIndex,
      field: this.ruleName,
      actual: run,
      allowed: this.message,
      message: this.message,
    };
  }
}
