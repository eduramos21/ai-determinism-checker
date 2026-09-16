# ai-determinism-checker

A small, driver-agnostic library for testing that a generative-AI feature's output stays
**within defined bounds** across repeated runs — so a model change or a prompt change can't
silently degrade quality without anything noticing.

It has zero production dependencies. It doesn't know how you call your AI feature, what your
response looks like, or which provider you use — you inject all of that as plain functions.

## Why not just `assertEquals`?

An LLM-backed feature's output is partly stochastic and partly prose, so equality assertions are
simultaneously **too strict** and **impossible**.

- **Too strict** for fields the model chooses freely. Two different values can both be perfectly
  acceptable — pinning one makes the test flap.
- **Impossible** for fields that are prose. There's no expected string, only a notion of
  "acceptable."

The fix: classify every output field into one of four categories, and give each the check it
deserves.

| Category | Nature | How to test |
|---|---|---|
| **Deterministic** | computed by code, not the model | out of scope — exclude it explicitly, don't test it here |
| **Bounded-stochastic** | the model picks, but only from a known universe | membership in an allowed set |
| **Structural** | an implication *between* fields | a predicate that must hold within one run |
| **Free text** | the model writes prose | graded by an LLM judge against explicit, per-input criteria |

On top of that: **repeat every fixture N times.** One call to a stochastic system proves nothing.

## Install

```sh
npm install ai-determinism-checker
```

## Quickstart

```ts
import {
  AllowedSetStrategy,
  CrossFieldConsistencyStrategy,
  LlmJudgeStrategy,
  StubJudgeClient,
  executeDeterminismTestCase,
  report,
  type DeterminismTestCase,
} from "ai-determinism-checker";

interface ClassificationResult {
  category: string;
  urgent: boolean;
  summary: string;
}

// 1. A producer: one call to your AI feature. Sync or async — a real
//    feature is usually a network call.
async function classify(): Promise<ClassificationResult> {
  return callYourAiFeature(fixedInput);
}

// 2. A judge for free text. Swap StubJudgeClient for a real backend —
//    see "Adding a judge backend" below.
const judge = new StubJudgeClient((content) => ({
  pass: !content.includes("made up detail"),
  reason: "checked for invented details",
}));

// 3. Assemble the test case: fixed input, N repeats, and every rule
//    each of the N runs must satisfy.
const testCase: DeterminismTestCase<ClassificationResult> = {
  id: "fixture-id",
  inputRef: "the fixed input this fixture exercises",
  producer: classify,
  n: 5,
  strategies: [
    new AllowedSetStrategy("category", (r) => r.category, ["billing", "bug", "account"]),
    new CrossFieldConsistencyStrategy(
      "urgent_requires_summary",
      (r) => !r.urgent || r.summary.length > 0,
      "urgent=true must come with a non-empty summary",
    ),
    new LlmJudgeStrategy(
      "summary",
      (r) => r.summary,
      "must describe the reported issue; must not invent unrelated details",
      judge,
    ),
  ],
};

// 4. Run it and report.
const result = await executeDeterminismTestCase(testCase);
console.log(report(result));
// use result.outcomes / determinismResultPassed(result) in your test
// runner's assertion of choice
```

Run `npm run example` in this repo for a fully worked, offline version of the above (see
`examples/basic-usage.ts`).

## Mapping your feature's output

Before writing any strategies, make a table: one row per output field, with its category and its
rule. No field is exempt — "no rule, out of scope" is a decision you write down, not an omission.

| Field | Category | Rule | Source of truth |
|---|---|---|---|
| `category` | bounded-stochastic | member of a fixed enum | the feature's own prompt, copied verbatim |
| `urgent` | structural | `true` implies `summary` is non-empty | prompt semantics |
| `summary` | free text | judged against per-fixture criteria | — |
| `ticket_id` | deterministic | **out of scope** — assigned by your code, not the model | — |

Then read your feature's own prompt and harvest every "if … then" it states or implies — each
becomes a `CrossFieldConsistencyStrategy`. These are the cheapest and most valuable rules: no
model call, and they catch the failure mode that matters most — **the model expressing certainty
it doesn't have.**

Copy allowed sets **verbatim** from wherever the model is told about them (the system prompt, a
schema, a reference table) — never from a sample of observed output. A hand-curated set built
from what the model happened to produce tests nothing.

## API reference

