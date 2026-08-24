import React, { useState, useEffect } from 'react';
import { Group, Expense } from '../lib/types';
import { useAnalytics, CAT_COLORS } from '../hooks/useAnalytics';
import { getEmoji } from '../lib/utils';

interface AnalyticsProps {
  expenses: Expense[];
  groups: Group[];
  me: string;
  userMetadata: Record<string, any>;
  setUserMetadata: (m: Record<string, any>) => void;
  initialGroupId?: string | number | null;
  onBack?: () => void;
}

interface AnalyticsDetail {
  title: string;
  items: {
    text: string;
    icon?: string | null;
    val?: string | number;
    sub?: string;
  }[];
}

interface MiniMetricProps {
  label: string;
  value: string;
  icon?: string;
  color: string;
  sub: string;
  onClick: () => void;
}

const MiniMetric: React.FC<MiniMetricProps> = ({ label, value, icon, color, sub, onClick }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    if (showTooltip) {
      const timer = setTimeout(() => setShowTooltip(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showTooltip]);

  return (
    <div
      className="card hover-up"
      onClick={() => {
        if (showTooltip) {
          setShowTooltip(false);
        } else {
          onClick();
        }
      }}
      style={{
        padding: '16px 12px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        background: 'rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(10px)',
        border: 'none',
        boxShadow: '0 4px 24px rgba(0,0,0,0.04)',
        borderRadius: '16px',
        cursor: 'pointer',
        textAlign: 'center',
        minHeight: '90px',
        position: 'relative',
      }}
    >
      <div 
        style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span
          style={{
            fontSize: '9px',
            fontWeight: 900,
            color: 'var(--g)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          {label}
        </span>
      </div>
      <h4 className="nunito" style={{ fontSize: '14px', fontWeight: 900, color: 'var(--t)', margin: 0, wordBreak: 'break-word', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', maxWidth: '100%' }}>
        {value}
      </h4>

      {showTooltip && (
        <div
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            bottom: '80%',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1E293B',
            color: '#FFFFFF',
            padding: '6px 10px',
            borderRadius: '8px',
            fontSize: '10px',
            fontWeight: 800,
            width: '130px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            lineHeight: 1.3,
            textAlign: 'center',
            animation: 'fadeSlideIn 0.2s ease-out',
          }}
        >
          {sub}
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              marginLeft: '-5px',
              borderWidth: '5px',
              borderStyle: 'solid',
              borderColor: '#1E293B transparent transparent transparent',
            }}
          />
        </div>
      )}
    </div>
  );
};

const InsightCarousel = ({ insights }: { insights: string[] }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (insights.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % insights.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [insights.length]);

  const handleNext = () => setCurrentIndex((prev) => (prev + 1) % insights.length);
  const handlePrev = () => setCurrentIndex((prev) => (prev - 1 + insights.length) % insights.length);

  return (
    <div 
      style={{
        background: 'linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)',
        borderRadius: '20px',
        padding: '16px 16px',
        marginBottom: '20px',
        boxShadow: '0 4px 16px rgba(14, 165, 233, 0.1)',
        textAlign: 'center',
        animation: 'fadeSlideIn 0.3s ease-out',
        position: 'relative'
      }}
    >
      <span style={{ fontSize: '10px', fontWeight: 800, color: '#0284C7', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '8px' }}>
        Insights
      </span>
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        {insights.length > 1 ? (
          <button onClick={handlePrev} style={{ background: 'none', border: 'none', color: '#0284C7', cursor: 'pointer', padding: '4px', fontSize: '14px', flexShrink: 0 }}>❮</button>
        ) : <div style={{ width: '20px' }} />}
        
        <div style={{ flex: 1, minHeight: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
           <h2 className="nunito" style={{ fontSize: '16px', fontWeight: 600, color: '#0F172A', margin: 0, lineHeight: 1.4, animation: 'fadeIn 0.4s ease-out' }} key={currentIndex}>
             {insights[currentIndex]}
           </h2>
        </div>

        {insights.length > 1 ? (
          <button onClick={handleNext} style={{ background: 'none', border: 'none', color: '#0284C7', cursor: 'pointer', padding: '4px', fontSize: '14px', flexShrink: 0 }}>❯</button>
        ) : <div style={{ width: '20px' }} />}
      </div>

      {insights.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '10px' }}>
          {insights.map((_, idx) => (
            <div 
              key={idx} 
              onClick={() => setCurrentIndex(idx)}
              style={{ 
                width: '6px', height: '6px', borderRadius: '50%', 
                background: currentIndex === idx ? '#6366F1' : '#E2E8F0',
                cursor: 'pointer',
                transition: '0.3s all'
              }} 
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const Analytics: React.FC<AnalyticsProps> = ({ expenses, groups, me, userMetadata, setUserMetadata, initialGroupId, onBack }) => {
  const {
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
    dynamicInsights,
  } = useAnalytics({
    expenses,
    groups,
    me,
    userMetadata,
    setUserMetadata,
    initialGroupId,
  });

  const SpendingTrend = () => {
    return (
      <div
        className="card shadow-sm"
        style={{
          padding: '18px',
          marginBottom: '32px',
          background: 'var(--w)',
          border: '1.5px solid rgba(0,0,0,0.02)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: showTrends ? '24px' : '0px',
          }}
        >
          <div>
            <h3 className="nunito" style={{ fontSize: '13px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '6px', margin: 0, color: 'var(--t)', position: 'relative', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Recent Spending
            </h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {showTrends && hoveredBar !== null && lastExpenses[hoveredBar] && (
              <div
                className="pill purple"
                style={{
                  fontSize: '9.5px',
                  padding: '4px 8px',
                  animation: 'fadeIn 0.2s ease-out',
                  fontWeight: 900
                }}
              >
                {lastExpenses[hoveredBar].title}: <strong>₹{lastExpenses[hoveredBar].amt}</strong>
              </div>
            )}
            <div
              onClick={() => setShowTrends(!showTrends)}
              style={{
                width: '38px',
                height: '20px',
                borderRadius: '10px',
                background: showTrends ? '#10B981' : '#CBD5E1',
                position: 'relative',
                cursor: 'pointer',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background: '#FFFFFF',
                  position: 'absolute',
                  top: '2px',
                  left: showTrends ? '20px' : '2px',
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}
              />
            </div>
          </div>
        </div>

        {showTrends && (
          <div 
            style={{ 
              height: '160px', 
              width: '100%', 
              display: 'flex', 
              alignItems: 'flex-end', 
              gap: '10px', 
              padding: '20px 10px 10px 10px', 
              background: '#F8FAFC', 
              borderRadius: '16px', 
              boxSizing: 'border-box',
              animation: 'fadeSlideIn 0.3s ease-out'
            }}
          >
            {lastExpenses.length === 0 ? (
              <div style={{ width: '100%', textAlign: 'center', color: 'var(--g)', fontSize: '12px', fontWeight: 800 }}>
                No expenses recorded yet.
              </div>
            ) : (
              lastExpenses.map((e, i) => {
                const heightPct = (e.amt / maxAmt) * 100;
                const isHovered = hoveredBar === i;
                return (
                  <div
                    key={e.id}
                    style={{
                      flex: 1,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                      position: 'relative',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={() => setHoveredBar(i)}
                    onMouseLeave={() => setHoveredBar(null)}
                  >
                    <div
                      style={{
                        width: '100%',
                        height: `${heightPct}%`,
                        background: isHovered ? 'linear-gradient(180deg, #6366F1 0%, #8B5CF6 100%)' : 'linear-gradient(180deg, #818CF8 0%, #A78BFA 100%)',
                        borderRadius: '12px 12px 4px 4px',
                        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                        boxShadow: isHovered ? '0 8px 16px rgba(139, 92, 246, 0.3)' : '0 4px 12px rgba(139, 92, 246, 0.1)',
                      }}
                    />
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: 900,
                        color: isHovered ? '#4F46E5' : 'var(--g)',
                        marginTop: '6px',
                        textTransform: 'uppercase',
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {e.title.slice(0, 5)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="content-width-limit" style={{ paddingBottom: '80px' }}>
      {analyticsDetail && (
        <div
          className="modal-overlay"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setAnalyticsDetail(null)}
        >
          <div
            className="card shadow-xl"
            style={{ width: '90%', maxWidth: '380px', padding: '20px', position: 'relative', animation: 'slideUp 0.3s ease-out' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
              }}
            >
              <h3 className="nunito" style={{ fontSize: '16px', fontWeight: 900, margin: 0 }}>
                {analyticsDetail.title}
              </h3>
              <button
                onClick={() => setAnalyticsDetail(null)}
                style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', opacity: 0.5 }}
              >
                ×
              </button>
            </div>
            <div style={{ maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {analyticsDetail.items.map((item, i) => (
                <div
                  key={i}
                  style={{
                    padding: '10px 12px',
                    background: 'var(--bg)',
                    borderRadius: '12px',
                    border: '1.5px solid #F1F5F9',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>{item.icon}</span>
                    <div>
                      <span style={{ fontWeight: 800, fontSize: '13px', display: 'block' }}>{item.text}</span>
                      {item.sub && <span style={{ fontSize: '9px', color: 'var(--g)', fontWeight: 700 }}>{item.sub}</span>}
                    </div>
                  </div>
                  {item.val && <span style={{ fontWeight: 900, fontSize: '13px', color: '#1F2937' }}>{item.val}</span>}
                </div>
              ))}
              {analyticsDetail.items.length === 0 && (
                <p style={{ textAlign: 'center', color: 'var(--g)', padding: '20px' }}>No records found</p>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Clean minimal header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '20px',
        padding: '4px 0',
      }}>


        {/* Timeframe Selector tabs */}
        <div style={{
          display: 'flex',
          background: '#F1F5F9',
          borderRadius: '24px',
          padding: '4px',
          width: '100%',
          maxWidth: '340px',
          boxSizing: 'border-box',
        }}>
          {([
            { id: 'month', label: 'This Month' },
            { id: '30days', label: 'Last 30 Days' },
            { id: 'overall', label: 'Overall' }
          ] as const).map((tab) => {
            const isActive = timeframe === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setTimeframe(tab.id)}
                style={{
                  flex: 1,
                  border: 'none',
                  background: isActive ? 'var(--w)' : 'transparent',
                  color: isActive ? 'var(--purple-text)' : '#64748B',
                  fontWeight: 900,
                  fontSize: '11px',
                  padding: '8px 12px',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  transition: '0.2s all cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
                  outline: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <InsightCarousel insights={dynamicInsights} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', marginBottom: '32px' }}>
        <MiniMetric
          label="Total Spent"
          value={`₹${totalSpentVal.toLocaleString()}`}
          color="#10B981"
          sub="Sum of all bills added"
          onClick={() =>
            setAnalyticsDetail({
              title: 'Total Spent Log',
              items: filteredExpenses.map((e) => ({
                text: e.title,
                val: `₹${e.amt}`,
                sub: groups.find((g) => g.id === e.gId)?.name || 'Non-Group',
              })),
            })
          }
        />
        <MiniMetric
          label="Expected"
          value={`₹${monthlyProjected.toLocaleString()}`}
          color="#EF4444"
          sub="Estimated month-end spending"
          onClick={() =>
            setAnalyticsDetail({
              title: 'Expected End',
              items: [
                { text: 'Current Rate', val: `₹${totalSpentVal.toLocaleString()}` },
                { text: 'Projected End', val: `₹${monthlyProjected.toLocaleString()}` },
                { text: 'Logic', val: 'Based on your weekly speed' },
              ],
            })
          }
        />
        <MiniMetric
          label="Avg. Expense"
          value={`₹${avgExpense.toFixed(0)}`}
          color="#6366F1"
          sub="Average cost per bill"
          onClick={() =>
            setAnalyticsDetail({
              title: 'Bill Stats',
              items: [
                { text: 'Total Count', val: filteredExpenses.length },
                { text: 'Typical Bill', val: `₹${avgExpense.toFixed(0)}` },
              ],
            })
          }
        />
        <MiniMetric
          label="Top Category"
          value={categoryList.length > 0 ? categoryList[0].name : 'N/A'}
          color="#F59E0B"
          sub="Highest spending category"
          onClick={() => {
            if (categoryList.length === 0) return;
            const topCat = categoryList[0];
            setAnalyticsDetail({
              title: `Top Category: ${topCat.name}`,
              items: topCat.items.map((e) => ({ text: e.title, val: `₹${e.amt}` })),
            });
          }}
        />
      </div>

      <SpendingTrend />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '48px', alignItems: 'start' }}>
        <div className="card shadow-sm" style={{ padding: '18px', border: '1.5px solid rgba(0,0,0,0.02)' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: showCategories ? '24px' : '0px',
            }}
          >
            <h3 className="nunito" style={{ fontSize: '13px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '6px', margin: 0, color: 'var(--t)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Spending by Category
            </h3>
            <div
              onClick={() => setShowCategories(!showCategories)}
              style={{
                width: '38px',
                height: '20px',
                borderRadius: '10px',
                background: showCategories ? '#10B981' : '#CBD5E1',
                position: 'relative',
                cursor: 'pointer',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background: '#FFFFFF',
                  position: 'absolute',
                  top: '2px',
                  left: showCategories ? '20px' : '2px',
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }}
              />
            </div>
          </div>

          {showCategories && (
            <div style={{ animation: 'fadeSlideIn 0.3s ease-out' }}>
              {categoryList.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '24px', position: 'relative' }}>
                  <svg width="180" height="180" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="60" cy="60" r="50" fill="transparent" stroke="#F1F5F9" strokeWidth="12" />
                    {donutSlices.map((slice) => {
                      const strokeLength = (slice.pct / 100) * 314.16;
                      const strokeOffset = -(slice.offset / 100) * 314.16;
                      const isHovered = hoveredCategory === slice.name;
                      return (
                        <circle
                          key={slice.name}
                          cx="60"
                          cy="60"
                          r="50"
                          fill="transparent"
                          stroke={slice.color}
                          strokeWidth={isHovered ? 16 : 12}
                          strokeDasharray={`${strokeLength} 314.16`}
                          strokeDashoffset={strokeOffset}
                          strokeLinecap="round"
                          style={{
                            cursor: 'pointer',
                            transition: 'stroke-width 0.2s ease',
                          }}
                          onMouseEnter={() => setHoveredCategory(slice.name)}
                          onMouseLeave={() => setHoveredCategory(null)}
                        />
                      );
                    })}
                  </svg>
                  <div
                    style={{
                      position: 'absolute',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center',
                      pointerEvents: 'none',
                    }}
                  >
                    {hoveredCategory ? (
                      <>
                        <span style={{ fontSize: '9px', fontWeight: 900, color: 'var(--g)', textTransform: 'uppercase' }}>
                          {hoveredCategory}
                        </span>
                        <span style={{ fontSize: '14px', fontWeight: 950, color: '#1F2937', marginTop: '2px' }}>
                          ₹{donutSlices.find(s => s.name === hoveredCategory)?.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                        <span style={{ fontSize: '9px', fontWeight: 900, color: CAT_COLORS[hoveredCategory] }}>
                          {donutSlices.find(s => s.name === hoveredCategory)?.pct.toFixed(0)}%
                        </span>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: '8px', fontWeight: 900, color: 'var(--g)' }}>TOTAL SPENT</span>
                        <span style={{ fontSize: '15px', fontWeight: 950, color: '#1F2937', marginTop: '2px' }}>
                          ₹{totalSpentVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}
              {categoryList.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--g)', padding: '40px' }}>No data harvested yet</p>
              ) : (
                categoryList.map((cat) => {
                  const pct = (cat.amount / (totalSpentVal || 1)) * 100 || 0;
                  return (
                    <div
                      key={cat.name}
                      className="hover-up"
                      onClick={() =>
                        setAnalyticsDetail({
                          title: `${cat.name} Expenses`,
                          items: cat.items.map((e) => ({
                            text: e.title,
                            icon: getEmoji(e.title),
                            val: `₹${e.amt}`,
                            sub: groups.find((g) => g.id === e.gId)?.name,
                          })),
                        })
                      }
                      style={{
                        marginBottom: '24px',
                        cursor: 'pointer',
                        padding: '8px',
                        borderRadius: '12px',
                        background: hoveredCategory === cat.name ? '#F8FAFC' : 'transparent',
                        border: hoveredCategory === cat.name ? '1px dashed #CBD5E1' : '1px solid transparent',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={() => setHoveredCategory(cat.name)}
                      onMouseLeave={() => setHoveredCategory(null)}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontWeight: 900,
                          fontSize: '14px',
                          marginBottom: '12px',
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: CAT_COLORS[cat.name] || '#94A3B8' }} />
                          <span style={{ color: '#475569' }}>{cat.name}</span>
                        </span>
                        <span style={{ color: '#1F2937' }}>₹{cat.amount.toLocaleString()}</span>
                      </div>
                      <div
                        style={{
                          width: '100%',
                          height: '10px',
                          background: 'var(--bg)',
                          borderRadius: '20px',
                          overflow: 'hidden',
                          position: 'relative',
                        }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            height: '100%',
                            background: CAT_COLORS[cat.name] || '#94A3B8',
                            borderRadius: '20px',
                            transition: '1s width cubic-bezier(0.4, 0, 0.2, 1)',
                          }}
                        ></div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                        <span
                          className="pill"
                          style={{
                            fontSize: '10px',
                            padding: '4px 10px',
                            background: 'var(--w)',
                            border: '1px solid #E2E8F0',
                            color: '#64748B',
                          }}
                        >
                          {pct.toFixed(0)}% of total
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <div className="card shadow-sm" style={{ padding: '32px', border: '1.5px solid rgba(0,0,0,0.02)' }}>
          <h3 className="nunito" style={{ fontSize: '14px', fontWeight: 900, marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Group Health List
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {groups
              .filter(
                (g) =>
                  g.name.trim() !== '' ||
                  expenses.some((e) => String(e.gId) === String(g.id)) ||
                  g.members.length > 1
              )
              .map((g) => {
                const gExps = expenses.filter((e) => String(e.gId) === String(g.id));
                const count = gExps.length;
                const gTotal = gExps.reduce((acc, e) => acc + ((Number(e.amt) || 0)), 0);
                return (
                  <div
                    key={g.id}
                    className="hover-up"
                    onClick={() =>
                      setAnalyticsDetail({
                        title: `${g.name} Health Stats`,
                        items: [
                          { text: 'Total Spent', icon: '💸', val: `₹${gTotal.toLocaleString()}` },
                          { text: 'Event Count', icon: '📈', val: count },
                          { text: 'Member Count', icon: '👤', val: g.members.length },
                        ],
                      })
                    }
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '24px',
                      background: 'var(--bg)',
                      borderRadius: '24px',
                      border: '1.5px solid #F1F5F9',
                      transition: '0.3s all',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                      <div
                        style={{
                          fontSize: '32px',
                          width: '64px',
                          height: '64px',
                          background: 'var(--w)',
                          borderRadius: '18px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                        }}
                      >
                        <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--g)' }}>
                          {g.name ? g.name.charAt(0).toUpperCase() : 'G'}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontWeight: 900, fontSize: '18px', color: '#1F2937', display: 'block' }}>
                          {g.name || 'Untitled Group'}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--g)', fontWeight: 800 }}>
                          {g.members.length} Members active
                        </span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="pill blue" style={{ padding: '8px 20px', fontSize: '12px', fontWeight: 900 }}>
                        {count} Events
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        <div className="card shadow-sm" style={{ padding: '24px', background: 'var(--w)' }}>
          <h3 className="nunito" style={{ fontSize: '14px', fontWeight: 900, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Monthly Spending Budgets
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[
              { emoji: '🍕', label: 'Food & Dining' },
              { emoji: '🚕', label: 'Travel & Transport' },
              { emoji: '🏠', label: 'Rent & Utilities' },
              { emoji: '🛒', label: 'Groceries' },
              { emoji: '🍻', label: 'Drinks & Nightlife' },
              { emoji: '🛍️', label: 'Shopping' },
              { emoji: '⚡', label: 'Others' }
            ].map(({ emoji, label }) => {
              const currentBudget = userMetadata[me]?.budgets?.[emoji] || '';
              const budgetAmt = parseFloat(String(currentBudget)) || 0;
              const spentAmt = monthlySpendingByCategory[emoji] || 0;
              const percent = budgetAmt > 0 ? Math.min(100, (spentAmt / budgetAmt) * 100) : 0;
              const isExceeded = budgetAmt > 0 && spentAmt > budgetAmt;
              const defaultCurrency = userMetadata[me]?.defaultCurrency || '₹';
              
              let progressColor = '#10B981';
              if (percent >= 70 && percent < 100) progressColor = '#F59E0B';
              if (isExceeded) progressColor = '#EF4444';

              return (
                <div 
                  key={emoji} 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '6px',
                    paddingBottom: '12px',
                    borderBottom: '1px solid #F1F5F9'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: CAT_COLORS[label] || '#64748B' }} />
                      <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--t)' }}>{label}</span>
                    </div>
                    <div style={{ position: 'relative', width: '120px' }}>
                      <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', fontWeight: 800, color: '#94A3B8' }}>
                        {defaultCurrency}
                      </span>
                      <input
                        type="number"
                        placeholder="No Limit"
                        value={currentBudget}
                        onChange={(e) => {
                          const val = e.target.value;
                          const newBudgets = {
                            ...(userMetadata[me]?.budgets || {}),
                            [emoji]: val ? parseFloat(val) : undefined,
                          };
                          setUserMetadata({
                            ...userMetadata,
                            [me]: {
                              ...userMetadata[me],
                              budgets: newBudgets,
                            },
                          });
                        }}
                        style={{
                          width: '100%',
                          padding: '6px 10px 6px 24px',
                          borderRadius: '8px',
                          border: '1.5px solid #E2E8F0',
                          fontSize: '13px',
                          fontWeight: 800,
                          color: 'var(--t)',
                          background: 'var(--bg)',
                          outline: 'none',
                          textAlign: 'right',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>

                  {budgetAmt > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px', animation: 'fadeSlideIn 0.2s ease-out' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 800 }}>
                        <span style={{ color: isExceeded ? '#EF4444' : 'var(--g)' }}>
                          Spent: <strong>{defaultCurrency}{spentAmt.toFixed(0)}</strong> of {defaultCurrency}{budgetAmt}
                        </span>
                        <span style={{ color: progressColor }}>{percent.toFixed(0)}% used</span>
                      </div>
                      <div style={{ width: '100%', height: '6px', background: 'var(--bg)', borderRadius: '10px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${percent}%`,
                            height: '100%',
                            background: progressColor,
                            borderRadius: '10px',
                            transition: 'width 0.5s ease-out',
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '9px', fontWeight: 800, color: isExceeded ? '#EF4444' : 'var(--g)' }}>
                        {isExceeded ? '⚠️ Over Budget!' : `${defaultCurrency}${(budgetAmt - spentAmt).toFixed(0)} remaining`}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
