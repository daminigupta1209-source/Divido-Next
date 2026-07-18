/**
 * Divido Calculation Engine
 * Handles net balance calculation and debt simplification.
 */

export interface Member {
  id: string;
  name: string;
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  paid_by: string;
  split_with: string[];
}

export const calculateNetBalances = (members: Member[], expenses: Expense[]) => {
  const balances: Record<string, number> = {};
  members.forEach(m => balances[m.id] = 0);

  expenses.forEach(exp => {
    const share = exp.amount / exp.split_with.length;
    
    // Creditor (who paid)
    balances[exp.paid_by] = (balances[exp.paid_by] || 0) + exp.amount;
    
    // Debtors (who share the cost)
    exp.split_with.forEach(memberId => {
      balances[memberId] = (balances[memberId] || 0) - share;
    });
  });

  return balances;
};

/**
 * Simplifies debts between members to minimize transactions.
 */
export const simplifyDebts = (balances: Record<string, number>, members: Member[]) => {
  const creditors: (Member & { amount: number })[] = [];
  const debtors: (Member & { amount: number })[] = [];

  Object.keys(balances).forEach(id => {
    const balance = balances[id];
    const member = members.find(m => m.id === id);
    if (member) {
      if (balance > 1) creditors.push({ ...member, amount: balance });
      else if (balance < -1) debtors.push({ ...member, amount: Math.abs(balance) });
    }
  });

  const transactions = [];
  let c = 0;
  let d = 0;

  while (c < creditors.length && d < debtors.length) {
    const creditor = creditors[c];
    const debtor = debtors[d];
    const amount = Math.min(creditor.amount, debtor.amount);

    transactions.push({
      from: debtor.name,
      from_id: debtor.id,
      to: creditor.name,
      to_id: creditor.id,
      amount: Math.round(amount)
    });

    creditor.amount -= amount;
    debtor.amount -= amount;

    if (creditor.amount < 1) c++;
    if (debtor.amount < 1) d++;
  }

  return transactions;
};

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
      const expCurrency = e.currency || defaultCurrency;
      if (expCurrency !== c) return;

      const splitters = e.splitters || members;
      if (splitters.length === 0) return;

      // Credit the payer
      balances[e.paid] = (balances[e.paid] || 0) + e.amt;

      // Debit splitters
      splitters.forEach(s => {
        let share = 0;
        if (!e.mode || e.mode === 'Equally') {
          share = e.amt / splitters.length;
        } else if (e.mode === 'Unequally') {
          share = parseFloat(e.shares?.[s]?.toString() || '0');
        } else if (e.mode === 'Percentage') {
          share = (e.amt * parseFloat(e.shares?.[s]?.toString() || '0')) / 100;
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
        const key = `${debtor.name}-${creditor.name}`;
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
    const [from, to] = key.split('-');
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
