/**
 * The shared matcher (ADR-0009). Expense categorization (Mapping Rules -> Budget
 * Category) and income classification (Income Rules -> Income Stream) both route
 * a Transaction the same way: over merchant / description / Akahu group / Akahu
 * `type`. The matching logic lives here once; each side feeds it its own rule
 * rows and gets back a target id. This lets a payment Akahu never usefully tags
 * (e.g. a mortgage typed only `LOAN`, or a partner's pay arriving as a
 * `TRANSFER`) still be routed.
 */

/** The four rule match types. */
export const MATCH_TYPES = ["merchant", "description", "akahu_group", "txn_type"] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

/** The Transaction fields a rule can match against. */
export interface MatchFields {
  merchant: string | null;
  description: string | null;
  group: string | null;
  type: string | null;
}

/** A single rule row, agnostic to whether the target is a Category or a Stream. */
export interface MatchRule {
  matchType: string;
  matchValue: string;
  targetId: number;
  priority: number;
  id: number;
}

/**
 * Compile rule rows into an in-memory matcher. Precedence, most specific first:
 * merchant (exact) > description (substring) > akahu_group (exact) > txn_type
 * (exact). Within a match type, higher priority then most recent (higher id)
 * wins. Returns the matched target id, or undefined when no rule matches.
 */
export function buildMatcher(rules: MatchRule[]): (fields: MatchFields) => number | undefined {
  const merchantRules = new Map<string, number>();
  const groupRules = new Map<string, number>();
  const typeRules = new Map<string, number>();
  // description rules need substring matching, so keep them ordered (best last).
  const descriptionRules: { value: string; targetId: number }[] = [];

  // Sort so the winner is written last into each map (higher priority, then id).
  const ordered = [...rules].sort((a, b) => a.priority - b.priority || a.id - b.id);
  for (const r of ordered) {
    switch (r.matchType) {
      case "merchant":
        merchantRules.set(r.matchValue.toLowerCase(), r.targetId);
        break;
      case "akahu_group":
        groupRules.set(r.matchValue, r.targetId);
        break;
      case "txn_type":
        typeRules.set(r.matchValue.toLowerCase(), r.targetId);
        break;
      case "description":
        descriptionRules.push({ value: r.matchValue.toLowerCase(), targetId: r.targetId });
        break;
    }
  }

  return ({ merchant, description, group, type }) => {
    if (merchant) {
      const hit = merchantRules.get(merchant.toLowerCase());
      if (hit !== undefined) return hit;
    }
    if (description) {
      const haystack = description.toLowerCase();
      // Iterate best-last so the last (highest priority) match wins.
      let hit: number | undefined;
      for (const rule of descriptionRules) {
        if (haystack.includes(rule.value)) hit = rule.targetId;
      }
      if (hit !== undefined) return hit;
    }
    if (group) {
      const hit = groupRules.get(group);
      if (hit !== undefined) return hit;
    }
    if (type) {
      const hit = typeRules.get(type.toLowerCase());
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
}
