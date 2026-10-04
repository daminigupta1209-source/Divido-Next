import { useCallback } from 'react';
import { shown } from '../lib/identity';
import { Group, Expense } from '../lib/types';

interface UseExportCSVProps {
  groups: Group[];
  expenses: Expense[];
  selectedId: string | number | null;
}

export const useExportCSV = ({ groups, expenses, selectedId }: UseExportCSVProps) => {
  const handleMobileExportCSV = useCallback(() => {
    if (!selectedId) return;
    // Non-Group = plain STANDALONE expenses PLUS shared 2-person "direct"
    // threads (the same set NonGroupView shows).
    const isNonGroup = selectedId === 'STANDALONE';
    const directIds = new Set(groups.filter((g) => g.isDirect).map((g) => String(g.id)));
    const currentGroup = isNonGroup
      ? { name: 'Non Group', currency: '₹' }
      : groups.find((g) => String(g.id) === String(selectedId));
    if (!currentGroup) return;

    const groupExpenses = isNonGroup
      ? expenses.filter((e) => e && !e.isDeleted && !e.isConversion && (String(e.gId) === 'STANDALONE' || directIds.has(String(e.gId))))
      : expenses.filter((e) => String(e.gId) === String(selectedId));
    const baseCurrency = currentGroup.currency || '₹';
    
    // CSV Header
    const headers = ['Date', 'Title', 'Paid By', 'Total Amount', 'Currency'].join(',');
    
    // CSV Rows
    const rows = groupExpenses.map((e) => {
      const escapedTitle = `"${e.title.replace(/"/g, '""')}"`;
      const escapedPaidBy = `"${shown(e.paid).replace(/"/g, '""')}"`;
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
