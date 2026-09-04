import React from 'react';
import type { Expense } from '../lib/types';
import { formatDate, getEmoji, formatExactAmount } from '../lib/utils';

interface NonGroupViewProps {
  expenses: Expense[];
  me: string;
  myEmail?: string;
  defaultCurrency: string;
  memberAvatars?: Record<string, string>;
  // Canonical balance engine (same one Friends/Balances use). For STANDALONE it
  // returns the person's net position per currency: negative = they owe me.
  getMemberBalance: (groupId: string | number | null, memberName: string) => Record<string, number>;
  onBack: () => void;
  onOpenExpense: (exp: Expense) => void;
  onSettlePerson: (name: string) => void;
  onRemindPerson?: (name: string) => void;
  onAddWithPerson?: (name: string) => void;
  onSharePerson?: (name: string) => void;
  // How many backed-up non-group expenses aren't present locally (for restore).
  backupMissingCount?: number;
  onRestoreBackup?: () => void;
}

const cleanName = (n: string) => (n || '').replace(/\s*\(Left\)$/i, '').trim();

// Same solid avatar palette as the All-balances (Friends) view.
const AVATAR_BG = ['#B39DDB', '#F48FB1', '#80CBC4', '#FFB74D', '#9FA8DA', '#A5D6A7', '#EF9A9A', '#7FC8CE'];

const fmt = (v: number) => {
  const abs = Math.abs(v);
  return abs.toFixed(2).replace(/\.00$/, '');
};

// "I collect X" from a person = the negative of their net position (2-person
// non-group expenses only ever involve me + them, so their net IS the pairwise
// balance). Positive => I collect, negative => I pay.
const myPerspective = (bal: Record<string, number>): { curr: string; amount: number }[] =>
  Object.entries(bal)
    .map(([curr, val]) => ({ curr, amount: -val }))
    .filter((x) => Math.abs(x.amount) > 0.01);

