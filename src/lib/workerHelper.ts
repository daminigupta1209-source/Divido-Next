import CalculationWorker from './calculations.worker?worker';
import { Expense } from './types';
import { SimplifiedTransaction } from './calculations';
import type { WorkerRequest, WorkerResponse } from './calculations.worker';

// Singleton worker instance to avoid creating too many workers
let workerInstance: Worker | null = null;
let messageIdCounter = 0;

// Map to store pending promises
const pendingRequests = new Map<string, { resolve: (val: any) => void; reject: (err: any) => void }>();

const getWorker = () => {
  if (!workerInstance) {
    workerInstance = new CalculationWorker();
    workerInstance.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const { id, transactions, batchTransactions, batchBalances, error } = e.data;
      const handlers = pendingRequests.get(id);
      if (handlers) {
        if (error) {
          handlers.reject(new Error(error));
        } else {
          handlers.resolve(batchBalances || batchTransactions || transactions);
        }
        pendingRequests.delete(id);
      }
    };
  }
  return workerInstance;
};

const dispatchToWorker = (
  type: 'simplify' | 'raw',
  members: string[],
  expenses: Expense[],
  defaultCurrency: string = '₹'
): Promise<SimplifiedTransaction[]> => {
  return new Promise((resolve, reject) => {
    const id = `req_${++messageIdCounter}_${Date.now()}`;
    pendingRequests.set(id, { resolve, reject });
    
    getWorker().postMessage({
      id,
      type,
      members,
      expenses,
      defaultCurrency
    } as WorkerRequest);
  });
};

export const asyncSimplifyMultiCurrencyDebts = (
  members: string[],
  expenses: Expense[],
  defaultCurrency: string = '₹'
): Promise<SimplifiedTransaction[]> => {
  return dispatchToWorker('simplify', members, expenses, defaultCurrency);
};

export const asyncComputeRawPairwiseTransactions = (
  members: string[],
  expenses: Expense[],
  defaultCurrency: string = '₹'
): Promise<SimplifiedTransaction[]> => {
  return dispatchToWorker('raw', members, expenses, defaultCurrency);
};

export const asyncBatchComputeGroups = (
  groupsData: WorkerRequest['groupsData']
): Promise<Record<string, SimplifiedTransaction[]>> => {
  return new Promise((resolve, reject) => {
    const id = `req_${++messageIdCounter}_${Date.now()}`;
    pendingRequests.set(id, { resolve, reject });
    
    getWorker().postMessage({
      id,
      type: 'batch',
      groupsData
    } as WorkerRequest);
  });
};

export const asyncBatchNetBalances = (
  batchBalancesData: WorkerRequest['batchBalancesData']
): Promise<Record<string, Record<string, Record<string, number>>>> => {
  return new Promise((resolve, reject) => {
    const id = `req_${++messageIdCounter}_${Date.now()}`;
    pendingRequests.set(id, { resolve, reject });
    
    getWorker().postMessage({
      id,
      type: 'batchNetBalances',
      batchBalancesData
    } as WorkerRequest);
  });
};
