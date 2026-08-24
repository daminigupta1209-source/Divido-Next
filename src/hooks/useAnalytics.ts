import { useState, useEffect, useMemo } from 'react';
import { Group, Expense } from '../lib/types';
import { getEmoji } from '../lib/utils';
import { escManager } from '../lib/escManager';

export interface UseAnalyticsProps {
  expenses: Expense[];
  groups: Group[];
  me: string;
  userMetadata: Record<string, any>;
  setUserMetadata: (m: Record<string, any>) => void;
  initialGroupId?: string | number | null;
}

export interface AnalyticsDetail {
  title: string;
  items: {
    text: string;
    icon?: string | null;
    val?: string | number;
    sub?: string;
  }[];
}

export const CAT_COLORS: Record<string, string> = {
  'Food & Dining': '#EC4899',
  'Transport': '#3B82F6',
  'Travel': '#06B6D4',
  'Stays & Hotels': '#F59E0B',
  'Housing & Living': '#10B981',
  'Entertainment': '#8B5CF6',
  'Shopping': '#F97316',
  'Bills & Utils': '#64748B',
  'Health': '#EF4444',
  'Education': '#14B8A6',
  'General / Other': '#94A3B8',
};

export const CATEGORY_MAP: Record<string, string> = {
  '🍕': 'Food & Dining',
  '🍔': 'Food & Dining',
  '☕': 'Food & Dining',
  '🚗': 'Transport',
  '🚕': 'Transport',
  '✈️': 'Travel',
  '🏨': 'Stays & Hotels',
  '🏠': 'Housing & Living',
  '🎟️': 'Entertainment',
  '🎮': 'Entertainment',
  '🍿': 'Entertainment',
  '🛍️': 'Shopping',
  '👕': 'Shopping',
  '📝': 'Bills & Utils',
  '⚡': 'Bills & Utils',
  '💊': 'Health',
  '🏥': 'Health',
  '🎓': 'Education',
};

export const getCatName = (emoji: string | null) => (emoji ? CATEGORY_MAP[emoji] || 'General / Other' : 'General / Other');

