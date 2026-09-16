import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { DeterminismResult } from "./result.js";
import { determinismResultPassed } from "./result.js";

const BLANK_TOKEN = "∅"; // ∅ — a blank/missing value is still a data point

export interface DeterminismMetricsInput {
  buildTs: string;
  gitSha: string;
  env: string;
  modelId?: string;
  workflowVersion?: string;
  /** One field extractor per enum-like field to track drift/distribution for. */
  enumFields: Record<string, (run: unknown) => unknown>;
  /** Total judge calls made and how many passed, if any LlmJudge strategies ran. */
  judgeCalls?: number;
  judgePasses?: number;
}

export interface DeterminismMetricsRow {
  build_ts: string;
  git_sha: string;
  env: string;
  model_id: string | null;
  workflow_version: string | null;
  fixture_id: string;
  repeat_n: number;
  overall_pass: boolean;
  judge_calls: number;
  judge_pass_rate: number | null;
  drift_rate: Record<string, number>;
  enum_dist: Record<string, Record<string, number>>;
}

function tokenize(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return BLANK_TOKEN;
  }
  return String(value);
}

/**
 * Pure computation of one metrics row for a `DeterminismResult`. No IO —
 * unit-testable offline.
 *
 * `drift_rate = (n - modal_count) / n`: the share of runs that disagreed
 * with the most common value. 0.0 means every run agreed.
 */
export function computeMetrics<T>(
  result: DeterminismResult<T>,
  input: DeterminismMetricsInput,
): DeterminismMetricsRow {
  const n = result.runs.length;
  const driftRate: Record<string, number> = {};
  const enumDist: Record<string, Record<string, number>> = {};

  for (const [field, extractor] of Object.entries(input.enumFields)) {
    const counts: Record<string, number> = {};
    for (const run of result.runs) {
      const token = tokenize(extractor(run));
      counts[token] = (counts[token] ?? 0) + 1;
    }
    enumDist[field] = counts;

    const modalCount = Math.max(...Object.values(counts));
    driftRate[field] = n === 0 ? 0 : (n - modalCount) / n;
  }

  const judgeCalls = input.judgeCalls ?? 0;
  const judgePassRate =
    judgeCalls > 0 ? (input.judgePasses ?? 0) / judgeCalls : null;

  return {
    build_ts: input.buildTs,
    git_sha: input.gitSha,
    env: input.env,
    model_id: input.modelId ?? null,
    workflow_version: input.workflowVersion ?? null,
    fixture_id: result.caseId,
    repeat_n: n,
    overall_pass: determinismResultPassed(result),
    judge_calls: judgeCalls,
    judge_pass_rate: judgePassRate,
    drift_rate: driftRate,
    enum_dist: enumDist,
  };
}

/**
 * Appends one JSONL row to `metrics-<fixtureId>.jsonl` in `dir`. One
 * file per fixture, so no locking is needed if fixtures ever run in
 * parallel.
 */
export async function writeMetrics(row: DeterminismMetricsRow, dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, `metrics-${row.fixture_id}.jsonl`);
  await appendFile(path, `${JSON.stringify(row)}\n`, "utf8");
}
