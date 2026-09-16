import type { StrategyOutcome } from "./strategy.js";

/** The outcome of executing a `DeterminismTestCase`. */
export interface DeterminismResult<T> {
  caseId: string;
  runs: T[];
  outcomes: StrategyOutcome[];
}

export function determinismResultPassed<T>(result: DeterminismResult<T>): boolean {
  return result.outcomes.every((outcome) => outcome.violations.length === 0);
}
