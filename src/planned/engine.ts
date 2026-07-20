import type { BudgetSnapshot } from "../budget/engine.js";
import type { FitVerdict } from "../analysis/evaluate.js";

export interface PlanItemInput {
  id: number;
  description: string;
  amountCents: number;
  targetCategoryId: number | null;
  priority: number;
}

export interface PlanItemResult {
  id: number;
  description: string;
  amount_cents: number;
  target_category_id: number | null;
  priority: number;
  verdict: FitVerdict;
  shortfall_cents: number;
}

export interface PlanResult {
  items: PlanItemResult[];
  summary: { fits: number; fits_if_reallocated: number; doesnt_fit: number };
}

/**
 * Priority-greedy fit of a whole wishlist against real remaining money
 * (ticket 07). Items are tested highest-priority first; each fitting item
 * *consumes* room so later items see what's actually left. Reserves nothing and
 * mutates nothing — this is pure analysis over a Budget snapshot.
 *
 * Capacity model: each Budget Category's available room is its Envelope's
 * positive remaining; unallocated Household headroom is a shared pool. A
 * category-targeted item draws from its own room first, then (if reallocating)
 * from headroom and other categories' room. An item with no target category
 * draws from headroom first, then any category's room.
 */
export function planPeriod(snapshot: BudgetSnapshot, items: PlanItemInput[]): PlanResult {
  const roomByCat = new Map<number, number>();
  for (const e of snapshot.envelopes) {
    roomByCat.set(e.category_id, Math.max(0, e.remaining_cents));
  }
  let headroom = Math.max(0, snapshot.household_headroom_cents);

  // Highest priority first; stable tie-break on id (earlier added wins).
  const ordered = [...items].sort((a, b) => b.priority - a.priority || a.id - b.id);

  const results: PlanItemResult[] = [];
  const summary = { fits: 0, fits_if_reallocated: 0, doesnt_fit: 0 };

  const otherCategoriesRoom = (exceptCat: number | null): number => {
    let total = 0;
    for (const [cat, room] of roomByCat) {
      if (cat === exceptCat) continue;
      total += room;
    }
    return total;
  };

  const drainCategories = (need: number, exceptCat: number | null): number => {
    // Drain other categories' room, largest first, until `need` is met.
    const entries = [...roomByCat.entries()]
      .filter(([cat]) => cat !== exceptCat)
      .sort((a, b) => b[1] - a[1]);
    for (const [cat, room] of entries) {
      if (need <= 0) break;
      const take = Math.min(room, need);
      roomByCat.set(cat, room - take);
      need -= take;
    }
    return need;
  };

  for (const item of ordered) {
    const cat = item.targetCategoryId;
    const direct = cat !== null ? (roomByCat.get(cat) ?? 0) : headroom;

    let verdict: FitVerdict;
    let shortfall = 0;

    if (item.amountCents <= direct) {
      verdict = "fits";
      if (cat !== null) roomByCat.set(cat, direct - item.amountCents);
      else headroom = direct - item.amountCents;
    } else {
      shortfall = item.amountCents - direct;
      const flexible =
        (cat !== null ? headroom : 0) + otherCategoriesRoom(cat);
      if (flexible >= shortfall) {
        verdict = "fits_if_reallocated";
        // Consume the direct source fully, then close the shortfall.
        if (cat !== null) {
          roomByCat.set(cat, 0);
          let need = shortfall;
          const fromHeadroom = Math.min(headroom, need);
          headroom -= fromHeadroom;
          need -= fromHeadroom;
          drainCategories(need, cat);
        } else {
          headroom = 0;
          drainCategories(shortfall, null);
        }
      } else {
        verdict = "doesnt_fit";
      }
    }

    results.push({
      id: item.id,
      description: item.description,
      amount_cents: item.amountCents,
      target_category_id: cat,
      priority: item.priority,
      verdict,
      shortfall_cents: shortfall,
    });
    summary[verdict]++;
  }

  // Return in the priority order they were evaluated.
  return { items: results, summary };
}