export function useAnalytics({
  expenses,
  groups,
  me,
  userMetadata,
  setUserMetadata,
  initialGroupId,
}: UseAnalyticsProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | number>('ALL');
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);

  useEffect(() => {
    if (initialGroupId !== undefined && initialGroupId !== null) {
      setSelectedGroupId(initialGroupId);
    }
  }, [initialGroupId]);

  const [timeframe, setTimeframe] = useState<'month' | '30days' | 'overall'>('month');

  const filteredExpenses = useMemo(() => {
    const base = selectedGroupId === 'ALL' ? expenses : expenses.filter((e) => String(e.gId) === String(selectedGroupId));
    const now = new Date();
    return base.filter((e) => {
      // Exclude non-spending entries so "Total Spent"/categories aren't inflated:
      // settlements (🤝), write-offs (🧾) and SYSTEM notes are money movements or
      // records, not spending.
      const t = e.title || '';
      if (
        e.paid === 'SYSTEM' ||
        e.category === '🤝' ||
        t.includes('🤝 Settlement') ||
        t === 'Written off' || e.notes === 'Written off'
      ) {
        return false;
      }
      const expDate = new Date(e.date);
      if (timeframe === 'month') {
        const currentMonthKey = now.toISOString().slice(0, 7);
        return e.date.startsWith(currentMonthKey);
      } else if (timeframe === '30days') {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        thirtyDaysAgo.setHours(0, 0, 0, 0);
        return expDate >= thirtyDaysAgo;
      }
      return true;
    });
  }, [expenses, selectedGroupId, timeframe]);

  const [analyticsDetail, setAnalyticsDetail] = useState<AnalyticsDetail | null>(null);
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const [showTrends, setShowTrends] = useState(false);
  const [showCategories, setShowCategories] = useState(false);

  useEffect(() => {
    if (analyticsDetail) {
      const unregister = escManager.register(() => {
        setAnalyticsDetail(null);
      });
      return unregister;
    }
  }, [analyticsDetail]);

  const groupedData = useMemo(() => {
    return filteredExpenses.reduce<Record<string, { name: string; emoji: string | null; amount: number; items: Expense[] }>>(
      (acc, e) => {
        const emoji = getEmoji(e.title);
        const name = getCatName(emoji);
        if (!acc[name]) acc[name] = { name, emoji, amount: 0, items: [] };
        acc[name].amount += (Number(e.amt) || 0);
        acc[name].items.push(e);
        return acc;
      },
      {}
    );
  }, [filteredExpenses]);

  const categoryList = useMemo(() => {
    return Object.values(groupedData).sort((a, b) => b.amount - a.amount);
  }, [groupedData]);

  const monthlySpendingByCategory = useMemo(() => {
    const currentMonthKey = new Date().toISOString().slice(0, 7);
    const thisMonthExpenses = filteredExpenses.filter((e) => e.date.startsWith(currentMonthKey));
    return thisMonthExpenses.reduce<Record<string, number>>((acc, e) => {
      const emoji = e.category || getEmoji(e.title) || '⚡';
      acc[emoji] = (acc[emoji] || 0) + ((Number(e.amt) || 0));
      return acc;
    }, {});
  }, [filteredExpenses]);

  const totalSpentVal = useMemo(() => {
    return filteredExpenses.reduce((acc, e) => acc + ((Number(e.amt) || 0)), 0);
  }, [filteredExpenses]);

  const avgExpense = useMemo(() => {
    return totalSpentVal / (filteredExpenses.length || 1);
  }, [totalSpentVal, filteredExpenses]);

  const monthlyProjected = useMemo(() => {
    return totalSpentVal * 1.2;
  }, [totalSpentVal]);

  const mostActiveGroup = useMemo(() => {
    const activeGroups = [
      { id: 'STANDALONE', name: 'Non-Group Expenses' },
      ...groups.filter(
        (g) =>
          g.name.trim() !== '' ||
          expenses.some((e) => String(e.gId) === String(g.id)) ||
          g.members.length > 1
      ),
    ];
    return activeGroups.reduce((prev, current) => {
      const prevCount = expenses.filter((e) => String(e.gId) === String(prev.id)).length;
      const currCount = expenses.filter((e) => String(e.gId) === String(current.id)).length;
      return currCount > prevCount ? current : prev;
    }, { id: 'STANDALONE', name: 'Non-Group Expenses' });
  }, [groups, expenses]);

  // Donut slices calculations
  const donutSlices = useMemo(() => {
    let accumulatedPercent = 0;
    return categoryList.map((cat) => {
      const pct = (cat.amount / (totalSpentVal || 1)) * 100;
      const offset = accumulatedPercent;
      accumulatedPercent += pct;
      const color = CAT_COLORS[cat.name] || '#94A3B8';
      return {
        name: cat.name,
        amount: cat.amount,
        pct,
        offset,
        color,
        emoji: cat.emoji || '⚡'
      };
    });
  }, [categoryList, totalSpentVal]);

  // Trend tooltips
  const [showTrendTooltip, setShowTrendTooltip] = useState(false);
  useEffect(() => {
    if (showTrendTooltip) {
      const timer = setTimeout(() => setShowTrendTooltip(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showTrendTooltip]);

  const lastExpenses = useMemo(() => filteredExpenses.slice(-10), [filteredExpenses]);
  const maxAmt = useMemo(() => Math.max(...lastExpenses.map(e => e.amt), 1), [lastExpenses]);

  const dynamicInsight = useMemo(() => {
    if (totalSpentVal === 0) return "Track your expenses to see insights here.";

    const meaningfulCategories = categoryList.filter(c => c.name !== 'General / Other');
    
    if (meaningfulCategories.length > 0) {
      const topCat = meaningfulCategories[0];
      const pct = ((topCat.amount / totalSpentVal) * 100).toFixed(0);
      if (Number(pct) > 10) {
         return `${topCat.name} makes up ${pct}% of your spending.`;
      }
    }

    if (filteredExpenses.length > 0) {
       const largestExpense = [...filteredExpenses].sort((a, b) => (Number(b.amt) || 0) - (Number(a.amt) || 0))[0];
       if (largestExpense && largestExpense.amt > (avgExpense * 1.5)) {
          return `Your largest expense is ${largestExpense.title} at ₹${largestExpense.amt}.`;
       }
    }

    if (mostActiveGroup && mostActiveGroup.name !== 'Non-Group Expenses' && mostActiveGroup.name !== 'Untitled Group') {
       return `You are most active in ${mostActiveGroup.name}.`;
    }

    return `Your typical cost per bill is ₹${avgExpense.toFixed(0)}.`;
  }, [categoryList, totalSpentVal, avgExpense, filteredExpenses, mostActiveGroup]);

  return {
    selectedGroupId,
    setSelectedGroupId,
    showGroupDropdown,
    setShowGroupDropdown,
    filteredExpenses,
    analyticsDetail,
    setAnalyticsDetail,
    hoveredCategory,
    setHoveredCategory,
    hoveredBar,
    setHoveredBar,
    showTrends,
    setShowTrends,
    showCategories,
    setShowCategories,
    groupedData,
    categoryList,
    monthlySpendingByCategory,
    totalSpentVal,
    avgExpense,
    monthlyProjected,
    mostActiveGroup,
    donutSlices,
    showTrendTooltip,
    setShowTrendTooltip,
    lastExpenses,
    maxAmt,
    timeframe,
    setTimeframe,
    dynamicInsight,
  };
}
