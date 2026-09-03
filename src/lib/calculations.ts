/**
 * Divido Calculation Engine
 * Handles multi-currency debt simplification and recurrence date math.
 */

import { Expense as GroupExpense } from './types';

export interface SimplifiedTransaction {
  from: string;
  to: string;
  balances: Record<string, number>;
}

export const simplifyMultiCurrencyDebts = (
  members: string[],
  expenses: GroupExpense[],
  defaultCurrency: string = '₹'
): SimplifiedTransaction[] => {
  // 1. Find all active currencies
  const currencies = new Set<string>();
  currencies.add(defaultCurrency);
  expenses.forEach(e => {
    if (e.currency) currencies.add(e.currency);
  });

  // Accumulator for final transactions across all currencies
  // key: "from-to" -> Record<currency, amount>
  const combinedTransactions: Record<string, Record<string, number>> = {};

  currencies.forEach(c => {
    // Calculate net balances for each member in this currency
    const balances: Record<string, number> = {};
    members.forEach(m => { balances[m] = 0; });

    expenses.forEach(e => {
      if (e.isDeleted) return;
      const expCurrency = e.currency || defaultCurrency;
      if (expCurrency !== c) return;

      const splitters = e.splitters || members;
      if (splitters.length === 0) return;

      // Coerce the amount defensively: a null/undefined/NaN amt would otherwise
      // spread NaN through every balance. Number('12.5') and Number(12.5) are
      // unaffected, so valid amounts pass through untouched.
      const amt = Number(e.amt) || 0;

      // Credit the payer
      balances[e.paid] = (balances[e.paid] || 0) + amt;

      // Debit splitters
      splitters.forEach(s => {
        let share = 0;
        if (!e.mode || e.mode === 'Equally') {
          share = amt / splitters.length;
        } else if (e.mode === 'Unequally') {
          share = parseFloat(e.shares?.[s]?.toString() || '0');
        } else if (e.mode === 'Percentage') {
          share = (amt * parseFloat(e.shares?.[s]?.toString() || '0')) / 100;
        }
        balances[s] = (balances[s] || 0) - share;
      });
    });

    // Separate into creditors and debtors
    const creditors: { name: string; amount: number }[] = [];
    const debtors: { name: string; amount: number }[] = [];

    Object.entries(balances).forEach(([name, bal]) => {
      if (bal > 0.01) {
        creditors.push({ name, amount: bal });
      } else if (bal < -0.01) {
        debtors.push({ name, amount: Math.abs(bal) });
      }
    });

    // Simplify debts using a greedy matching algorithm
    // We sort descending to resolve larger debts first, minimizing transactions
    while (creditors.length > 0 && debtors.length > 0) {
      creditors.sort((a, b) => b.amount - a.amount);
      debtors.sort((a, b) => b.amount - a.amount);

      const creditor = creditors[0];
      const debtor = debtors[0];
      const amount = Math.min(creditor.amount, debtor.amount);

      if (amount > 0.01) {
        // Use a control-char delimiter that cannot occur in a member name, so
        // names containing '-' (e.g. "Jean-Paul") survive the round-trip below.
        const key = `${debtor.name}\x1f${creditor.name}`;
        if (!combinedTransactions[key]) combinedTransactions[key] = {};
        combinedTransactions[key][c] = (combinedTransactions[key][c] || 0) + amount;
      }

      creditor.amount -= amount;
      debtor.amount -= amount;

      if (creditor.amount < 0.01) creditors.shift();
      if (debtor.amount < 0.01) debtors.shift();
    }
  });

  // Convert combinedTransactions map to SimplifiedTransaction array
  const transactionsList: SimplifiedTransaction[] = [];
  Object.entries(combinedTransactions).forEach(([key, balRecord]) => {
    const [from, to] = key.split('\x1f');
    // Filter out very small balances to keep it clean
    const cleanBalances: Record<string, number> = {};
    let hasValue = false;
    Object.entries(balRecord).forEach(([currKey, val]) => {
      if (val > 0.01) {
        cleanBalances[currKey] = val;
        hasValue = true;
      }
    });
    if (hasValue) {
      transactionsList.push({ from, to, balances: cleanBalances });
    }
  });

  return transactionsList;
};

