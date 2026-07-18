import React, { useState, useEffect, useMemo } from 'react';
import { worldCurrencies } from '../lib/utils';
import { SearchableCurrencyPicker } from './SearchableCurrencyPicker';

import { Group, Expense } from '../lib/types';

interface CurrencyConverterModalProps {
  setShowConvertModalId: (id: string | number | null) => void;
  group: Group;
  setGroups: (groups: Group[]) => void;
  groups: Group[];
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  me: string;
}

interface ManualRateRowProps {
  c: string;
  targetCurr: string;
  initialRate: string;
  onUpdate: (rate: string) => void;
}

const ManualRateRow: React.FC<ManualRateRowProps> = ({ c, targetCurr, initialRate, onUpdate }) => {
  const [isInverted, setIsInverted] = useState(false);
  const [localVal, setLocalVal] = useState(initialRate);

  useEffect(() => {
    setLocalVal(initialRate);
  }, [initialRate]);

  const handleLocalChange = (val: string) => {
    setLocalVal(val);
    const num = parseFloat(val);
    if (num > 0) {
      const finalRate = isInverted ? (1 / num).toFixed(6) : num.toString();
      onUpdate(finalRate);
    }
  };

  return (
    <div style={{ background: 'var(--w)', padding: '8px 10px', borderRadius: '12px', border: '1.5px solid #F1F5F9' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 950, color: 'var(--t)' }}>
        <span style={{ opacity: 0.4 }}>1</span>
        <span style={{ color: '#6366F1' }}>{isInverted ? targetCurr : c}</span>
        <span>=</span>
        <input
          type="number"
          step="any"
          value={localVal}
          onChange={(e) => handleLocalChange(e.target.value)}
          style={{
            flex: 1,
            minWidth: '60px',
            padding: '6px 8px',
            borderRadius: '10px',
            border: '1.5px solid #EEF2FF',
            background: 'var(--bg)',
            textAlign: 'center',
            fontWeight: 950,
            outline: 'none',
            fontSize: '14px',
          }}
        />
        <span style={{ color: '#6366F1' }}>{isInverted ? c : targetCurr}</span>
        <button
          onClick={() => {
            const newInv = !isInverted;
            setIsInverted(newInv);
            const currentRate = parseFloat(localVal);
            if (currentRate > 0) {
              const newVal = (1 / currentRate).toFixed(4);
              setLocalVal(newVal);
            }
          }}
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            border: 'none',
            background: '#F5F3FF',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
          }}
        >
          🔄
        </button>
      </div>
    </div>
  );
};