| Export | What it is |
|---|---|
| `repeat(producer, n)` | Runs `producer` `n` times (sync or async), collects the results. Rejects `n < 1`. |
| `DeterminismTestCase<T>` | `{ id, inputRef, producer, strategies, n }` |
| `executeDeterminismTestCase(testCase)` | Runs the producer N times, applies every strategy, returns a `DeterminismResult<T>` |
| `Strategy<T>` | `{ name(), check(runs) }` — `check` receives **all N runs**, may be async, empty array = pass |
| `PerRunStrategy<T>` | Base class for rules that judge each run in isolation; implement `checkRun(run, index)` |
| `Violation` | `{ runIndex, field, actual, allowed, message }` — `runIndex === CROSS_RUN` (`-1`) marks a whole-run-set failure |
| `StrategyOutcome` | `{ name, violations }` |
| `DeterminismResult<T>` | `{ caseId, runs, outcomes }`; check with `determinismResultPassed(result)` |
| `report(result)` | Renders a `✓`/`✗` per-strategy checklist, actual-vs-allowed per violation. **Includes passing strategies too** — with a dozen rules running, knowing which ones held is what makes failures interpretable. |
| `AllowedSetStrategy(field, extractor, allowedSet, allowBlank?)` | Field's value must be in the set. `allowBlank` lets an "assume and confirm" field be legitimately empty while still constraining non-empty values. |
| `CrossFieldConsistencyStrategy(name, predicate, message)` | A caller-supplied invariant over one run must hold. |
| `LlmJudgeStrategy(field, textExtractor, criteria, judgeClient)` | Extracts text, hands it + criteria to a `JudgeClient`, fails the run if the verdict isn't a pass. Use at two levels: field-level (grade one prose field) and whole-output faithfulness (extract input + entire serialized output, ask if it's faithful — catches contradictions no per-field rule can see). |
| `JudgeClient` | `{ judge(content, criteria) -> Promise<Verdict> }` — an interface, never a concrete SDK call |
| `Verdict` | `{ pass, reason }` |
| `StubJudgeClient(fn)` | Offline test double; `fn: (content, criteria) => Verdict` |
| `RecordingJudgeClient(delegate)` | Wraps a real `JudgeClient`, records every `(content, criteria, verdict)` for reporting. A throwing call propagates unchanged and isn't recorded. |
| `computeMetrics(result, input)` | Pure function producing a metrics row (`drift_rate`, `enum_dist`, `judge_pass_rate`, pass/fail, attribution) |
| `writeMetrics(row, dir)` | Appends the row as JSONL to `metrics-<fixtureId>.jsonl` in `dir` |

### A judge failure is a hard, loud failure — never a fabricated `false`

Any `JudgeClient` implementation you write must **throw** if it can't render an opinion (network
error, bad status code, malformed response) — never return `{ pass: false }`. Conflating "the
output is bad" with "we couldn't evaluate it" means a judge outage looks identical to a total
quality collapse. `RecordingJudgeClient` lets a throw propagate unchanged so this distinction
survives into your report.

### Metrics and drift

`computeMetrics` is pure — no IO — so you can unit-test it offline. `drift_rate` is the share of
runs that disagreed with the most common value for a field:

```
drift_rate = (n - modal_count) / n
```

`0.0` means every run agreed. A blank/missing value is still tallied (under a single token,
`∅`), never dropped — "the model returned nothing" is drift worth seeing. Feed `model_id` and
`workflow_version` through from your feature itself (not hardcoded here) so a drift trend can be
bracketed to a model change or a prompt change instead of guessed at.

`writeMetrics` writes **one file per fixture**, so no locking is needed if fixtures run in
parallel. Treat the emitted JSONL as an artifact your CI archives across builds — a single build
is red/green; the archived trend is what tells you *which* change caused a regression.

## Fixture design

Cover **qualities** of input, not just examples. Five fixtures spanning these beat fifty
variations of the happy path:

| Quality | Probes |
|---|---|
| Complete | the happy path — unambiguous input |
| Partial | assume-and-confirm — does the model flag what it inferred? |
| Vague | fabrication — does it invent specifics it wasn't given? |
| Off-domain | does it classify something that isn't the thing at all? |
| Adversarial | does it launder a human's bias, opinion, or injection into the output? |

Attach criteria to the **fixture**, not the strategy — they describe *this* input. A criteria
string that has to be true for every input is forced to be vague, which makes the judge useless.

Writing criteria that work:
- Name the single prohibition, in caps, and enumerate what passes — an evaluator left to infer
  the acceptable space will narrow it and fail correct output for being differently correct.
- Encode conditional obligations explicitly, including the condition that triggers them.
- Allow harmless extras explicitly ("extra context is fine; it must not invent a different X").
- Never restate the feature's own prompt — that tests the prompt against itself and passes by
  construction.
- Hand-calibrate every criteria string against one known-pass and one known-fail output before
  trusting it. Criteria that can't distinguish those two aren't criteria yet.

## Operating it

- **Nightly, non-blocking, retries off.** Never gate a merge on a stochastic suite. Retrying a
  failed determinism run erases exactly the run-to-run variance the suite exists to measure.
