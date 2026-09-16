/** The verdict a judge renders for one piece of content. */
export interface Verdict {
  pass: boolean;
  reason: string;
}

/**
 * Grades free text against explicit criteria.
 *
 * This is an interface on purpose — never a concrete SDK call. The
 * backend (a hosted workflow, an API call, a local model) is swappable
 * without touching any code that depends on `JudgeClient`, and an
 * offline stub keeps callers testable with no network and no key.
 *
 * A judge that cannot render an opinion must throw. Never return
 * `{ pass: false }` for a transport or model failure — that would
 * conflate "the output is bad" with "we could not evaluate it", and a
 * judge outage would look identical to a total quality collapse.
 */
export interface JudgeClient {
  judge(content: string, criteria: string): Promise<Verdict>;
}

/**
 * Offline test double for `JudgeClient`. The caller supplies the
 * verdict logic; no network, no key.
 */
export class StubJudgeClient implements JudgeClient {
  constructor(private readonly fn: (content: string, criteria: string) => Verdict) {}

  async judge(content: string, criteria: string): Promise<Verdict> {
    return this.fn(content, criteria);
  }
}

/**
 * Wraps a real `JudgeClient` and records every call — content,
 * criteria, and the verdict returned — so a report can show exactly
 * what the judge was shown and why it decided what it decided.
 *
 * A judge call that throws propagates unchanged; the failed call is
 * simply not recorded.
 */
export interface RecordedJudgeCall {
  content: string;
  criteria: string;
  verdict: Verdict;
}

export class RecordingJudgeClient implements JudgeClient {
  private readonly calls: RecordedJudgeCall[] = [];

  constructor(private readonly delegate: JudgeClient) {}

  async judge(content: string, criteria: string): Promise<Verdict> {
    const verdict = await this.delegate.judge(content, criteria);
    this.calls.push({ content, criteria, verdict });
    return verdict;
  }

  getCalls(): readonly RecordedJudgeCall[] {
    return this.calls;
  }
}