/**
 * Computes raw (non-simplified) pairwise debts between members, netting each
 * pair against its reverse so A↔B collapses to a single directed transaction.
 *
 * This is the shared implementation for the non-"simplify debts" balance path.
 * It uses a control-char delimiter (\x1f) that cannot occur in a member name,
 * so names containing '-' (e.g. "Jean-Paul") survive the key round-trip.
 */
export const computeRawPairwiseTransactions = (
  members: string[],
  expenses: GroupExpense[],
  defaultCurrency: string = '₹'
): SimplifiedTransaction[] => {
  const pairDebts: Record<string, Record<string, number>> = {};
  expenses.forEach((e) => {
    if (e.isDeleted) return;
    const splitters = e.splitters || members;
    const c = e.currency || defaultCurrency;
    // Defensive coercion — see simplifyMultiCurrencyDebts above.
    const amt = Number(e.amt) || 0;
    splitters.forEach((s) => {
      if (s !== e.paid) {
        const amtVal =
          !e.mode || e.mode === 'Equally'
            ? amt / (splitters.length || 1)
            : e.mode === 'Unequally'
            ? parseFloat(e.shares?.[s]?.toString() || '0')
            : (amt * parseFloat(e.shares?.[s]?.toString() || '0')) / 100;
        if (amtVal > 0.01) {
          const key = `${s}\x1f${e.paid}`;
          if (!pairDebts[key]) pairDebts[key] = {};
          pairDebts[key][c] = (pairDebts[key][c] || 0) + amtVal;
        }
      }
    });
  });

  const rawTransactions: SimplifiedTransaction[] = [];
  const processedPairs = new Set<string>();

  Object.keys(pairDebts).forEach((key) => {
    const [from, to] = key.split('\x1f');
    const reverseKey = `${to}\x1f${from}`;
    if (processedPairs.has(key)) return;
    const currencies = new Set([
      ...Object.keys(pairDebts[key] || {}),
      ...Object.keys(pairDebts[reverseKey] || {}),
    ]);

    const balances: Record<string, number> = {};
    currencies.forEach((c) => {
      const debt = pairDebts[key]?.[c] || 0;
      const credit = pairDebts[reverseKey]?.[c] || 0;
      const net = debt - credit;
      if (Math.abs(net) > 0.01) {
        balances[c] = net;
      }
    });

    if (Object.keys(balances).length > 0) {
      const hasOwed = Object.values(balances).some((v) => v > 0.01);
      const hasOwe = Object.values(balances).some((v) => v < -0.01);

      if (hasOwed && !hasOwe) {
        rawTransactions.push({ from, to, balances });
      } else if (hasOwe && !hasOwed) {
        const inverted: Record<string, number> = {};
        Object.entries(balances).forEach(([k, v]) => {
          inverted[k] = -v;
        });
        rawTransactions.push({ from: to, to: from, balances: inverted });
      } else if (hasOwed && hasOwe) {
        rawTransactions.push({ from, to, balances });
      }
    }
    processedPairs.add(key);
    processedPairs.add(reverseKey);
  });

  return rawTransactions;
};

export const calculateNextOccurrenceDate = (
  dateStr: string,
  recurrence: 'weekly' | 'monthly' | 'yearly'
): string => {
  const parts = dateStr.split('-');
  const year = parseInt(parts[0]);
  const month = parseInt(parts[1]) - 1; // 0-indexed
  const day = parseInt(parts[2]);

  const d = new Date(year, month, day);

  if (recurrence === 'weekly') {
    d.setDate(d.getDate() + 7);
  } else if (recurrence === 'monthly') {
    const targetMonth = (month + 1) % 12;
    d.setMonth(d.getMonth() + 1);
    if (d.getMonth() !== targetMonth) {
      d.setDate(0); // Rollback to last day of previous month
    }
  } else if (recurrence === 'yearly') {
    d.setFullYear(d.getFullYear() + 1);
    // Leap year handle for Feb 29 (month is 1)
    if (d.getMonth() !== month) {
      d.setDate(0); // Rollback to last day of February (Feb 28)
    }
  }

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};