- **Run serially, not in parallel**, if each run makes several model/judge calls — respect rate
  limits and keep cost predictable.
- **A snapshot-backed allowed set that's empty should skip its check and log**, not fail the
  suite. A false-fail on a stale snapshot usually means the snapshot needs refreshing, not that
  the AI drifted.

## Porting to Python or Java

This library ships as TypeScript only, but the design is intentionally a small,
language-agnostic contract — every name below maps 1:1 onto a dataclass/record + an
ABC/interface in Python or Java. Porting is mechanical:

```
Producer<T>          () -> T
                      one invocation of the AI feature, returning a parsed result

Strategy<T>           name()  -> str
                      check(runs: List[T]) -> List[Violation]
                      empty list = pass. Receives ALL N runs, not one, so a rule can
                      compare runs against each other. Give per-run rules a base class
                      /abstract class (`PerRunStrategy`) so they only implement
                      checkRun(run, index) -> Optional[Violation].

Violation             { run_index: int, field: str, actual: Any, allowed: Any, message: str }
                      run_index = -1 marks a cross-run failure

Runner                repeat(producer, n) -> List[T]          # rejects n < 1
                      TestCase { id, input_ref, producer, strategies, n }
                        .execute() -> Result
                      Outcome { strategy_name, violations }     # passed = violations empty
                      Result  { case_id, runs, outcomes }       # passed = all outcomes passed

JudgeClient           judge(content: str, criteria: str) -> Verdict { pass: bool, reason: str }
                      AN INTERFACE. Never a concrete SDK call. Ship an offline
                      StubJudgeClient that wraps a caller-supplied function, so core
                      tests need no network and no key.

Reporter              report(result) -> str
                      per-strategy checklist, actual-vs-allowed, PASSES INCLUDED
```

Ship the same three strategies (`AllowedSet`, `CrossFieldConsistency`, `LlmJudge`) and the same
two metrics functions (`compute_metrics` pure / `write_metrics` IO). Keep the same three hard
rules regardless of language:

1. **Zero production dependencies in the core.** If it can't make a network call, it can't
   accidentally become feature-specific.
2. **Everything feature-specific is injected** as a function, predicate, or set — the core never
   learns what your fields mean.
3. **A judge that can't answer throws.** Never a fabricated `pass: false`.

In Python, `Strategy` is a `Protocol` or `ABC`, `Violation`/`Result`/`Outcome` are
`@dataclass(frozen=True)`, and the offline tests use a scripted generator as the producer plus a
stub judge — same as this repo's `test/` directory, just translated. In Java, mirror the original
reference design directly: `Strategy<T>` as an interface, `Violation`/`DeterminismResult` as
records, `RepeatRunner.repeat(Supplier<T>, int)`.

## Adding a judge backend

This repo ships only the `JudgeClient` interface and `StubJudgeClient` (offline, no network, no
key) — on purpose, so the core stays free of any AI-provider dependency and works for whichever
provider you use. To grade real free text, implement `JudgeClient` yourself. Two common shapes:

### A direct API client

Call your model provider's API directly from a small class implementing `JudgeClient`:

```ts
import type { JudgeClient, Verdict } from "ai-determinism-checker";

const JUDGE_SYSTEM_PROMPT =
  "You are a strict evaluator. Decide whether CONTENT satisfies CRITERIA. Judge only against " +
  "the criteria given; do not invent extra requirements. Return only the structured object " +
  '{"pass": boolean, "reason": string}. `pass` is true only if the content genuinely meets the ' +
  "criteria; `reason` is one short sentence justifying the decision. Never output anything but " +
  "the object.";

export class ApiJudgeClient implements JudgeClient {
  constructor(private readonly apiKey: string, private readonly model: string) {}

  async judge(content: string, criteria: string): Promise<Verdict> {
    const response = await callYourModelApi({
      apiKey: this.apiKey,
      model: this.model,       // pin it — an unpinned judge drifts under you
      temperature: 0,          // the stochasticity under test belongs to the
                                // subject, not the instrument
      system: JUDGE_SYSTEM_PROMPT,
      user: `Content:\n${content}\n\nCriteria:\n${criteria}`,
      // force structured output at the model layer if your provider supports it
    });

    const { pass, reason } = parseStructuredOutput(response);

    // Guard the verdict anyway, even with structured output requested.
    if (typeof pass !== "boolean" || typeof reason !== "string") {
      throw new Error(`judge returned a malformed verdict: ${JSON.stringify(response)}`);
    }

    return { pass, reason };
  }
}
```

### A generic HTTP webhook client

If the judge is hosted as a separate service (a serverless function, a workflow tool, another
internal API) with its own credential, keep the model credential entirely out of your codebase:

