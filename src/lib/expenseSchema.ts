// ─────────────────────────────────────────────────────────────────────────
// Single source of truth for how an Expense maps to/from its Supabase row.
//
// Before this, the mapping lived in THREE hand-written places in
// useSupabaseSync (load, full upsert, partial-diff update). Adding a field meant
// editing all three, and missing one silently dropped that field on sync — which
// is exactly how currency-conversion metadata failed to reach other devices.
//
// Now every field is declared once in EXPENSE_FIELDS and the load/save/diff
// helpers are derived from it, so a new column can't be half-wired again.
//
// NOT covered here (handled specially by callers): `id` (coerced to string on
// write) and `timestamp` (read-only, derived from the DB-managed created_at).
// ─────────────────────────────────────────────────────────────────────────
import { Expense } from './types';
import { ensureArray, ensureObject, titleCaseName } from './utils';

interface FieldDef {
  app: keyof Expense;       // key on the Expense object
  db: string;              // column name in Supabase
  fromDb?: (v: any) => any; // transform when loading (DB -> app)
  toDb?: (v: any) => any;   // transform when saving (app -> DB)
  deep?: boolean;          // compare by JSON.stringify in the diff (objects/arrays)
  strCompare?: boolean;    // compare with String() in the diff (ids)
}

const titleCaseKeys = (o: Record<string, any>): Record<string, any> =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [titleCaseName(k), v]));

export const EXPENSE_FIELDS: FieldDef[] = [
  { app: 'gId', db: 'group_id', strCompare: true },
  { app: 'title', db: 'title' },
  { app: 'amt', db: 'amt', fromDb: (v) => parseFloat(v) || 0 },
  { app: 'paid', db: 'paid', fromDb: (v) => (v ? titleCaseName(v) : v) },
  { app: 'date', db: 'date' },
  { app: 'mode', db: 'mode', toDb: (v) => v || 'Equally' },
  { app: 'splitters', db: 'splitters', fromDb: (v) => ensureArray(v).map(titleCaseName), toDb: (v) => v || [], deep: true },
  { app: 'shares', db: 'shares', fromDb: (v) => titleCaseKeys(ensureObject(v)), deep: true },
  { app: 'category', db: 'category' },
  { app: 'currency', db: 'currency' },
  { app: 'notes', db: 'notes' },
  { app: 'attachments', db: 'attachments', fromDb: (v) => v || [], toDb: (v) => v || [], deep: true },
  { app: 'isDeleted', db: 'is_deleted', fromDb: (v) => v || false, toDb: (v) => v || false },
  { app: 'isRecurring', db: 'is_recurring', toDb: (v) => v || false },
  { app: 'recurrence', db: 'recurrence', toDb: (v) => v || 'none' },
  { app: 'nextOccurrence', db: 'next_occurrence' },
  // Currency-conversion metadata (undo snapshot + rates), so a conversion keeps
  // its ability to be undone across devices.
  { app: 'isConversion', db: 'is_conversion', fromDb: (v) => v || false, toDb: (v) => v || false },
  { app: 'isNormalization', db: 'is_normalization', fromDb: (v) => v || false, toDb: (v) => v || false },
  { app: 'snapshot', db: 'snapshot' },
  { app: 'ratesUsed', db: 'rates_used' },
  { app: 'toCurr', db: 'to_curr' },
  { app: 'fromCurr', db: 'from_curr' },
  { app: 'origAmt', db: 'orig_amt' },
  { app: 'origShares', db: 'orig_shares', deep: true },
  { app: 'prevCurr', db: 'prev_curr' },
];

// DB row -> the mapped fields of an Expense (caller adds id + timestamp).
export const rowToExpenseFields = (row: any): Partial<Expense> => {
  const out: any = {};
  for (const f of EXPENSE_FIELDS) {
    const raw = row[f.db];
    out[f.app] = f.fromDb ? f.fromDb(raw) : raw;
  }
  return out;
};

// Expense -> a full DB row payload (caller adds id). Used for the upsert.
export const expenseToRow = (e: Expense): Record<string, any> => {
  const row: Record<string, any> = {};
  for (const f of EXPENSE_FIELDS) {
    const v = (e as any)[f.app];
    row[f.db] = f.toDb ? f.toDb(v) : v;
  }
  return row;
};

// Only the columns that actually changed vs the last-synced baseline, so a
// partial update never clobbers a field another device edited meanwhile.
export const diffExpenseRow = (oldE: Expense, next: Expense): Record<string, any> => {
  const updates: Record<string, any> = {};
  for (const f of EXPENSE_FIELDS) {
    const a = (oldE as any)[f.app];
    const b = (next as any)[f.app];
    const changed = f.deep
      ? JSON.stringify(a) !== JSON.stringify(b)
      : f.strCompare
      ? String(a) !== String(b)
      : a !== b;
    if (changed) updates[f.db] = f.toDb ? f.toDb(b) : b;
  }
  return updates;
};
