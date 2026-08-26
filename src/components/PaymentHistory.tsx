import React, { useState } from 'react';
import { getExactTime, parseExpenseId } from '../lib/utils';

import { Group, Expense } from '../lib/types';

interface PaymentHistoryProps {
  expenses: Expense[];
  groups: Group[];
  me: string;
  setEditingExpense?: (exp: Expense | null) => void;
  setShowExpModal?: (show: boolean) => void;
  deleteExpense?: (id: string | number) => void;
  setSelectedId?: (id: string | number | null) => void;
  setView?: (view: string) => void;
}

export const PaymentHistory: React.FC<PaymentHistoryProps> = ({
  expenses,
  groups,
  me,
  setEditingExpense,
  setShowExpModal,
  deleteExpense,
  setSelectedId,
  setView,
}) => {
  const [openDropdownId, setOpenDropdownId] = useState<string | number | null>(null);

  const settlements = expenses
    .filter((e) => e.title && e.title.includes('🤝 Settlement'))
    .sort((a, b) => parseExpenseId(b.id) - parseExpenseId(a.id));

  return (
    <div className="content-width-limit" style={{ paddingBottom: '80px' }}>
      <div
        className="hero"
        style={{
          background: 'linear-gradient(135deg, #FEF3C7 0%, #FFFBEB 100%)',
          padding: '40px 20px',
          borderRadius: '32px',
          textAlign: 'center',
          color: '#92400E',
          marginBottom: '32px',
          boxShadow: '0 15px 30px -10px rgba(0, 0, 0, 0.03)',
          border: '1px solid rgba(255,255,255,0.8)',
        }}
      >
        <h1  style={{ fontSize: '32px' }}>
          Payment History 📜
        </h1>
        <p style={{ fontSize: '12px', fontWeight: 600, opacity: 0.7, marginTop: '8px' }}>
          Your complete chronological ledger of cleared dues
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {settlements.length === 0 ? (
          <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--g)', fontWeight: 700 }}>
            No payments recorded yet 🕊️
          </div>
        ) : (
          settlements.map((s) => {
            const g = groups.find((x) => String(x.id) === String(s.gId));
            const isByMe = s.paid === me;
            const timeStr = getExactTime(s.id);
            return (
              <div
                key={s.id}
                className="card hover-up"
                onClick={() => {
                  if (setEditingExpense && setShowExpModal) {
                    setEditingExpense(s);
                    setShowExpModal(true);
                  }
                }}
                style={{
                  padding: '24px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  border: '1.5px solid #F1F5F9',
                  background: 'var(--w)',
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                  <div
                    style={{
                      width: '56px',
                      height: '56px',
                      background: isByMe ? '#ECFDF5' : '#EFF6FF',
                      borderRadius: '18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '28px',
                    }}
                  >
                    {isByMe ? '📤' : '📥'}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <h3  style={{ fontSize: '18px', color: '#1E293B' }}>
                        {isByMe ? 'You Paid' : `${s.paid} Paid You`}
                      </h3>
                      <span
                        onClick={(ev) => {
                          ev.stopPropagation();
                          if (s.gId !== 'STANDALONE' && setSelectedId && setView) {
                            setSelectedId(s.gId);
                            setView('detail');
                          }
                        }}
                        className="pill"
                        style={{ fontSize: '9px', padding: '4px 8px', background: 'var(--bg)', color: 'var(--g)', cursor: 'pointer' }}
                      >
                        {g?.name || 'Group'}
                      </span>
                    </div>
                    <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--g)', marginTop: '4px' }}>
                      {isByMe ? `To: ${s.splitters?.[0]}` : `From: ${s.paid}`} • {s.date}
                      {timeStr ? ` at ${timeStr}` : ''}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }} onClick={(ev) => ev.stopPropagation()}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '22px', fontWeight: 600, color: '#0F172A' }}>
                      {s.currency || '₹'}
                      {(parseFloat(s.amt.toString()) || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                    <div
                      className="pill"
                      style={{
                        marginTop: '4px',
                        background: isByMe ? '#D1FAE5' : '#DBEAFE',
                        color: isByMe ? '#065F46' : '#1E40AF',
                        fontSize: '10px',
                        fontWeight: 600,
                      }}
                    >
                      Cleared <span style={{ color: '#16A34A' }}>✔️</span>
                    </div>
                  </div>
                  <div className="dropdown" style={{ position: 'relative' }}>
                    <div
                      style={{ fontSize: '24px', color: 'var(--g)', padding: '4px', cursor: 'pointer', opacity: 0.4 }}
                      onClick={() => setOpenDropdownId(openDropdownId === s.id ? null : s.id)}
                    >
                      ⋮
                    </div>
                    {openDropdownId === s.id && (
                      <div
                        className="card shadow-xl"
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: '100%',
                          background: 'var(--w)',
                          zIndex: 100,
                          minWidth: '120px',
                          padding: '8px',
                          borderRadius: '12px',
                          border: '1.5px solid #F1F5F9',
                        }}
                      >
                        <div
                          onClick={() => {
                            if (setEditingExpense && setShowExpModal) {
                              setEditingExpense(s);
                              setShowExpModal(true);
                            }
                            setOpenDropdownId(null);
                          }}
                          style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', borderRadius: '8px' }}
                          className="hover-bg"
                        >
                          ✏️ Edit
                        </div>
                        <div
                          onClick={() => {
                            if (confirm('Delete this payment record?') && deleteExpense) {
                              deleteExpense(s.id);
                            }
                            setOpenDropdownId(null);
                          }}
                          style={{
                            padding: '10px 12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            color: '#DB2777',
                            borderRadius: '8px',
                          }}
                          className="hover-bg"
                        >
                          🗑️ Delete
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
