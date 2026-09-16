import type { Strategy } from "./strategy.js";
import type { DeterminismResult } from "./result.js";

/**
 * Runs `producer` `n` times and collects the results.
 * `producer` may be sync or async — a real AI feature is usually a
 * network call.
 */
export async function repeat<T>(
  producer: () => T | Promise<T>,
  n: number,
): Promise<T[]> {
  if (n < 1) {
    throw new Error(`repeat: n must be >= 1, got ${n}`);
  }
  const runs: T[] = [];
  for (let i = 0; i < n; i++) {
    runs.push(await producer());
  }
  return runs;
}

/**
 * A fixed input, a way to produce N runs of it, and the rules every run
 * must satisfy.
 */
export interface DeterminismTestCase<T> {
  id: string;
  inputRef: string;
  producer: () => T | Promise<T>;
  strategies: Strategy<T>[];
  n: number;
}

/** Runs the test case's producer N times and applies every strategy. */
export async function executeDeterminismTestCase<T>(
  testCase: DeterminismTestCase<T>,
): Promise<DeterminismResult<T>> {
  const runs = await repeat(testCase.producer, testCase.n);
  const outcomes = testCase.strategies.map((strategy) => ({
    name: strategy.name(),
    violations: strategy.check(runs),
  }));
  return { caseId: testCase.id, runs, outcomes };
}