export const NonGroupView: React.FC<NonGroupViewProps> = ({
  expenses,
  me,
  defaultCurrency,
  memberAvatars,
  getMemberBalance,
  onOpenExpense,
  onSettlePerson,
  onRemindPerson,
  onAddWithPerson,
  backupMissingCount = 0,
  onRestoreBackup,
}) => {
  const [selectedPerson, setSelectedPerson] = React.useState<string | null>(null);
  // Bottom toggle on the front page: Settle | Photos (swipe left/right).
  const [activeTab, setActiveTab] = React.useState<'settle' | 'photos'>('settle');
  // Which person's row is expanded inline (accordion) on the Settle tab.
  const [expandedPerson, setExpandedPerson] = React.useState<string | null>(null);
  const touchStartX = React.useRef<number | null>(null);
  const touchStartY = React.useRef<number | null>(null);

  const meLower = cleanName(me).toLowerCase();

  // With the on-screen breadcrumb gone, make the phone/browser back button
  // return from a person's page to the people list (instead of leaving the
  // non-group screen entirely). Push one history entry while a person is open
  // and pop back to the list when the user goes back.
  React.useEffect(() => {
    if (!selectedPerson) return;
    window.history.pushState({ dividoNonGroupPerson: true }, '');
    const onPop = () => setSelectedPerson(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [selectedPerson]);

  // All non-group (STANDALONE) expenses, newest first.
  const nonGroupExps = React.useMemo(
    () =>
      expenses
        .filter((e) => e && String(e.gId) === 'STANDALONE' && !e.isDeleted)
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)),
    [expenses]
  );

  // One entry per OTHER person, with their expense count, canonical balance and
  // email (captured optionally when they were added — Expense.otherEmail).
  const people = React.useMemo(() => {
    const byName = new Map<string, { name: string; count: number; email: string }>();
    nonGroupExps.forEach((e) => {
      const names = new Set<string>();
      if (e.paid) names.add(e.paid);
      (e.splitters || []).forEach((s) => names.add(s));
      const otherEmail = (e.otherEmail || '').trim().toLowerCase();
      names.forEach((raw) => {
        const c = cleanName(raw);
        if (!c || c.toLowerCase() === meLower) return;
        const key = c.toLowerCase();
        const cur = byName.get(key);
        if (cur) {
          cur.count += 1;
          if (!cur.email && otherEmail.includes('@')) cur.email = otherEmail;
        } else {
          byName.set(key, { name: c, count: 1, email: otherEmail.includes('@') ? otherEmail : '' });
        }
      });
    });
    return Array.from(byName.values())
      .map((p) => ({ ...p, bal: getMemberBalance('STANDALONE', p.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [nonGroupExps, meLower, getMemberBalance]);

  const Avatar: React.FC<{ name: string; size?: number }> = ({ name, size = 38 }) => {
    const url = memberAvatars?.[name] || memberAvatars?.[cleanName(name)];
    if (url) {
      return (
        <img
          src={url}
          alt={cleanName(name)}
          style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        />
      );
    }
    // Match the All-balances avatar: solid colour + a single white initial.
    const idx = (cleanName(name).charCodeAt(0) || 0) % AVATAR_BG.length;
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: AVATAR_BG[idx],
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.round(size * 0.4),
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {cleanName(name).charAt(0).toUpperCase()}
      </div>
    );
  };

  // Wording + colours match the All-balances (Friends) cards.
  const balanceText = (bal: Record<string, number>): { text: string; color: string } => {
    const lines = myPerspective(bal);
    if (lines.length === 0) return { text: 'Settled up', color: '#94A3B8' };
    const parts = lines.map((l) => `${l.amount > 0 ? 'You collect' : 'You pay'} ${l.curr}${fmt(l.amount)}`);
    const allCollect = lines.every((l) => l.amount > 0);
    const allPay = lines.every((l) => l.amount < 0);
    const color = allCollect ? '#047857' : allPay ? '#B91C1C' : '#334155';
    return { text: parts.join(' · '), color };
  };

  // ── Person detail ──────────────────────────────────────────────────────────
  if (selectedPerson) {
    const person = selectedPerson;
    const bal = getMemberBalance('STANDALONE', person);
    const lines = myPerspective(bal);
    const theirExps = nonGroupExps.filter((e) => {
      const names = new Set<string>();
      if (e.paid) names.add(cleanName(e.paid).toLowerCase());
      (e.splitters || []).forEach((s) => names.add(cleanName(s).toLowerCase()));
      return names.has(person.toLowerCase());
    });
    const hasBalance = lines.length > 0;
    const allCollect = hasBalance && lines.every((l) => l.amount > 0);

    return (
      <div className="content-width-limit" style={{ paddingTop: '4px' }}>
        {/* Centered header — avatar, name, balance */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '16px' }}>
          <Avatar name={person} size={56} />
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', marginTop: '8px' }}>{person}</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: !hasBalance ? '#94A3B8' : allCollect ? '#047857' : '#B91C1C', marginTop: '2px' }}>
            {!hasBalance
              ? 'All settled up'
              : lines.map((l) => `${l.amount > 0 ? 'You collect' : 'You pay'} ${l.curr}${fmt(l.amount)}`).join(' · ')}
          </div>
        </div>

        {/* Actions — three equal ghost buttons */}
        {(() => {
          const ghost: React.CSSProperties = { flex: 1, padding: '11px 8px', borderRadius: '12px', border: '0.5px solid #E2E8F0', background: '#FFFFFF', color: '#334155', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };
          const allPay = hasBalance && lines.every((l) => l.amount < 0);
          return (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '22px' }}>
              {hasBalance && (
                <button type="button" onClick={() => onSettlePerson(person)} style={ghost}>Settle</button>
              )}
              {hasBalance && onRemindPerson && (
                <button
                  type="button"
                  onClick={() => (allPay ? onSettlePerson(person) : onRemindPerson(person))}
                  style={ghost}
                >
                  {allPay ? 'Pay now' : 'Invite'}
                </button>
              )}
              {onAddWithPerson && (
                <button type="button" onClick={() => onAddWithPerson(person)} style={ghost}>+ Expense</button>
              )}
            </div>
          );
        })()}

        <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '1.2px', color: '#94A3B8', textTransform: 'uppercase', marginBottom: '8px' }}>
          Expenses with {person}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {theirExps.map((e) => {
            const curr = e.currency || defaultCurrency;
            const iPaid = cleanName(e.paid).toLowerCase() === meLower;
            const avatarColors = ['#E0F2FE', '#F0FDF4', '#FEF2F2', '#FFFBEB', '#F5F3FF', '#FFF1F2'];
            const textColors = ['#0369A1', '#15803D', '#B91C1C', '#B45309', '#6D28D9', '#BE123C'];
            const colIdx = (e.title.charCodeAt(0) + (e.title.charCodeAt(1) || 0)) % avatarColors.length;
            return (
              <div
                key={e.id}
                className="card hover-bright"
                onClick={() => onOpenExpense(e)}
                style={{
                  position: 'relative',
                  padding: '14px 24px 14px 16px',
                  background: '#FFFFFF',
                  border: '0.5px solid #EFE7DC',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                  borderRadius: '20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  transition: '0.2s all',
                  minHeight: '70px',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                  <div style={{ width: '40px', height: '40px', background: avatarColors[colIdx], color: textColors[colIdx], borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 600, flexShrink: 0 }}>
                    {getEmoji(e.title) || (e.attachments && e.attachments.length > 0 ? '🖼️' : '⚡')}
                  </div>
                  <div style={{ minWidth: 0, flex: 1, marginRight: '16px' }}>
                    <h3 style={{ fontSize: '14px', color: 'var(--t)', margin: 0, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#94A3B8', marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <span style={{ color: iPaid ? '#16A34A' : '#DE7093', fontWeight: 500 }}>{iPaid ? 'You paid' : `${cleanName(e.paid)} paid`}</span>
                      <span>•</span>
                      <span>{formatDate(e.date)}</span>
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--t)' }}>{curr} {formatExactAmount(Number(e.amt) || 0)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── People list (front page) ─────────────────────────────────────────────────
  // The top bar (back + "Non-Group Expenses" title) is provided by MobileHeader,
  // so this view starts at the net-balance card.

  // My overall non-group position (positive currency = I collect) — same engine.
  const myBal = getMemberBalance('STANDALONE', me);
  const netLines = Object.entries(myBal)
    .map(([curr, val]) => ({ curr, amount: val }))
    .filter((x) => Math.abs(x.amount) > 0.01);
  const netHasBalance = netLines.length > 0;
  const netAllCollect = netHasBalance && netLines.every((l) => l.amount > 0);

  // Every receipt/photo attached to a non-group expense, newest first.
  const photos = nonGroupExps.flatMap((e) =>
    (e.attachments || []).map((url) => ({ url, exp: e }))
  );

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    // Horizontal swipe only (ignore vertical scrolls).
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) setActiveTab('photos');
    else setActiveTab('settle');
  };

  return (
    <div className="content-width-limit">
      {/* Cloud-backup restore banner — appears when the cloud has non-group
          expenses that aren't on this device (new device / after a wipe). */}
      {backupMissingCount > 0 && onRestoreBackup && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '14px', padding: '12px 14px', marginBottom: '16px' }}>
          <span style={{ fontSize: '18px' }}>☁️</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E3A8A' }}>Restore from backup</div>
            <div style={{ fontSize: '11.5px', color: '#3B82F6' }}>{backupMissingCount} non-group {backupMissingCount === 1 ? 'expense' : 'expenses'} saved in your cloud backup.</div>
          </div>
          <button
            type="button"
            onClick={onRestoreBackup}
            style={{ border: 'none', background: '#2563EB', color: '#FFFFFF', borderRadius: '10px', padding: '8px 14px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
          >
            Restore
          </button>
        </div>
      )}

      {/* Net balance card — styled to match the home page pill */}
      <div style={{ marginBottom: '22px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#B0A79C', marginBottom: '10px', marginLeft: '2px' }}>
          Net Balance
        </div>
        <div style={{ position: 'relative', display: 'flex', height: '38px', borderRadius: '999px', overflow: 'hidden', boxShadow: '0 6px 16px rgba(0,0,0,0.06)' }}>
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              padding: '0 18px',
              background: !netHasBalance ? '#10B981' : netAllCollect ? '#10B981' : '#E11D48',
            }}
          >
            {!netHasBalance
              ? 'All settled up'
              : netLines.map((l) => `${l.amount > 0 ? 'You collect' : 'You pay'} ${l.curr}${fmt(l.amount)}`).join('  ·  ')}
          </div>
          {netHasBalance && (
            <span style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: '#FFFFFF', fontSize: '18px', fontWeight: 600, lineHeight: 1, pointerEvents: 'none', opacity: 0.9 }}>›</span>
          )}
        </div>
      </div>

      {/* Settle / Photos toggle (swipeable) — matches the home Groups/Activities tabs */}
      <div style={{ marginBottom: '14px', marginTop: '4px' }}>
        <div style={{ display: 'flex', borderBottom: '1.5px solid #F1F5F9' }}>
          {([{ id: 'settle', label: 'Settle' }, { id: 'photos', label: 'Photos' }] as const).map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1,
                  position: 'relative',
                  background: 'transparent',
                  border: 'none',
                  padding: '10px 4px 12px',
                  fontSize: '14px',
                  fontWeight: isActive ? 800 : 600,
                  cursor: 'pointer',
                  color: isActive ? '#1E293B' : '#94A3B8',
                  transition: '0.2s all',
                }}
              >
                {tab.label}
                <span
                  style={{
                    position: 'absolute',
                    bottom: '-1.5px',
                    left: 0,
                    right: 0,
                    height: '3px',
                    background: isActive ? '#EA580C' : 'transparent',
                    borderRadius: '3px 3px 0 0',
                    transition: '0.2s all',
                    opacity: isActive ? 1 : 0,
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{ minHeight: '80px' }}>
        {activeTab === 'settle' ? (
          people.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#94A3B8', textAlign: 'center', padding: '24px 0' }}>
              No non-group expenses yet. Add a quick expense with someone and it'll show up here.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {people.map((p) => {
                const b = balanceText(p.bal);
                const isOpen = expandedPerson === p.name;
                const hasBal = myPerspective(p.bal).length > 0;
                const pLower = p.name.toLowerCase();
                const theirExps = isOpen
                  ? nonGroupExps.filter((e) => {
                      const names = new Set<string>();
                      if (e.paid) names.add(cleanName(e.paid).toLowerCase());
                      (e.splitters || []).forEach((s) => names.add(cleanName(s).toLowerCase()));
                      return names.has(pLower);
                    })
                  : [];
                const innerBtn: React.CSSProperties = { flex: 1, textAlign: 'center', padding: '9px', borderRadius: '10px', border: '0.5px solid #E2E8F0', background: '#FFFFFF', color: '#334155', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' };
                return (
                  <div
                    key={p.name}
                    style={{ background: '#FFFFFF', border: '0.5px solid #EFE7DC', borderRadius: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.04)', overflow: 'hidden' }}
                  >
                    {/* Row header — tap to expand/collapse */}
                    <div
                      className="hover-up-mini"
                      onClick={() => setExpandedPerson(isOpen ? null : p.name)}
                      style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', cursor: 'pointer' }}
                    >
                      <Avatar name={p.name} size={40} />
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', minWidth: 0 }}>
                          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#2E2A25', margin: 0, textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 }}>{p.name}</h3>
                          <span style={{ fontSize: '13px', fontWeight: 500, color: '#94A3B8', whiteSpace: 'nowrap', flexShrink: 0 }}>({p.count} {p.count === 1 ? 'expense' : 'expenses'})</span>
                        </div>
                        <span style={{ fontSize: '13px', fontWeight: 500, color: b.color }}>{b.text}</span>
                      </div>
                      {onRemindPerson && (
                        <button
                          type="button"
                          onClick={(ev) => { ev.stopPropagation(); onRemindPerson(p.name); }}
                          title={`Invite ${p.name}`}
                          style={{ width: '34px', height: '34px', borderRadius: '50%', background: '#FFF4EC', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                        >
                          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                          </svg>
                        </button>
                      )}
                      <span style={{ fontSize: '14px', color: '#94A3B8', flexShrink: 0, transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
                    </div>

                    {/* Expanded body — actions + this person's expenses */}
                    {isOpen && (
                      <div style={{ borderTop: '0.5px solid #EFE7DC', padding: '12px 16px', background: '#FBFAF8' }}>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: theirExps.length ? '12px' : '0' }}>
                          {hasBal && <button type="button" onClick={() => onSettlePerson(p.name)} style={innerBtn}>Settle</button>}
                          {onAddWithPerson && (
                            <button
                              type="button"
                              onClick={() => onAddWithPerson(p.name)}
                              style={{ ...innerBtn, background: '#10B981', border: 'none', color: '#FFFFFF' }}
                            >
                              + Expense
                            </button>
                          )}
                        </div>
                        {theirExps.map((e) => {
                          const curr = e.currency || defaultCurrency;
                          const iPaid = cleanName(e.paid).toLowerCase() === meLower;
                          return (
                            <div
                              key={e.id}
                              onClick={() => onOpenExpense(e)}
                              style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0', borderBottom: '0.5px solid #EFE7DC', cursor: 'pointer' }}
                            >
                              <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#F1EFE8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>
                                {getEmoji(e.title) || '⚡'}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</div>
                                <div style={{ fontSize: '11px', color: '#94A3B8' }}>{iPaid ? 'You paid' : `${cleanName(e.paid)} paid`} · {formatDate(e.date)}</div>
                              </div>
                              <span style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>{curr} {formatExactAmount(Number(e.amt) || 0)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : photos.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#94A3B8', textAlign: 'center', padding: '24px 0' }}>
            No receipts yet. Attach a photo to a non-group expense and it'll appear here.
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: '8px' }}>
            {photos.map((ph, i) => (
              <div
                key={`${ph.exp.id}-${i}`}
                onClick={() => onOpenExpense(ph.exp)}
                style={{ position: 'relative', aspectRatio: '1', borderRadius: '10px', overflow: 'hidden', cursor: 'pointer', border: '1px solid #E2E8F0' }}
              >
                <img src={ph.url} alt={ph.exp.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
