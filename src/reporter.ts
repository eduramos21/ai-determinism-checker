import type { DeterminismResult } from "./result.js";
import { CROSS_RUN } from "./strategy.js";

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Renders a per-strategy pass/fail checklist for a `DeterminismResult`,
 * with actual-vs-allowed detail for every violation.
 *
 * Passing strategies are printed too — with a dozen rules in play,
 * knowing which ones held is what makes the failures interpretable.
 */
export function report<T>(result: DeterminismResult<T>): string {
  const totalViolations = result.outcomes.reduce(
    (sum, outcome) => sum + outcome.violations.length,
    0,
  );
  const status = totalViolations === 0 ? "PASS" : "FAIL";
  const lines: string[] = [
    `${status} [${result.caseId}] ${result.runs.length} run(s), ${totalViolations} violation(s)`,
  ];

  for (const outcome of result.outcomes) {
    const ok = outcome.violations.length === 0;
    lines.push(`  ${ok ? "✓" : "✗"} ${outcome.name}`);
    for (const violation of outcome.violations) {
      const runLabel = violation.runIndex === CROSS_RUN ? "cross-run" : `run ${violation.runIndex}`;
      lines.push(
        `      ${runLabel} | field=${violation.field} | actual=${formatValue(violation.actual)} | ` +
          `allowed=${formatValue(violation.allowed)} | ${violation.message}`,
      );
    }
  }

  return lines.join("\n");
}
