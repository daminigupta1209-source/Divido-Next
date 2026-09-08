import { simplifyMultiCurrencyDebts, computeRawPairwiseTransactions, SimplifiedTransaction } from './calculations';
import { Expense } from './types';

// Message types
export type WorkerRequest = {
  id: string;
  type: 'simplify' | 'raw' | 'batch';
  members?: string[];
  expenses?: Expense[];
  defaultCurrency?: string;
  groupsData?: {
    type: 'simplify' | 'raw';
    members: string[];
    expenses: Expense[];
    defaultCurrency: string;
    gId: string | number;
  }[];
};

export type WorkerResponse = {
  id: string;
  transactions?: SimplifiedTransaction[];
  batchTransactions?: Record<string, SimplifiedTransaction[]>;
  error?: string;
};

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, type, members, expenses, defaultCurrency, groupsData } = e.data;
  
  try {
    if (type === 'batch' && groupsData) {
      const batchTransactions: Record<string, SimplifiedTransaction[]> = {};
      for (const g of groupsData) {
        if (g.type === 'simplify') {
          batchTransactions[g.gId] = simplifyMultiCurrencyDebts(g.members, g.expenses, g.defaultCurrency);
        } else {
          batchTransactions[g.gId] = computeRawPairwiseTransactions(g.members, g.expenses, g.defaultCurrency);
        }
      }
      self.postMessage({ id, batchTransactions } as WorkerResponse);
      return;
    }

    let result: SimplifiedTransaction[];
    if (type === 'simplify') {
      result = simplifyMultiCurrencyDebts(members!, expenses!, defaultCurrency!);
    } else {
      result = computeRawPairwiseTransactions(members!, expenses!, defaultCurrency!);
    }
    
    self.postMessage({ id, transactions: result } as WorkerResponse);
  } catch (error: any) {
    self.postMessage({ id, transactions: [], error: error.message } as WorkerResponse);
  }
};
