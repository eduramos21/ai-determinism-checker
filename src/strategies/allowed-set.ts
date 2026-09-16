import { PerRunStrategy, type Violation } from "../strategy.js";

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

/**
 * A field's value must belong to a fixed set of allowed values.
 *
 * Use for output the model *picks* from a knowable universe (an enum
 * copied verbatim from the feature's prompt, or a snapshot of a
 * reference table).
 *
 * `allowBlank` lets an "assume and confirm" field be legitimately empty
 * — a non-blank value must still be in the set. The obligation to
 * actually ask a follow-up should be enforced separately, with a
 * `CrossFieldConsistencyStrategy`.
 */
export class AllowedSetStrategy<T, V> extends PerRunStrategy<T> {
  constructor(
    private readonly field: string,
    private readonly extractor: (run: T) => V,
    private readonly allowedSet: ReadonlySet<V> | readonly V[],
    private readonly allowBlank = false,
  ) {
    super();
  }

  name(): string {
    return `AllowedSet(${this.field})`;
  }

  protected checkRun(run: T, runIndex: number): Violation | undefined {
    const actual = this.extractor(run);

    if (this.allowBlank && isBlank(actual)) {
      return undefined;
    }

    const allowed = Array.isArray(this.allowedSet)
      ? this.allowedSet
      : Array.from(this.allowedSet as ReadonlySet<V>);

    const isAllowed = allowed.includes(actual as V);
    if (isAllowed) {
      return undefined;
    }

    return {
      runIndex,
      field: this.field,
      actual,
      allowed,
      message: "value not in allowed set",
    };
  }
}
