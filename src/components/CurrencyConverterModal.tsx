import React, { useState, useEffect, useMemo } from 'react';
import { worldCurrencies, genExpenseId } from '../lib/utils';
import { SearchableCurrencyPicker } from './SearchableCurrencyPicker';
import { StyledDropdown } from './StyledDropdown';

import { Group, Expense } from '../lib/types';
import { revertGroupConversions } from '../lib/conversions';

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
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--t)' }}>
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
            fontWeight: 600,
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
    // Also include each expense's ORIGINAL currency. An already-converted group's
    // expenses now read as the target currency, but a re-conversion reverts them
    // to their originals FIRST — so the rate fetch must cover those originals too,
    // otherwise the missing-rate guard blocks (e.g. can't get a € rate because the
    // feed only shows ₹). Originals live in the conversion logs' snapshots.
    const originalCurrById: Record<string, string> = {};
    const convLogs = expenses
      .filter((e) => String(e.gId) === String(group.id) && e.isConversion)
      .sort((a, b) => (a.date || '').localeCompare(b.date || '') || ((a.timestamp || 0) - (b.timestamp || 0)));
    for (const log of convLogs) {
      let snap: any[] = [];
      try { snap = log.snapshot ? JSON.parse(log.snapshot) : []; } catch { snap = []; }
      for (const s of snap) {
        if (s && s.id != null && s.currency && !(String(s.id) in originalCurrById)) {
          originalCurrById[String(s.id)] = s.currency;
        }
      }
    }
    const activeInFeed = groupExpenses
      .flatMap((e) => {
        const cur = e.currency || group.currency;
        const orig = originalCurrById[String(e.id)];
        return orig && orig !== cur ? [cur, orig] : [cur];
      })
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

    const gid = String(group.id);
    const isThisGroup = (e: Expense) => String(e.gId) === gid;

    // 1. Reconstruct the TRUE ORIGINAL amounts. Every prior conversion stored a
    // snapshot of the state before it ran; processing them oldest-first and
    // keeping the EARLIEST snapshot per expense id gives each expense's original
    // value. This is what lets re-converting always start from the original
    // (not a half-converted intermediate) and makes undo fully restore.
    const existingLogs = expenses.filter((e) => isThisGroup(e) && e.isConversion);
    const logsOldestFirst = [...existingLogs].sort(
      (a, b) => (a.date || '').localeCompare(b.date || '') || ((a.timestamp || 0) - (b.timestamp || 0))
    );
    const originalById: Record<string, { amt: number; currency: string; shares?: Record<string, number> }> = {};
    for (const log of logsOldestFirst) {
      let snap: any[] = [];
      try { snap = log.snapshot ? JSON.parse(log.snapshot) : []; } catch { snap = []; }
      for (const s of snap) { if (!(s.id in originalById)) originalById[s.id] = s; }
    }

    // 2. Base = this group's real expenses, reverted to their originals.
    const baseExpenses = expenses
      .filter((e) => isThisGroup(e) && !e.isConversion)
      .map((e) => {
        const o = originalById[String(e.id)];
        return o ? { ...e, amt: o.amt, currency: o.currency, shares: o.shares } : e;
      });

    // 3. Snapshot the originals — a single, always-correct backup for undo.
    const snapshot = baseExpenses.map((e) => ({
      id: e.id,
      amt: e.amt,
      currency: e.currency || group.currency,
      shares: e.shares ? JSON.parse(JSON.stringify(e.shares)) : undefined,
    }));

    // 4. Convert base -> target. Non-matching currencies stay at their original.
    const activeConversions = new Set<string>();
    let modificationOccurred = false;
    // Record the ACTUAL rate applied per currency. Previously we saved
    // rateMap[c] directly, which was `undefined` when a rate was missing —
    // producing an empty rates_used ("{}") AND silently converting at 1:1
    // (relabelling money to the target currency without changing its value).
    // Now we capture the effective rate and refuse to save a conversion that has
    // no valid rate for a currency it would change.
    const usedRates: Record<string, string> = {};
    const missingRates = new Set<string>();
    const finalById: Record<string, { amt: number; currency: string; shares?: Record<string, number> }> = {};
    baseExpenses.forEach((e) => {
      const currentCurr = e.currency || group.currency;
      const matchesSource = sourceCurr === 'ALL' || currentCurr === sourceCurr;
      if (currentCurr !== targetCurr && matchesSource) {
        modificationOccurred = true;
        activeConversions.add(currentCurr);
        const raw = parseFloat(rateMap[currentCurr]);
        const valid = Number.isFinite(raw) && raw > 0;
        if (!valid) missingRates.add(currentCurr);
        const r = valid ? raw : 1;
        usedRates[currentCurr] = String(r);
        const newAmt = Math.round(e.amt * r * 100) / 100;
        let ns = e.shares;
        if (e.mode === 'Unequally' && e.shares) {
          ns = {};
          Object.entries(e.shares).forEach(([m, s]) => { (ns as Record<string, number>)[m] = Math.round((s as number) * r * 100) / 100; });
        }
        finalById[String(e.id)] = { amt: newAmt, currency: targetCurr, shares: ns };
      } else {
        finalById[String(e.id)] = { amt: e.amt, currency: currentCurr, shares: e.shares };
      }
    });

    if (!modificationOccurred) {
      alert(`Nothing to convert — those expenses are already in ${targetCurr}.`);
      setIsConverting(false);
      return;
    }

    // Don't silently convert at 1:1 when a rate is missing — that corrupts the
    // group's amounts. Ask the user to set a rate for each currency first.
    if (missingRates.size > 0) {
      alert(`⚠️ Missing exchange rate for: ${[...missingRates].join(', ')}. Set a rate for each before converting — I won't convert without it (that would change the amounts incorrectly).`);
      setIsConverting(false);
      return;
    }

    const filteredRates: Record<string, string> = usedRates;

    const newLog: any = {
      id: genExpenseId(),
      gId: group.id,
      title: `Currency Conversion to ${targetCurr}`,
      amt: 0,
      isNormalization: true,
      ratesUsed: JSON.stringify(filteredRates),
      snapshot: JSON.stringify(snapshot),
      toCurr: targetCurr,
      fromCurr: sourceCurr,
      date: new Date().toISOString().split('T')[0],
      paid: me,
      isConversion: true,
      category: '💱',
    };

    const oldLogIds = new Set(existingLogs.map((l) => String(l.id)));

    setExpenses((prev) => {
      const next = prev
        .filter((e) => !oldLogIds.has(String(e.id))) // remove ALL prior conversion logs (no stacking)
        .map((e) => {
          if (isThisGroup(e) && !e.isConversion && finalById[String(e.id)]) {
            const f = finalById[String(e.id)];
            return { ...e, amt: f.amt, currency: f.currency, shares: f.shares };
          }
          return e;
        });
      return [newLog, ...next];
    });

    if (sourceCurr === 'ALL' || sourceCurr === group.currency) {
      setGroups(groups.map((g) => (g.id === group.id ? { ...g, currency: targetCurr } : g)));
    }

    setShowConvertModalId(null);
  };

  // The most recent conversion log for this group (conversions are prepended, so
  // the first match is the newest). Its snapshot lets us restore the pre-convert
  // state — the same "Undo conversion" the card's long-press menu offers, but
  // reachable from inside this modal too.
  const convLog = expenses.find((e) => String(e.gId) === String(group.id) && e.isConversion);
  const undoConversion = () => {
    if (!convLog) return;
    if (!confirm(`Undo currency conversion and restore original currencies? 🔄\n\nEvery expense goes back to the exact amount and currency it had BEFORE any conversion. Nothing is lost.`)) return;
    // Revert ALL conversion logs in the group at once (robust even if several
    // were stacked), then restore the group's original currency.
    let restoredCurr = group.currency;
    setExpenses((prev) => {
      const { expenses: next, restoredCurrency } = revertGroupConversions(prev, group.id);
      restoredCurr = restoredCurrency;
      return next;
    });
    setGroups(groups.map((g) => (String(g.id) === String(group.id) ? { ...g, currency: restoredCurr } : g)));
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
          {isFetching ? 'Fetching Live Rates...' : 'Live Exchange Rates'}
        </div>

        <h3  style={{ fontSize: '20px', fontWeight: 600, color: '#1E293B', marginBottom: '4px' }}>
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
            <StyledDropdown
              ariaLabel="Convert from currency"
              value={sourceCurr}
              onChange={(v) => setSourceCurr(v)}
              buttonStyle={{ fontSize: '14px', fontWeight: 600, color: '#475569', border: '1.5px solid #E2E8F0', boxShadow: 'none', minWidth: '60px', padding: '6px 10px' }}
              options={[{ value: 'ALL', label: 'All' }, ...detectedCurrs.map((c) => ({ value: c, label: c }))]}
            />
          </div>

          {/* Connection arrow with live rate */}
          <div style={{ flex: 1.5, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: '9.5px', fontWeight: 600, color: '#0D9488', background: '#E6F4EA', padding: '2px 8px', borderRadius: '100px', whiteSpace: 'nowrap', marginBottom: '6px' }}>
              {sourceCurr === 'ALL' && detectedCurrs.length > 1 
                ? 'Multiple rates' 
                : `1 : ${rateMap[sourceCurr === 'ALL' ? detectedCurrs[0] : sourceCurr] || '...'}`}
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
                fontWeight: 600,
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
          className="btn-green"
          style={{ width: '100%', height: '46px', borderRadius: '14px', fontSize: '14px', fontWeight: 600, opacity: (isConverting || isFetching) ? 0.6 : 1, cursor: (isConverting || isFetching) ? 'default' : 'pointer' }}
          onClick={handleConvert}
          disabled={isConverting || isFetching}
        >
          {isConverting ? 'Normalizing...' : 'Apply Conversion'}
        </button>
        {convLog && (
          <button
            onClick={undoConversion}
            disabled={isConverting || isFetching}
            style={{ width: '100%', height: '42px', marginTop: '8px', borderRadius: '14px', fontSize: '13px', fontWeight: 600, background: 'none', border: '1.5px solid #FBCFE8', color: '#DB2777', cursor: (isConverting || isFetching) ? 'default' : 'pointer' }}
          >
            Undo conversion
          </button>
        )}
      </div>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { display: inline-block; animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
};