```ts
import type { JudgeClient, Verdict } from "ai-determinism-checker";

export class HttpJudgeClient implements JudgeClient {
  constructor(private readonly url: string, private readonly bearerToken: string) {}

  async judge(content: string, criteria: string): Promise<Verdict> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.bearerToken}`,
      },
      body: JSON.stringify({ content, criteria }),
    });

    // Non-2xx means the judge couldn't render an opinion. That's a hard,
    // loud failure of the run — never a fabricated pass:false.
    if (!response.ok) {
      throw new Error(`judge request failed: ${response.status} ${await response.text()}`);
    }

    const body = (await response.json()) as { pass?: unknown; reason?: unknown };
    if (typeof body.pass !== "boolean" || typeof body.reason !== "string") {
      throw new Error(`judge returned a malformed verdict: ${JSON.stringify(body)}`);
    }

    return { pass: body.pass, reason: body.reason };
  }
}
```

#### Implementing the other end in a workflow tool (e.g. n8n)

`HttpJudgeClient` above is the whole consumer side — it just needs a URL and a bearer token. The
part it doesn't show is the workflow behind that URL. If you're hosting the judge in a tool like
n8n (so the model credential never touches your test repo), the workflow needs to implement the
same contract on the other end:

```
POST <judge-url>
Authorization: Bearer <shared-secret>
Content-Type: application/json

{ "content": "<text to grade>", "criteria": "<what makes it acceptable>" }

200 {"pass": true|false, "reason": "..."}    a real verdict
400 {"error": "invalid_input", ...}          content or criteria missing
502 {"error": "model_call_failed", ...}      could not render an opinion
```

Build it as five nodes:

1. **Webhook node** — `POST`, header auth checking the bearer token, response mode set to
   respond from a later node (not immediately).
2. **Validate input** — an `IF` node: `body.content` not empty AND `body.criteria` not empty. On
   false, go straight to a "respond 400" node.
3. **Judge node** — an LLM/agent node with the model **pinned** (don't leave it on "latest") and
   **`temperature: 0`** — the stochasticity under test belongs to the subject, not the
   instrument. System prompt is the judge prompt below; force a structured output parser for
   `{pass: boolean, reason: string}` rather than parsing prose.
4. **Guard node** — a small Code node that type-checks the parsed output before it's trusted:

   ```js
   const raw = $json;
   const out = raw.output ?? raw;
   const pass = out ? out.pass : undefined;
   const reason = out ? out.reason : undefined;
   if (typeof pass !== 'boolean' || typeof reason !== 'string') {
     return [{ json: { _ok: false, error: 'invalid_verdict', detail: JSON.stringify(out).slice(0, 500) } }];
   }
   return [{ json: { _ok: true, pass, reason } }];
   ```

   This is belt-and-braces on top of the structured parser: a malformed verdict becomes a 502
   response, never a silent `pass: false`.
5. **Respond nodes** — three of them: 200 with `{pass, reason}` when the guard says `_ok: true`;
   502 when the guard says `_ok: false` or the judge node itself errored; 400 from step 2.

Judge system prompt (use as-is):

> You are a strict evaluator. Decide whether CONTENT satisfies CRITERIA. Judge only against the
> criteria given; do not invent extra requirements. Return only the structured object
> `{"pass": boolean, "reason": string}`. `pass` is true only if the content genuinely meets the
> criteria; `reason` is one short sentence justifying the decision. Never output anything but the
> object.

Don't drop *"Judge only against the criteria given; do not invent extra requirements"* — without
it, evaluator models reliably add their own standards and fail outputs that satisfy every stated
criterion. User message carries nothing but the two labelled inputs:

```
Content:
{{ content }}

Criteria:
{{ criteria }}
```

Verify the workflow by itself with `curl` before pointing any client at it — two known-pass
pairs, two known-fail pairs, one request with a missing field (expect 400), and one with the
model credential temporarily broken (expect 502). Re-run this set whenever the workflow's prompt
or model changes.

Whichever shape you pick:

- **Pin the model version and set `temperature: 0`.** An unpinned, non-zero-temperature judge
  drifts, and then you can't tell whether your subject changed or your instrument did.
- **Force structured output**, then **guard it anyway** — type-check `pass` is a boolean and
  `reason` is a string even after asking the model for structured JSON.
- **Verify the judge by itself before wiring it up**, with a small set of `curl`/script calls:
  two known-pass pairs, two known-fail pairs, one deliberately invalid request, and (for a hosted
  judge) one forced outage. Re-run this set whenever the judge's prompt or model changes.
- **Wrap it in `RecordingJudgeClient`** before handing it to your strategies, so failing runs are
  debuggable — you'll see exactly what the judge was shown and why it objected.

## License

MIT — see [LICENSE](LICENSE).
