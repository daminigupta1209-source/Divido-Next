import React, { useState, useEffect, useRef, useCallback } from 'react';
import { SearchableCurrencyPicker } from './SearchableCurrencyPicker';

import { Group, Expense, UserMetadata } from '../lib/types';
import { escManager } from '../lib/escManager';
import { formatCompactAmount } from '../lib/utils';

interface SettleModalProps {
  show: boolean;
  onClose: () => void;
  editingSettle: Expense | null;
  setEditingSettle: (exp: Expense | null) => void;
  selectedGroup: Group;
  selectedId: string | number | null;
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  groups: Group[];
  me: string;
  userMetadata: Record<string, UserMetadata>;
  setUserMetadata: (meta: Record<string, UserMetadata>) => void;
  showCurrPickerId: string | null;
  setShowCurrPickerId: (id: string | null) => void;
  onShowQR: (payee: string, amt: number, curr: string) => void;
}

export const SettleModal: React.FC<SettleModalProps> = ({
  show,
  onClose,
  editingSettle,
  setEditingSettle,
  selectedGroup,
  selectedId,
  expenses,
  setExpenses,
  groups,
  me,
  userMetadata,
  setUserMetadata,
  showCurrPickerId,
  setShowCurrPickerId,
  onShowQR,
}) => {
  const settleGroup = editingSettle
    ? (editingSettle.gId === 'STANDALONE'
        ? {
            id: 'STANDALONE',
            name: 'Non-Group Expenses',
            members: Array.from(new Set([
              me,
              ...expenses
                .filter((e) => e && String(e.gId) === 'STANDALONE')
                .reduce((acc, e) => {
                  if (e.paid) acc.add(e.paid);
                  if (Array.isArray(e.splitters)) {
                    e.splitters.forEach((s) => acc.add(s));
                  }
                  return acc;
                }, new Set<string>())
            ])),
            currency: '₹',
            emoji: '👤',
            simplifyDebts: false,
          }
        : groups.find((g) => String(g.id) === String(editingSettle.gId)) || selectedGroup)
    : selectedGroup;

  const [settleFrom, setSettleFrom] = useState(me);
  const [settleTo, setSettleTo] = useState('');
  const [settleAmt, setSettleAmt] = useState('');
  const [settleDate, setSettleDate] = useState(new Date().toISOString().split('T')[0]);
  const [settleNotes, setSettleNotes] = useState('');
  const [settleCurr, setSettleCurr] = useState(settleGroup?.currency || localStorage.getItem('divido_last_used_currency') || '₹');
  const [showSettleNotes, setShowSettleNotes] = useState(false);

  const settleFromRef = useRef(settleFrom);
  const settleToRef = useRef(settleTo);
  const settleAmtRef = useRef(settleAmt);
  const settleDateRef = useRef(settleDate);
  const settleNotesRef = useRef<HTMLInputElement>(null);
  const settleNotesValRef = useRef(settleNotes);

  useEffect(() => { settleFromRef.current = settleFrom; }, [settleFrom]);
  useEffect(() => { settleToRef.current = settleTo; }, [settleTo]);
  useEffect(() => { settleAmtRef.current = settleAmt; }, [settleAmt]);
  useEffect(() => { settleDateRef.current = settleDate; }, [settleDate]);
  useEffect(() => { settleNotesValRef.current = settleNotes; }, [settleNotes]);

  useEffect(() => {
    if (showSettleNotes && settleNotesRef.current) {
      setTimeout(() => settleNotesRef.current?.focus(), 50);
    }
  }, [showSettleNotes]);

  useEffect(() => {
    if (editingSettle) {
      setSettleFrom(editingSettle.paid || me);
      setSettleTo(editingSettle.splitters?.[0] || '');
      setSettleAmt(editingSettle.amt.toString() || '');
      setSettleDate(editingSettle.date || new Date().toISOString().split('T')[0]);
      setSettleNotes(editingSettle.notes || '');
      setSettleCurr(editingSettle.currency || settleGroup?.currency || localStorage.getItem('divido_last_used_currency') || '₹');
    } else {
      setSettleFrom(me);
      setSettleTo('');
      setSettleAmt('');
      setSettleDate(new Date().toISOString().split('T')[0]);
      setSettleNotes('');
      setSettleCurr(settleGroup?.currency || localStorage.getItem('divido_last_used_currency') || '₹');
    }
  }, [editingSettle, show]);

  const handleSettle = useCallback(() => {
    const to = settleToRef.current;
    const amt = settleAmtRef.current;
    if (!to || !amt) return;
    const amount = parseFloat(amt);
    if (isNaN(amount) || amount <= 0) return;

    if (editingSettle) {
      setExpenses((prev) =>
        prev.map((e) =>
          e.id === editingSettle.id
            ? {
                ...e,
                title: `🤝 Settlement: ${settleFromRef.current} paid ${to}`,
                amt: amount,
                paid: settleFromRef.current,
                splitters: [to],
                date: settleDateRef.current,
                notes: settleNotesValRef.current,
                currency: settleCurr,
              }
            : e
        )
      );
    } else {
      const newExp: Expense = {
        id: Date.now(),
        gId: selectedId || 'STANDALONE',
        title: `🤝 Settlement: ${settleFromRef.current} paid ${to}`,
        amt: amount,
        paid: settleFromRef.current,
        splitters: [to],
        date: settleDateRef.current,
        notes: settleNotesValRef.current,
        currency: settleCurr,
        category: '🤝',
      };
      setExpenses((prev) => [...prev, newExp]);
    }
    setEditingSettle(null);
    setSettleAmt('');
    setSettleNotes('');
    onClose();
  }, [editingSettle, setExpenses, selectedId, setEditingSettle, onClose, settleCurr]);

  // Focus the From select when the modal opens (much more logical workflow)
  useEffect(() => {
    if (show) {
      setTimeout(() => {
        const fromEl = document.getElementById('settle-from-select') as HTMLSelectElement | null;
        if (fromEl) {
          fromEl.focus();
        }
      }, 80);
    }
  }, [show]);

  useEffect(() => {
    if (show) {
      const unregister = escManager.register(() => {
        onClose();
        setEditingSettle(null);
      });
      return unregister;
    }
  }, [show, onClose, setEditingSettle]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSettle();
      return;
    }

    const activeEl = document.activeElement;

    // Handle Enter navigation
    if (e.key === 'Enter') {
      if (!activeEl || activeEl === document.body) {
        document.getElementById('settle-from-select')?.focus();
      } else if (activeEl.id === 'settle-from-select') {
        e.preventDefault();
        document.getElementById('settle-to-select')?.focus();
      } else if (activeEl.id === 'settle-to-select') {
        e.preventDefault();
        document.getElementById('settle-amt-input')?.focus();
      } else if (activeEl.id === 'settle-amt-input') {
        e.preventDefault();
        const notesEl = document.getElementById('settle-notes-input');
        if (notesEl) notesEl.focus();
        else document.getElementById('settle-submit-btn')?.focus();
      } else if (activeEl.id === 'settle-notes-input') {
        e.preventDefault();
        document.getElementById('settle-submit-btn')?.focus();
      } else if (activeEl.id === 'settle-submit-btn') {
        e.preventDefault();
        handleSettle();
      }
      return;
    }

    // Handle Arrow navigation between inputs
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      if (!activeEl) return;

      if (activeEl.id === 'settle-from-select') {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          document.getElementById('settle-to-select')?.focus();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          document.getElementById('settle-amt-input')?.focus();
        }
      } else if (activeEl.id === 'settle-to-select') {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          document.getElementById('settle-from-select')?.focus();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          document.getElementById('settle-amt-input')?.focus();
        }
      } else if (activeEl.id === 'settle-amt-input') {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          document.getElementById('settle-from-select')?.focus();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          const notesEl = document.getElementById('settle-notes-input');
          if (notesEl) notesEl.focus();
          else document.getElementById('settle-submit-btn')?.focus();
        }
      } else if (activeEl.id === 'settle-notes-input') {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          document.getElementById('settle-amt-input')?.focus();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          document.getElementById('settle-submit-btn')?.focus();
        }
      } else if (activeEl.id === 'settle-submit-btn') {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          const notesEl = document.getElementById('settle-notes-input');
          if (notesEl) notesEl.focus();
          else document.getElementById('settle-amt-input')?.focus();
        }
      }
    }
  }, [handleSettle]);

  useEffect(() => {
    if (!show) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [show, handleKeyDown]);

  if (!show) return null;

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        onClose();
        setEditingSettle(null);
      }}
      style={{ zIndex: 2000 }}
    >
      <div
        className="card modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '440px', padding: '24px', borderRadius: '28px', position: 'relative', background: 'var(--w)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                background: '#F0FDF4',
                borderRadius: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                color: '#16A34A',
              }}
            >
              🤝
            </div>
            <h2 className="nunito" style={{ fontSize: '22px', fontWeight: 900 }}>
              {editingSettle ? 'Edit Settlement' : 'Clear Dues'}
            </h2>
          </div>
          <button
            style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: 'var(--g)', opacity: 0.3 }}
            onClick={() => {
              onClose();
              setEditingSettle(null);
            }}
          >
            ✕
          </button>
        </div>

        {/* Suggested Settlements Scan */}
        {!editingSettle && (
          <div style={{ marginBottom: '24px' }}>
            <h4
              style={{
                fontSize: '10px',
                fontWeight: 900,
                color: 'var(--g)',
                textTransform: 'uppercase',
                letterSpacing: '1.5px',
                marginBottom: '10px',
              }}
            >
              Suggested Settlements
            </h4>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxHeight: '220px',
                overflowY: 'auto',
                paddingRight: '4px',
              }}
            >
              {(() => {
                const pairDebts: Record<string, Record<string, number>> = {};
                const currentGId = String(selectedId);
                const groupExpenses = expenses.filter((e) => String(e.gId) === currentGId);

                groupExpenses.forEach((e) => {
                  const splitters = e.splitters || (selectedId === 'STANDALONE' ? [] : selectedGroup.members);
                  const c = e.currency || selectedGroup.currency || '₹';
                  splitters.forEach((s) => {
                    if (s !== e.paid) {
                      const amtVal =
                        !e.mode || e.mode === 'Equally'
                          ? e.amt / (splitters.length || 1)
                          : e.mode === 'Unequally'
                          ? parseFloat(e.shares?.[s]?.toString() || '0')
                          : (e.amt * parseFloat(e.shares?.[s]?.toString() || '0')) / 100;
                      if (amtVal > 0.01) {
                        const key = `${s}-${e.paid}`;
                        if (!pairDebts[key]) pairDebts[key] = {};
                        pairDebts[key][c] = (pairDebts[key][c] || 0) + amtVal;
                      }
                    }
                  });
                });

                const finalTransactions: { from: string; to: string; currency: string; amount: number }[] = [];
                const processedPairs = new Set<string>();

                Object.keys(pairDebts).forEach((key) => {
                  const [from, to] = key.split('-');
                  const reverseKey = `${to}-${from}`;
                  if (processedPairs.has(key)) return;
                  const currencies = new Set([
                    ...Object.keys(pairDebts[key] || {}),
                    ...Object.keys(pairDebts[reverseKey] || {}),
                  ]);

                  currencies.forEach((c) => {
                    const debt = pairDebts[key]?.[c] || 0;
                    const credit = pairDebts[reverseKey]?.[c] || 0;
                    if (debt - credit > 0.01) {
                      if (from === me || to === me) {
                        finalTransactions.push({ from, to, currency: c, amount: debt - credit });
                      }
                    } else if (credit - debt > 0.01) {
                      if (from === me || to === me) {
                        finalTransactions.push({ from: to, to: from, currency: c, amount: credit - debt });
                      }
                    }
                  });
                  processedPairs.add(key);
                  processedPairs.add(reverseKey);
                });

                if (finalTransactions.length === 0)
                  return (
                    <p
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: 'var(--g)',
                        textAlign: 'center',
                        padding: '20px',
                        background: 'var(--bg)',
                        borderRadius: '16px',
                      }}
                    >
                      All clear! 🌈 No pending dues found.
                    </p>
                  );

                return finalTransactions.map((t, idx) => {
                  const upi = userMetadata[t.to]?.upiId;
                  return (
                    <div
                      key={idx}
                      className="hover-bright"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px',
                        background: 'var(--w)',
                        borderRadius: '16px',
                        border: '1.5px solid #F1F5F9',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                      }}
                    >
                      <div>
                        <p style={{ fontSize: '11px', fontWeight: 900, color: 'var(--g)' }}>
                          {t.from === me ? `💸 You pay ${t.to}` : `💸 You get back from ${t.from}`}
                        </p>
                        <p style={{ fontSize: '18px', fontWeight: 950, color: '#0F172A' }}>
                          {t.currency}
                          {formatCompactAmount(t.amount)}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {t.from === me && upi && (
                          <a
                            href={`upi://pay?pa=${upi}&pn=${t.to}&am=${t.amount.toFixed(2)}&cu=${
                              t.currency === '₹' ? 'INR' : 'USD'
                            }`}
                            style={{
                              padding: '10px 14px',
                              background: '#F0F9FF',
                              color: '#0284C7',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 900,
                              textDecoration: 'none',
                              border: '1.5px solid #B0E5FC',
                            }}
                          >
                            ⚡ Pay
                          </a>
                        )}
                        <button
                          onClick={() => {
                            setSettleFrom(t.from);
                            setSettleTo(t.to);
                            setSettleAmt(t.amount.toFixed(2));
                            setSettleCurr(t.currency);
                          }}
                          style={{
                            padding: '10px 14px',
                            background: 'var(--w)',
                            color: '#16A34A',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 900,
                            border: '1.5px solid #DCFCE7',
                            cursor: 'pointer',
                          }}
                        >
                          Settle
                        </button>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '10px', fontWeight: 900, color: 'var(--g)', textTransform: 'uppercase' }}>From</label>
              <select
                id="settle-from-select"
                value={settleFrom}
                onChange={(e) => {
                  const val = e.target.value;
                  setSettleFrom(val);
                  if (val !== me) {
                    setSettleTo(me);
                  } else {
                    setSettleTo('');
                  }
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '14px',
                  border: '2px solid #F1F1F1',
                  fontSize: '14px',
                  fontWeight: 700,
                  background: 'var(--w)',
                  marginTop: '4px',
                }}
              >
                {settleGroup.members.map((m) => (
                  <option key={m} value={m}>
                    {m === me ? '👤 You' : m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '10px', fontWeight: 900, color: 'var(--g)', textTransform: 'uppercase' }}>To</label>
              <select
                id="settle-to-select"
                value={settleTo}
                onChange={(e) => setSettleTo(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '14px',
                  border: '2px solid #F1F1F1',
                  fontSize: '14px',
                  fontWeight: 700,
                  background: 'var(--w)',
                  marginTop: '4px',
                  }}
                >
                {settleFrom !== me ? (
                  <option value={me}>You</option>
                ) : (
                  <>
                    <option value="">Select receiver...</option>
                    {settleGroup.members
                      .filter((m) => m !== me)
                      .map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                  </>
                )}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '10px', fontWeight: 900, color: 'var(--g)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Amount to Clear
            </label>
            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)', borderRadius: '16px', border: '1.5px solid #F1F1F1', height: '56px', padding: '0 14px' }}>
              <div
                onClick={() => setShowCurrPickerId('settle')}
                style={{
                  width: '48px',
                  background: '#16A34A',
                  color: 'white',
                  borderRadius: '10px',
                  fontSize: '12px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  height: '32px',
                }}
              >
                {settleCurr} <span style={{ fontSize: '8px' }}>▼</span>
              </div>
              <input
                id="settle-amt-input"
                type="text"
                inputMode="decimal"
                value={settleAmt}
                onChange={(e) => {
                  // Only allow digits and a single decimal point
                  const val = e.target.value;
                  if (val === '' || /^\d*\.?\d*$/.test(val)) {
                    setSettleAmt(val);
                  }
                }}
                onKeyDown={(e) => {
                  // Handle numpad keys when NumLock is OFF (e.key becomes arrow/nav keys but e.code stays NumpadX)
                  if (e.code && e.code.startsWith('Numpad') && e.code !== 'NumpadEnter') {
                    const numpadCodeMap: Record<string, string> = {
                      Numpad0: '0', Numpad1: '1', Numpad2: '2', Numpad3: '3',
                      Numpad4: '4', Numpad5: '5', Numpad6: '6', Numpad7: '7',
                      Numpad8: '8', Numpad9: '9', NumpadDecimal: '.',
                    };
                    const digit = numpadCodeMap[e.code];
                    if (digit !== undefined) {
                      // Check if NumLock is OFF (i.e. key is not already a digit or decimal point)
                      const isNumLockOff = !/^[0-9.]$/.test(e.key);
                      if (isNumLockOff) {
                        e.preventDefault();
                        const amtEl = e.currentTarget;
                        const start = amtEl.selectionStart ?? amtEl.value.length;
                        const end = amtEl.selectionEnd ?? amtEl.value.length;
                        const newVal = settleAmt.substring(0, start) + digit + settleAmt.substring(end);
                        if (/^\d*\.?\d*$/.test(newVal)) {
                          setSettleAmt(newVal);
                          const newCursorPos = start + 1;
                          setTimeout(() => {
                            amtEl.setSelectionRange(newCursorPos, newCursorPos);
                          }, 0);
                        }
                      }
                    }
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                placeholder="0.00"
                autoComplete="off"
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  fontSize: '24px',
                  fontWeight: 900,
                  color: '#0F172A',
                  textAlign: 'center',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {(showSettleNotes || settleNotes) && (
            <div>
              <label style={{ fontSize: '10px', fontWeight: 900, color: 'var(--g)', textTransform: 'uppercase' }}>Notes</label>
              <input
                id="settle-notes-input"
                ref={settleNotesRef}
                type="text"
                value={settleNotes}
                onChange={(e) => setSettleNotes(e.target.value)}
                placeholder="What's this for?"
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '14px',
                  border: '2px solid #F1F1F1',
                  fontSize: '13px',
                  fontWeight: 600,
                  marginTop: '4px',
                  outline: 'none',
                }}
              />
            </div>
          )}

          {!showSettleNotes && !settleNotes && (
            <button
              type="button"
              onClick={() => setShowSettleNotes(true)}
              style={{
                background: 'none',
                border: 'none',
                color: '#6366F1',
                fontSize: '11px',
                fontWeight: 900,
                cursor: 'pointer',
                textAlign: 'left',
                padding: '4px 0',
                width: 'fit-content',
                textDecoration: 'underline',
              }}
            >
              Add note 📝
            </button>
          )}

          <button
            id="settle-submit-btn"
            className="btn-green hover-up"
            style={{ padding: '18px', fontSize: '18px', marginTop: '8px', borderRadius: '18px' }}
            onClick={handleSettle}
          >
            Record Settlement <span style={{ color: '#16A34A' }}>✔️</span>
          </button>
        </div>
        <SearchableCurrencyPicker
          show={showCurrPickerId === 'settle'}
          onClose={() => setShowCurrPickerId(null)}
          onSelect={(s) => {
            setSettleCurr(s);
            localStorage.setItem('divido_last_used_currency', s);
            setShowCurrPickerId(null);
          }}
          current={settleCurr}
        />
      </div>
    </div>
  );
};
