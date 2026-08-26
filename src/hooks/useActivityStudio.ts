import { useState, useEffect, useMemo } from 'react';
import { Group, Expense } from '../lib/types';
import { getEmoji, parseExpenseId } from '../lib/utils';

export interface UseActivityStudioProps {
  expenses: Expense[];
  groups: Group[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  setEditingExpense: (exp: Expense | null) => void;
  setShowExpModal: (show: boolean) => void;
  setEditingSettle: (exp: Expense | null) => void;
  setShowSettleModal: (show: boolean) => void;
  me: string;
  setShowConvertModalId: (id: string | number | null) => void;
  setGroups: (groups: Group[]) => void;
  deleteExpense: (id: string | number) => void;
  setSelectedId: (id: string | number | null) => void;
  setView: (view: string) => void;
}

export function useActivityStudio({
  expenses,
  groups,
  setExpenses,
  setEditingExpense,
  setShowExpModal,
  setEditingSettle,
  setShowSettleModal,
  me,
  setShowConvertModalId,
  setGroups,
  deleteExpense,
  setSelectedId,
  setView,
}: UseActivityStudioProps) {
  const [openDropdownId, setOpenDropdownId] = useState<string | number | null>(null);
  const [filterType, setFilterType] = useState('all'); // 'all', 'expenses', 'settlements'
  const [dateFilter, setDateFilter] = useState('all'); // 'all', 'today', 'week', 'month', 'custom'
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [openExpId, setOpenExpId] = useState<string | number | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const allUniqueTags = useMemo(() => Array.from(new Set(expenses.flatMap((e) => e.tags || []))), [expenses]);

  useEffect(() => {
    const closeDrop = () => setOpenDropdownId(null);
    window.addEventListener('click', closeDrop);
    return () => window.removeEventListener('click', closeDrop);
  }, []);

  useEffect(() => {
    const closeDrop = () => setOpenExpId(null);
    window.addEventListener('click', closeDrop);
    return () => window.removeEventListener('click', closeDrop);
  }, []);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((e) => {
      if (e.paid === 'SYSTEM') return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const titleMatch = e.title?.toLowerCase().includes(q);
        const paidMatch = e.paid?.toLowerCase().includes(q);
        const tagMatch = e.tags?.some((t) => t.toLowerCase().includes(q));
        if (!titleMatch && !paidMatch && !tagMatch) return false;
      }
      const isSettlement =
        e.title?.includes('✅ Settlement') || e.category === '✅' || e.title?.toLowerCase().includes('settlement');
      const isConversion = !!e.isConversion;
      if (filterType === 'expenses') {
        if (isSettlement || isConversion) return false;
      }
      if (filterType === 'settlements') {
        if (!isSettlement) return false;
      }

      if (dateFilter !== 'all') {
        const expDate = new Date(e.date);
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        if (dateFilter === 'today') {
          const todayStr = now.toISOString().split('T')[0];
          if (e.date !== todayStr) return false;
        } else if (dateFilter === 'week') {
          const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (expDate < oneWeekAgo) return false;
        } else if (dateFilter === 'month') {
          const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          if (expDate < oneMonthAgo) return false;
        } else if (dateFilter === 'custom') {
          if (customStartDate) {
            const start = new Date(customStartDate);
            start.setHours(0, 0, 0, 0);
            if (expDate < start) return false;
          }
          if (customEndDate) {
            const end = new Date(customEndDate);
            end.setHours(23, 59, 59, 999);
            if (expDate > end) return false;
          }
        }
      }
      if (selectedTag !== 'all') {
        if (!e.tags || !e.tags.includes(selectedTag)) return false;
      }

      return true;
    });
  }, [expenses, filterType, dateFilter, customStartDate, customEndDate, selectedTag, searchQuery]);

  const sorted = useMemo(() => {
    return [...filteredExpenses].sort((a, b) => {
      const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
      if (dateDiff !== 0) return dateDiff;
      return (b.timestamp || parseExpenseId(b.id)) - (a.timestamp || parseExpenseId(a.id));
    });
  }, [filteredExpenses]);

  const handleExportCSV = () => {
    const headers = ['Date', 'Title', 'Category', 'Paid By', 'Split Mode', 'Split Members', 'Total Amount', 'Currency'].join(',');
    const rows = sorted.map((e) => {
      const isSettlement = e.title?.includes('✅ Settlement') || e.category === '✅' || e.title?.toLowerCase().includes('settlement');
      const category = e.category || getEmoji(e.title) || (isSettlement ? '✅' : '📄');
      
      const escapedTitle = `"${e.title.replace(/"/g, '""')}"`;
      const escapedCategory = `"${category.replace(/"/g, '""')}"`;
      const escapedPaidBy = `"${e.paid.replace(/"/g, '""')}"`;
      const escapedSplitMode = `"${(e.mode || 'Equally').replace(/"/g, '""')}"`;
      
      const splitters = e.splitters || [];
      const escapedSplitters = `"${splitters.join(', ').replace(/"/g, '""')}"`;
      
      return [
        e.date,
        escapedTitle,
        escapedCategory,
        escapedPaidBy,
        escapedSplitMode,
        escapedSplitters,
        e.amt.toFixed(2),
        e.currency || '₹'
      ].join(',');
    });
    
    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Divido_Global_Activities_Report.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Popup blocker prevented opening the print report! 🛑 Please allow popups for this site.');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Divido Global Activities Statement</title>
          <style>
            body { font-family: 'Nunito', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; color: #1E293B; background-color: #FFFFFF; }
            h1 { font-size: 26px; font-weight: 900; margin: 0 0 4px 0; color: #4F46E5; }
            .header-container { display: flex; justify-content: space-between; border-bottom: 2px solid #E2E8F0; padding-bottom: 20px; margin-bottom: 30px; }
            .meta-info { font-size: 13px; font-weight: 750; color: #64748B; line-height: 1.6; }
            .meta-info strong { color: #1E293B; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
            th { background-color: #F8FAFC; border-bottom: 2px solid #E2E8F0; color: #475569; font-weight: 800; text-align: left; padding: 12px; }
            td { border-bottom: 1px solid #F1F5F9; padding: 12px; color: #334155; font-weight: 700; }
            tr:hover { background-color: #F8FAFC; }
            .amt { font-family: monospace; font-weight: bold; text-align: right; }
            .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; }
            .badge-settle { background-color: #ECFDF5; color: #059669; }
            .badge-expense { background-color: #EEF2FF; color: #4F46E5; }
            @media print {
              body { padding: 0; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header-container">
            <div>
              <h1>Divido Statement</h1>
              <div class="meta-info">Global Activities Ledger • Generated on <strong>${new Date().toLocaleDateString()}</strong></div>
            </div>
            <div style="text-align: right;" class="meta-info">
              User: <strong>${me}</strong><br>
              Total Records: <strong>${sorted.length}</strong>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
                <th>Paid By</th>
                <th>Split Mode</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${sorted.map((e) => {
                const isSettlement = e.title?.includes('✅ Settlement') || e.category === '✅' || e.title?.toLowerCase().includes('settlement');
                return `
                  <tr>
                    <td>${e.date}</td>
                    <td>
                      <span class="badge ${isSettlement ? 'badge-settle' : 'badge-expense'}">
                        ${isSettlement ? 'Settlement ✅' : 'Expense 💸'}
                      </span>
                    </td>
                    <td>${e.title}</td>
                    <td>${e.paid}</td>
                    <td>${e.mode || 'Equally'}</td>
                    <td class="amt">${e.currency || '₹'}${e.amt.toFixed(2)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleEdit = (exp: Expense) => {
    setEditingExpense(exp);
    setShowExpModal(true);
  };

  return {
    openDropdownId,
    setOpenDropdownId,
    filterType,
    setFilterType,
    dateFilter,
    setDateFilter,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    openExpId,
    setOpenExpId,
    showInfo,
    setShowInfo,
    selectedTag,
    setSelectedTag,
    allUniqueTags,
    filteredExpenses,
    sorted,
    showExportMenu,
    setShowExportMenu,
    handleExportCSV,
    handleExportPDF,
    handleEdit,
    searchQuery,
    setSearchQuery,
  };
}