export const CurrencyConverterModal: React.FC<CurrencyConverterModalProps> = ({
  setShowConvertModalId,
  group,
  setGroups,
  groups,
  expenses,
  setExpenses,
  me,
}) => {
  const [targetCurr, setTargetCurr] = useState(group.currency === '₹' ? '$' : '₹');
  const [sourceCurr, setSourceCurr] = useState<string>('ALL');
  const [isConverting, setIsConverting] = useState(false);
  const [showCurrPickerId, setShowCurrPickerId] = useState<string | null>(null);
  const [rateMap, setRateMap] = useState<Record<string, string>>({});
  const [isFetching, setIsFetching] = useState(false);
  const [isManual, setIsManual] = useState(false);

  const detectedCurrs = useMemo(() => {
    const groupExpenses = expenses.filter((e) => String(e.gId) === String(group.id) && !e.isConversion);
    const activeInFeed = groupExpenses
      .map((e) => e.currency || group.currency)
      .filter((c) => c && c.trim() && c !== 'undefined');
    const unique = [...new Set(activeInFeed)];
    return unique.length > 0 ? unique : [group.currency];
  }, [expenses, group]);

  const activeCurrsForFetch = useMemo(() => {
    if (sourceCurr === 'ALL') return detectedCurrs;
    return [sourceCurr];
  }, [sourceCurr, detectedCurrs]);

  const fetchAllRates = async (target: string) => {
    setIsFetching(true);
    const newRates: Record<string, string> = {};
    try {
      for (const from of activeCurrsForFetch) {
        const fromCode = worldCurrencies.find((c) => c.s === from)?.c || from;
        const toCode = worldCurrencies.find((c) => c.s === target)?.c || target;
        if (fromCode === toCode) {
          newRates[from] = '1.0000';
          continue;
        }
        const res = await fetch(`https://open.er-api.com/v6/latest/${fromCode}`);
        const data = await res.json();
        if (data.result === 'success' && data.rates[toCode]) {
          newRates[from] = data.rates[toCode].toFixed(4);
        } else {
          throw new Error(`Could not get rate for ${from}`);
        }
      }
      setRateMap((prev) => ({ ...prev, ...newRates }));
    } catch (e: any) {
      console.error('Rate fetch failed, applying offline fallback simulator rates', e);
      const FALLBACK_SIMULATOR_RATES: Record<string, Record<string, number>> = {
        'INR': { 'USD': 0.012, 'EUR': 0.011, 'GBP': 0.0094, 'AED': 0.044, 'SAR': 0.045 },
        'USD': { 'INR': 83.5, 'EUR': 0.93, 'GBP': 0.79, 'AED': 3.67, 'SAR': 3.75 },
        'EUR': { 'INR': 89.5, 'USD': 1.07, 'GBP': 0.85, 'AED': 3.93, 'SAR': 4.02 },
        'GBP': { 'INR': 105.8, 'USD': 1.27, 'EUR': 1.18, 'AED': 4.65, 'SAR': 4.75 },
        'AED': { 'INR': 22.7, 'USD': 0.27, 'EUR': 0.25, 'GBP': 0.21, 'SAR': 1.02 }
      };

      const fallbackRates: Record<string, string> = {};
      for (const from of activeCurrsForFetch) {
        const fromCode = worldCurrencies.find((c) => c.s === from)?.c || from;
        const toCode = worldCurrencies.find((c) => c.s === target)?.c || target;
        if (fromCode === toCode) {
          fallbackRates[from] = '1.0000';
          continue;
        }
        const rate = FALLBACK_SIMULATOR_RATES[fromCode]?.[toCode] || 1.15;
        fallbackRates[from] = rate.toString();
      }
      setRateMap((prev) => ({ ...prev, ...fallbackRates }));
      setIsManual(true);
      alert(`⚠️ API offline. Fallback simulator rates applied! You can adjust them manually. 🤖`);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchAllRates(targetCurr);
  }, [targetCurr, sourceCurr]);

  const handleConvert = async () => {
    setIsConverting(true);
    await new Promise((r) => setTimeout(r, 800));

    const activeConversions = new Set<string>();
    const snapshot = expenses
      .filter((e) => String(e.gId) === String(group.id) && !e.isConversion)
      .map((e) => ({
        id: e.id,
        amt: e.amt,
        currency: e.currency || group.currency,
        shares: e.shares ? JSON.parse(JSON.stringify(e.shares)) : undefined,
      }));

    setExpenses((prev) => {
      let modificationOccurred = false;
      const updated = prev.map((e) => {
        if (String(e.gId) === String(group.id)) {
          if (e.isConversion) return e;
          const currentCurr = e.currency || group.currency;

          const matchesSource = sourceCurr === 'ALL' || currentCurr === sourceCurr;

          if (currentCurr !== targetCurr && matchesSource) {
            modificationOccurred = true;
            activeConversions.add(currentCurr);

            let newAmt: number;
            let ns: Record<string, number> | undefined;
            const isReturning = e.prevCurr === targetCurr && e.origAmt !== undefined;
            if (isReturning) {
              newAmt = e.origAmt!;
              ns = e.origShares;
            } else {
              const r = parseFloat(rateMap[currentCurr]) || 1;
              newAmt = Math.round(e.amt * r * 100) / 100;
              const computedShares: Record<string, number> = {};
              if (e.mode === 'Unequally' && e.shares) {
                Object.entries(e.shares).forEach(([m, s]) => {
                  computedShares[m] = Math.round(s * r * 100) / 100;
                });
              }
              ns = Object.keys(computedShares).length > 0 ? computedShares : e.shares;
            }

            return {
              ...e,
              amt: newAmt,
              currency: targetCurr,
              origAmt: e.origAmt !== undefined ? e.origAmt : e.amt,
              origShares: e.origShares !== undefined ? e.origShares : e.shares,
              prevCurr: currentCurr,
              shares: ns,
            };
          }
        }
        return e;
      });

      if (!modificationOccurred) {
        alert('No matching expenses found to convert! 💎');
        setIsConverting(false);
        return prev;
      }

      // Only update master group currency if we converted All Currencies or the base currency itself was converted
      if (sourceCurr === 'ALL' || sourceCurr === group.currency) {
        setGroups(groups.map((g) => (g.id === group.id ? { ...g, currency: targetCurr } : g)));
      }

      const filteredRates: Record<string, string> = {};
      activeConversions.forEach((c) => {
        filteredRates[c] = rateMap[c];
      });

      return [
        {
          id: Date.now(),
          gId: group.id,
          title: `Currency Conversion to ${targetCurr} 💎`,
          amt: 0,
          isNormalization: true,
          ratesUsed: JSON.stringify(filteredRates),
          snapshot: JSON.stringify(snapshot), // 🛡️ ATOMIC BACKUP
          toCurr: targetCurr,
          fromCurr: sourceCurr,
          date: new Date().toISOString().split('T')[0],
          paid: me,
          isConversion: true,
          category: '💱',
        },
        ...updated,
      ];
    });

    setShowConvertModalId(null);
  };

  return (
    <div
      className="modal-overlay"
      onClick={() => setShowConvertModalId(null)}
      style={{ zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        className="card shadow-xl"
        style={{
          width: '330px',
          padding: '20px 20px',
          position: 'relative',
          textAlign: 'center',
          animation: 'slideUp 0.3s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          onClick={() => setShowConvertModalId(null)}
          style={{ position: 'absolute', top: '12px', right: '12px', cursor: 'pointer', fontSize: '20px', opacity: 0.2 }}
        >
          ✕
        </div>

        <div
          style={{
            fontSize: '9.5px',
            fontWeight: 700,
            color: '#64748B',
            background: '#F1F5F9',
            padding: '4px 10px',
            borderRadius: '100px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            marginBottom: '12px',
          }}
        >
          <span className={isFetching ? 'spin' : ''}>🌐</span>{' '}
          {isFetching ? 'Fetching Live Rates...' : 'Open ER API'}
        </div>

        <h3 className="nunito" style={{ fontSize: '20px', fontWeight: 800, color: '#1E293B', marginBottom: '4px' }}>
          Convert Group Currency
        </h3>

        {/* Graphical Conversion Flow Diagram */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          background: '#F8FAFC',
          border: '1.5px solid #E2E8F0',
          borderRadius: '20px',
          padding: '16px 12px',
          marginBottom: '16px',
          marginTop: '12px'
        }}>
          {/* Source Currency */}
          <div style={{ flex: 1, textAlign: 'center' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: '4px', letterSpacing: '0.5px' }}>
              From
            </span>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <select
                value={sourceCurr}
                onChange={(e) => setSourceCurr(e.target.value)}
                style={{
                  fontSize: '14px',
                  fontWeight: 800,
                  color: '#475569',
                  background: '#FFFFFF',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: '12px',
                  padding: '6px 20px 6px 10px',
                  cursor: 'pointer',
                  minWidth: '60px',
                  appearance: 'none',
                  outline: 'none',
                  textAlign: 'center',
                }}
              >
                <option value="ALL">All</option>
                {detectedCurrs.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <span style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', fontSize: '8px', opacity: 0.5, pointerEvents: 'none' }}>
                ▼
              </span>
            </div>
          </div>

          {/* Connection arrow with live rate */}
          <div style={{ flex: 1.5, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#0D9488', background: '#E6F4EA', padding: '2px 8px', borderRadius: '100px', whiteSpace: 'nowrap', marginBottom: '6px' }}>
              1 : {rateMap[sourceCurr === 'ALL' ? group.currency : sourceCurr] || '...'}
            </span>
            {/* Visual Arrow Line */}
            <div style={{ width: '100%', height: '2px', background: '#CBD5E1', position: 'relative' }}>
              <div style={{
                position: 'absolute',
                right: '-2px',
                top: '-4px',
                width: '0',
                height: '0',
                borderTop: '5px solid transparent',
                borderBottom: '5px solid transparent',
                borderLeft: '7px solid #CBD5E1'
              }} />
            </div>
          </div>

          {/* Target Currency */}
          <div style={{ flex: 1, textAlign: 'center' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', display: 'block', marginBottom: '4px', letterSpacing: '0.5px' }}>
              To
            </span>
            <div
              onClick={() => setShowCurrPickerId('CONVERT_TARGET')}
              style={{
                fontSize: '14px',
                fontWeight: 800,
                color: '#1E293B',
                background: '#FFFFFF',
                border: '1.5px solid #0D9488',
                borderRadius: '12px',
                padding: '6px 10px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                minWidth: '45px',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(13, 148, 136, 0.08)'
              }}
            >
              {targetCurr} <span style={{ fontSize: '9px', opacity: 0.5 }}>▼</span>
            </div>
          </div>
        </div>

        {!isManual ? (
          <div style={{ marginBottom: '16px', textAlign: 'center' }}>
            {detectedCurrs.length > 1 && (
              <span style={{ fontSize: '10px', fontWeight: 500, color: '#64748B', display: 'block', marginBottom: '6px' }}>
                *+{detectedCurrs.length - 1} other currencies will also be converted.
              </span>
            )}
            <button
              onClick={() => setIsManual(true)}
              style={{
                background: 'none',
                border: 'none',
                color: '#0D9488',
                fontWeight: 700,
                fontSize: '11px',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Edit Conversion Rates Manually
            </button>
          </div>
        ) : (
          <div style={{ textAlign: 'left', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  color: '#64748B',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Manual Overrides
              </label>
              <button
                onClick={() => setIsManual(false)}
                style={{ background: 'none', border: 'none', color: '#0D9488', fontWeight: 700, fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Back to Auto
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '160px', overflowY: 'auto' }}>
              {detectedCurrs
                .filter((c) => c !== targetCurr)
                .map((c) => (
                  <ManualRateRow
                    key={c}
                    c={c}
                    targetCurr={targetCurr}
                    initialRate={rateMap[c] || '1.0000'}
                    onUpdate={(finalRate) => setRateMap((prev) => ({ ...prev, [c]: finalRate }))}
                  />
                ))}
            </div>
          </div>
        )}

        <SearchableCurrencyPicker
          show={showCurrPickerId === 'CONVERT_TARGET'}
          onClose={() => setShowCurrPickerId(null)}
          onSelect={(s) => setTargetCurr(s)}
          current={targetCurr}
        />

        <button
          className="btn-green hover-up"
          style={{ width: '100%', height: '46px', borderRadius: '14px', fontSize: '14px', fontWeight: 800 }}
          onClick={handleConvert}
          disabled={isConverting || isFetching}
        >
          {isConverting ? 'Normalizing...' : 'Apply Conversion'}
        </button>
      </div>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { display: inline-block; animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
};
