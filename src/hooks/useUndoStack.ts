import { useState, useRef, useEffect } from 'react';
import { Expense } from '../lib/types';
import { parseExpenseId } from '../lib/utils';

interface UseUndoStackProps {
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
}

export function useUndoStack({ expenses, setExpenses }: UseUndoStackProps) {
  const [undoStack, setUndoStack] = useState<any[]>([]);
  const undoTimerRef = useRef<number | null>(null);

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  const deleteExpense = (id: string | number, silent: boolean = false) => {
    const item = expenses.find((e) => e.id === id);
    if (!item) return;

    setExpenses((prev) => prev.filter((e) => e.id !== id));

    if (!silent) {
      setUndoStack((prev) => [{ item, type: 'expense', timestamp: Date.now() }, ...prev].slice(0, 5));
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = window.setTimeout(() => {
        setUndoStack([]);
      }, 6000);
    }
  };

  const performUndo = () => {
    if (undoStack.length === 0) return;
    const { item } = undoStack[0];
    setExpenses((prev) =>
      [item, ...prev].sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return (b.timestamp || parseExpenseId(b.id)) - (a.timestamp || parseExpenseId(a.id));
      })
    );
    setUndoStack((prev) => prev.slice(1));
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  };

  return {
    undoStack,
    deleteExpense,
    performUndo,
  };
}
