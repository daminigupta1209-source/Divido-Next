import { useCallback } from 'react';
import { Group, Expense } from '../lib/types';

interface UseExportCSVProps {
  groups: Group[];
  expenses: Expense[];
  selectedId: string | number | null;
}

export const useExportCSV = ({ groups, expenses, selectedId }: UseExportCSVProps) => {
  const handleMobileExportCSV = useCallback(() => {
    if (!selectedId || selectedId === 'STANDALONE') return;
    const currentGroup = groups.find((g) => String(g.id) === String(selectedId));
    if (!currentGroup) return;

    const groupExpenses = expenses.filter((e) => String(e.gId) === String(selectedId));
    const baseCurrency = currentGroup.currency || '₹';
    
    // CSV Header
    const headers = ['Date', 'Title', 'Paid By', 'Total Amount', 'Currency'].join(',');
    
    // CSV Rows
    const rows = groupExpenses.map((e) => {
      const escapedTitle = `"${e.title.replace(/"/g, '""')}"`;
      const escapedPaidBy = `"${e.paid.replace(/"/g, '""')}"`;
      return [
        e.date,
        escapedTitle,
        escapedPaidBy,
        e.amt.toFixed(2),
        e.currency || baseCurrency
      ].join(',');
    });
    
    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${currentGroup.name.replace(/\s+/g, '_')}_Expenses_Report.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [groups, expenses, selectedId]);

  return { handleMobileExportCSV };
};
