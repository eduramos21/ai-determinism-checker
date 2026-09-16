/**
 * Runnable example: a fictional "ticket triage" AI feature that turns a
 * support ticket into { category, urgent, summary }. No real network
 * call — the producer is a scripted sequence, so this runs anywhere
 * with no key and no server.
 *
 * Run with: npm run example
 */
import {
  AllowedSetStrategy,
  CrossFieldConsistencyStrategy,
  LlmJudgeStrategy,
  StubJudgeClient,
  executeDeterminismTestCase,
  report,
  type DeterminismTestCase,
} from "../src/index.js";

interface TriageResult {
  category: string;
  urgent: boolean;
  summary: string;
}

const CATEGORIES = ["billing", "bug", "feature-request", "account"];

// A scripted sequence of "model outputs" — the 3rd run is deliberately
// bad, to show both a passing and a failing strategy in the report.
const scriptedRuns: TriageResult[] = [
  { category: "bug", urgent: true, summary: "User reports the app crashes on login." },
  { category: "bug", urgent: true, summary: "App crashes when the user logs in." },
  { category: "not-a-real-category", urgent: true, summary: "App crashes when logging in." },
  { category: "bug", urgent: true, summary: "Login crash reported by user." },
  { category: "bug", urgent: true, summary: "Login page throws an error and app closes." },
];

let call = 0;
const producer = (): TriageResult => scriptedRuns[call++];

// A stub judge: fails any summary that mentions a part of the app not
// present in the ticket text, to stand in for a real LLM-judge call.
const judge = new StubJudgeClient((content) => {
  if (content.toLowerCase().includes("payment")) {
    return { pass: false, reason: "summary invents a payment issue not in the ticket" };
  }
  return { pass: true, reason: "summary matches the reported issue" };
});

const testCase: DeterminismTestCase<TriageResult> = {
  id: "login-crash-ticket",
  inputRef: "The app crashes every time I try to log in, please help.",
  producer,
  n: scriptedRuns.length,
  strategies: [
    new AllowedSetStrategy<TriageResult, string>("category", (r) => r.category, CATEGORIES),
    new CrossFieldConsistencyStrategy<TriageResult>(
      "urgent_requires_summary",
      (r) => !r.urgent || r.summary.length > 0,
      "urgent=true must come with a non-empty summary",
    ),
    new LlmJudgeStrategy<TriageResult>(
      "summary",
      (r) => r.summary,
      "must describe a login crash; must not invent an unrelated issue",
      judge,
    ),
  ],
};

const result = await executeDeterminismTestCase(testCase);
console.log(report(result));
