/**
 * One rule that judges a set of repeated runs.
 *
 * `check` receives ALL N runs, not one, so a strategy can compare runs
 * against each other. An empty violation list means the rule passed.
 */
export interface Strategy<T> {
  name(): string;
  check(runs: readonly T[]): Violation[];
}

/**
 * A violation raised by a strategy.
 *
 * `runIndex === CROSS_RUN` marks a failure that concerns the whole run
 * set rather than a single run (e.g. the runs disagree with each other).
 */
export interface Violation {
  runIndex: number;
  field: string;
  actual: unknown;
  allowed: unknown;
  message: string;
}

export const CROSS_RUN = -1;

/**
 * Base class for strategies that judge each run in isolation.
 * Subclasses implement `checkRun` and get `check(runs)` for free.
 */
export abstract class PerRunStrategy<T> implements Strategy<T> {
  abstract name(): string;

  protected abstract checkRun(run: T, runIndex: number): Violation | undefined;

  check(runs: readonly T[]): Violation[] {
    const violations: Violation[] = [];
    runs.forEach((run, index) => {
      const violation = this.checkRun(run, index);
      if (violation) {
        violations.push(violation);
      }
    });
    return violations;
  }
}

/** The outcome of running one strategy against a run set. */
export interface StrategyOutcome {
  name: string;
  violations: Violation[];
}

export function strategyOutcomePassed(outcome: StrategyOutcome): boolean {
  return outcome.violations.length === 0;
}
