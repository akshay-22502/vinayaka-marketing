import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Country } from "@/lib/content/types";
import { purchaseSums, type CostForSums, type ItemForSums } from "./purchases";

// Loads what a list of purchases shows: each purchase with its supplier's name and its sums (rolls,
// area, landed cost). Used by Admin > Purchases and by a supplier's page.

export const PURCHASE_LIST_COLUMNS =
  "id, supplier_id, reference, destination, status, order_date, currency, exchange_rate, container_type, container_count, suppliers(name)";

export type PurchaseListRow = {
  id: string;
  supplier_id: string;
  reference: string;
  destination: Country;
  status: string;
  order_date: string | null;
  currency: string;
  exchange_rate: number | string;
  container_type: string | null;
  container_count: number;
  suppliers: { name: string } | null;
};

export type PurchaseListEntry = PurchaseListRow & { rolls: number; area: number; landed: number; landedPerSqm: number | null };

/** The sums for each purchase, from its product lines and costs. A failed lookup is an error page. */
export async function withSums(supabase: SupabaseClient, rows: PurchaseListRow[]): Promise<PurchaseListEntry[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const [items, costs] = await Promise.all([
    supabase.from("purchase_items").select("id, purchase_id, rolls, sqm_per_roll, price_basis, unit_price").in("purchase_id", ids),
    supabase.from("purchase_costs").select("purchase_id, amount, in_purchase_currency, in_landed_cost").in("purchase_id", ids),
  ]);
  if (items.error) throw new Error(`Could not load purchase products: ${items.error.message}`);
  if (costs.error) throw new Error(`Could not load purchase costs: ${costs.error.message}`);

  const itemsOf = new Map<string, ItemForSums[]>();
  for (const item of items.data ?? []) {
    const list = itemsOf.get(item.purchase_id as string) ?? [];
    list.push(item as ItemForSums);
    itemsOf.set(item.purchase_id as string, list);
  }
  const costsOf = new Map<string, CostForSums[]>();
  for (const cost of costs.data ?? []) {
    const list = costsOf.get(cost.purchase_id as string) ?? [];
    list.push(cost as CostForSums);
    costsOf.set(cost.purchase_id as string, list);
  }

  return rows.map((row) => {
    const sums = purchaseSums(row, itemsOf.get(row.id) ?? [], costsOf.get(row.id) ?? []);
    return { ...row, rolls: sums.rolls, area: sums.area, landed: sums.landed, landedPerSqm: sums.landedPerSqm };
  });
}
