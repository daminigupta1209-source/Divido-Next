import React from 'react';
import { Group, Expense } from '../../lib/types';
import { formatDate, getEmoji, getExactTime, formatExactAmount } from '../../lib/utils';

interface ExpenseRowProps {
  e: Expense;
  me: string;
  selectedGroup: Group;
  selectedId: string | number | null;
  openExpId: string | number | null;
  setOpenExpId: (id: string | number | null) => void;
  setEditingExpense: (exp: Expense | null) => void;
  setShowExpModal: (b: boolean) => void;
  setEditingSettle: (exp: Expense | null) => void;
  setShowSettleModal: (b: boolean) => void;
  setShowConvertModalId: (id: string | number | null) => void;
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  groups: Group[];
  deleteExpense: (id: string | number) => void;
}

export const ExpenseRow: React.FC<ExpenseRowProps> = ({
  e,
  me,
  selectedGroup,
  selectedId,
  openExpId,
  setOpenExpId,
  setEditingExpense,
  setShowExpModal,
  setEditingSettle,
  setShowSettleModal,
  setShowConvertModalId,
  setExpenses,
  setGroups,
  groups,
  deleteExpense,
}) => {
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleLongPress = (e: Expense) => {
    setOpenExpId(e.id);
  };

  if (e.paid === 'SYSTEM') {
    const getSystemTitle = (title: string) => {
      const cleanMe = me.replace(/\s*\(me\)$/i, '').replace(/\s*\(Left\)$/i, '').toLowerCase();
      
      const leftMatch = `${cleanMe} left`;
      const removedMatch = `${cleanMe} was removed`;
      const rejoinedMatch = `${cleanMe} rejoined`;

      const lowerTitle = title.toLowerCase();

      if (lowerTitle.startsWith(leftMatch)) {
        return '🚪 You left';
      }
      if (lowerTitle.startsWith(removedMatch)) {
        return '🚫 You were removed';
      }
      if (lowerTitle.startsWith(rejoinedMatch)) {
        return '🎉 You rejoined';
      }

      // Add visual emojis to other system messages for clarity
      if (lowerTitle.endsWith(' left')) {
        return `🚪 ${title}`;
      }
      if (lowerTitle.endsWith(' was removed')) {
        return `🚫 ${title}`;
      }
      if (lowerTitle.endsWith(' rejoined')) {
        return `🎉 ${title}`;
      }

      return title;
    };

    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '6px 12px',
          background: 'rgba(241, 245, 249, 0.7)',
          borderRadius: '20px',
          border: '1px solid rgba(226, 232, 240, 0.8)',
          fontSize: '11px',
          fontWeight: 600,
          color: '#64748B',
          margin: '4px auto 12px auto',
          maxWidth: 'fit-content',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}
      >
        {getSystemTitle(e.title)}
        <span style={{ fontSize: '9px', fontWeight: 600, color: '#94A3B8', marginLeft: '6px' }}>
          • {formatDate(e.date)}
        </span>
      </div>
    );
  }

  const isSettlement = e.title.includes('💸 Settlement') || e.title.includes('🤝 Settlement') || e.title.toLowerCase().includes('settlement') || e.category === '💸' || e.category === '🤝' || e.title === 'Payment Recorded';
  // A write-off is a locked "receipt" of a forgiven balance — not a normal,
  // editable expense. Rendered read-only below so it can't be accidentally
  // edited or deleted (deleting one silently reverses the write-off).
  const isWriteOff = e.title === 'Written off' || e.notes === 'Written off';
  const splitters = e.splitters || selectedGroup?.members || [];
  const isConversion = e.isConversion;

  if (isConversion) {
    const rateMap = e.ratesUsed ? JSON.parse(e.ratesUsed) : { [e.fromCurr || '']: 1 };
    const rateStrings = Object.entries(rateMap)
      .filter(([src]) => src !== e.toCurr)
      .map(([src, r]) => `${src}➔${e.toCurr} @ ${r}`);

    return (
      <div
        className="card hover-bright"
        onContextMenu={(ev) => {
          ev.preventDefault();
          handleLongPress(e);
        }}
        onTouchStart={() => {
          longPressTimerRef.current = setTimeout(() => {
            handleLongPress(e);
          }, 500);
        }}
        onTouchEnd={() => {
          if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        }}
        onTouchMove={() => {
          if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        }}
        style={{
          position: 'relative',
          padding: '14px 16px',
          background: '#FFFFFF',
          border: '0.5px solid #EFE7DC',
          boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
          borderRadius: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          transition: '0.2s all',
          marginBottom: '8px',
        }}
      >
        <div
          onClick={() => setShowConvertModalId(selectedId)}
          style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', flex: 1 }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              background: '#F5F3FF',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              color: '#6D28D9',
              flexShrink: 0,
            }}
          >
            💱
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#6D28D9', margin: 0 }}>
                Currency Conversion <span style={{ fontSize: '10px', opacity: 0.3 }}>✏️</span>
              </h3>
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  color: '#6D28D9',
                  opacity: 0.5,
                  background: '#F5F3FF',
                  padding: '1px 4px',
                  borderRadius: '3px',
                }}
              >
                {formatDate(e.date)}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginTop: '4px' }}>
              {rateStrings.map((rs) => (
                <span
                  key={rs}
                  style={{
                    fontSize: '8px',
                    fontWeight: 700,
                    background: '#F5F3FF',
                    color: '#6D28D9',
                    padding: '0.5px 4px',
                    borderRadius: '3px',
                    border: '1px solid #EAE5FF',
                  }}
                >
                  {rs}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '12px', position: 'relative', zIndex: 10 }}
          onClick={(ev) => ev.stopPropagation()}
        >
          <div style={{ position: 'relative' }}>
            {openExpId === e.id && (
              <div
                className="card shadow-xl dropdown-content"
                style={{ display: 'block', position: 'absolute', right: 0, top: '100%', minWidth: '160px', zIndex: 100, background: '#FFFFFF', padding: '6px', borderRadius: '12px', border: '1.5px solid #F1F5F9' }}
              >
              <div
                onClick={(ev) => {
                  ev.stopPropagation();
                  setShowConvertModalId(selectedId);
                  setOpenExpId(null);
                }}
              >
                ⚙️ Adjust Conversion
              </div>
              <div
                style={{ color: '#DB2777' }}
                onClick={(ev) => {
                  ev.stopPropagation();
                  if (
                    confirm(
                      `Undo this conversion? 🔄\n\nThis will restore the exact state before this conversion.`
                    )
                  ) {
                    const snapshotArr: any[] = e.snapshot ? JSON.parse(e.snapshot) : [];
                    const snapMap: Record<string, any> = {};
                    snapshotArr.forEach((s) => {
                      snapMap[s.id] = s;
                    });

                    setExpenses((prev) =>
                      prev
                        .map((x) => {
                          if (snapMap[x.id]) {
                            const s = snapMap[x.id];
                            return { ...x, amt: s.amt, currency: s.currency, shares: s.shares };
                          }
                          return x;
                        })
                        .filter((x) => x.id !== e.id)
                    );

                    const restoredCurr = e.fromCurr || snapshotArr[0]?.currency || '₹';
                    setGroups(
                      groups.map((g) =>
                        String(g.id) === String(selectedId)
                          ? { ...g, currency: restoredCurr }
                          : g
                      )
                    );
                  } else if (confirm('Just delete the log entry without undoing?')) {
                    setExpenses((prev) => prev.filter((x) => x.id !== e.id));
                  }
                  setOpenExpId(null);
                }}
              >
                Delete Activity
              </div>
            </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isSettlement) {
    const timeStr = getExactTime(e.id);
    return (
      <div
        onContextMenu={(ev) => {
          ev.preventDefault();
          handleLongPress(e);
        }}
        onTouchStart={() => {
          longPressTimerRef.current = setTimeout(() => {
            handleLongPress(e);
          }, 500);
        }}
        onTouchEnd={() => {
          if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        }}
        onTouchMove={() => {
          if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        }}
        onClick={() => {
          if (openExpId === e.id) return;
          setEditingExpense(e);
          setShowExpModal(true);
        }}
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
          marginBottom: '8px',
          opacity: e.isDeleted ? 0.5 : 1,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              background: '#F0FDF4',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              color: '#15803D',
              flexShrink: 0,
            }}
          >
            ✅
          </div>
          <div style={{ minWidth: 0, flex: 1, marginRight: '16px' }}>
            <h3 style={{ fontSize: '14px', color: 'var(--t)', margin: 0, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: e.isDeleted ? 'line-through' : 'none' }}>
              Payment Recorded
            </h3>
            {e.isDeleted && <span style={{fontSize: '10px', background: '#FEE2E2', color: '#EF4444', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, marginLeft: '6px'}}>Deleted</span>}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#94A3B8', marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <span style={{ color: '#16A34A', fontWeight: 500 }}>
                {e.paid === me ? 'You' : e.paid} paid {e.splitters?.[0] === me ? 'you' : e.splitters?.[0]}
              </span>
              <span>•</span>
              <span>{formatDate(e.date)}{timeStr ? ` at ${timeStr}` : ''}</span>
            </div>
            {e.notes && e.notes !== 'Granular Global Clearance' && (
              <p
                style={{
                  fontSize: '9px',
                  fontStyle: 'italic',
                  color: '#64748B',
                  margin: '4px 0 0 0',
                  background: 'rgba(240, 253, 244, 0.5)',
                  padding: '3px 6px',
                  borderRadius: '4px',
                  display: 'inline-block',
                  border: '0.5px solid #DCFCE7',
                  lineHeight: '1.2',
                }}
              >
                "{e.notes}"
              </p>
            )}
          </div>
        </div>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
          onClick={(ev) => ev.stopPropagation()}
        >
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--t)', textDecoration: e.isDeleted ? 'line-through' : 'none' }}>
              {e.currency || selectedGroup.currency || '₹'} {formatExactAmount((Number(e.amt) || 0))}
            </span>
          </div>
          <div style={{ position: 'relative' }}>
            {openExpId === e.id && (
              <div
                className="card shadow-xl dropdown-content"
                style={{ display: 'block', position: 'absolute', right: 0, top: '100%', minWidth: '110px', zIndex: 100, background: '#FFFFFF', padding: '6px', borderRadius: '12px', border: '1.5px solid #F1F5F9' }}
              >
              <div
                style={{ color: e.isDeleted ? '#10B981' : '#DB2777', padding: '8px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', borderRadius: '8px' }}
                className="hover-bg"
                onClick={(ev) => {
                  ev.stopPropagation();
                  setExpenses((prev) => prev.map(x => x.id === e.id ? { ...x, isDeleted: !e.isDeleted } : x));
                  setOpenExpId(null);
                }}
              >
                {e.isDeleted ? 'Restore Payment' : 'Undo Payment'}
              </div>
            </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Curated pastel avatar colors matching the homepage style
  const avatarColors = ['#E0F2FE', '#F0FDF4', '#FEF2F2', '#FFFBEB', '#F5F3FF', '#FFF1F2'];
  const textColors = ['#0369A1', '#15803D', '#B91C1C', '#B45309', '#6D28D9', '#BE123C'];
  const colIdx = (e.title.charCodeAt(0) + (e.title.charCodeAt(1) || 0)) % avatarColors.length;

  return (
    <div
      tabIndex={0}
      className="card hover-bright"
      onContextMenu={(ev) => {
        ev.preventDefault();
        handleLongPress(e);
      }}
      onTouchStart={() => {
        longPressTimerRef.current = setTimeout(() => {
          handleLongPress(e);
        }, 500);
      }}
      onTouchEnd={() => {
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      }}
      onTouchMove={() => {
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      }}
      onClick={() => {
        if (openExpId === e.id) return;
        setEditingExpense(e);
        setShowExpModal(true);
      }}
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
        marginBottom: '8px',
        minHeight: '70px',
        boxSizing: 'border-box',
        opacity: e.isDeleted ? 0.5 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
        <div
          style={{
            width: '40px',
            height: '40px',
            background: avatarColors[colIdx],
            color: textColors[colIdx],
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          {e.title === 'Written off' ? '➖' : (getEmoji(e.title) || (e.attachments && e.attachments.length > 0 ? '🖼️' : '⚡'))}
        </div>
        <div style={{ minWidth: 0, flex: 1, marginRight: '16px' }}>
          <h3 style={{ fontSize: '14px', color: 'var(--t)', margin: 0, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: e.isDeleted ? 'line-through' : 'none' }}>
            {e.title}
          </h3>
          {e.isDeleted && <span style={{fontSize: '10px', background: '#FEE2E2', color: '#EF4444', padding: '2px 6px', borderRadius: '4px', fontWeight: 600}}>Deleted</span>}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#94A3B8', marginTop: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span style={{ color: e.paid === me ? '#16A34A' : '#DE7093', fontWeight: 500 }}>{(() => {
              // Write-offs show "who paid whom" for a clearer picture.
              const receiver = Array.isArray(e.splitters) ? e.splitters[0] : undefined;
              if (e.title === 'Written off' && receiver) {
                const payerLabel = e.paid === me ? 'You' : e.paid;
                const receiverLabel = receiver === me ? 'you' : receiver;
                return `${payerLabel} paid ${receiverLabel}`;
              }
              return e.paid === me ? 'You paid' : `${e.paid} paid`;
            })()}</span>
            <span>•</span>
            <span>{formatDate(e.date)}</span>
            {e.tags && e.tags.length > 0 && (
              <>
                <span>•</span>
                <span style={{ color: '#0284C7', fontWeight: 650 }}>{e.tags.map(t => `#${t}`).join(' ')}</span>
              </>
            )}
            {e.isRecurring && (
              <>
                <span>•</span>
                <span title={`Next occurrence: ${e.nextOccurrence || 'N/A'}`} style={{ color: '#0F766E', fontWeight: 650 }}>
                  🔁 {e.recurrence ? e.recurrence.charAt(0).toUpperCase() + e.recurrence.slice(1) : 'Recurring'}
                </span>
              </>
            )}
          </div>
          {e.notes && e.notes !== 'Granular Global Clearance' && (
            <p
              style={{
                fontSize: '9px',
                fontStyle: 'italic',
                color: '#64748B',
                margin: '4px 0 0 0',
                background: 'rgba(250, 244, 236, 0.4)',
                padding: '3px 6px',
                borderRadius: '4px',
                display: 'inline-block',
                border: '0.5px solid #EFE7DC',
                whiteSpace: 'pre-wrap',
                maxWidth: '200px',
                lineHeight: '1.2',
              }}
            >
              📝 {e.notes}
            </p>
          )}
        </div>
      </div>

      <div
        style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
        onClick={(ev) => ev.stopPropagation()}
      >
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
          {/* Write-offs keep the struck-through amount as a "settled" cue, but the
              card stays clickable/editable so the amount can be adjusted (e.g. a
              partial write-off). */}
          <span style={{ fontSize: '14px', fontWeight: 600, color: isWriteOff ? '#94A3B8' : 'var(--t)', textDecoration: isWriteOff || e.isDeleted ? 'line-through' : 'none' }}>
            {e.currency || selectedGroup.currency || '₹'} {formatExactAmount(e.amt)}
          </span>
        </div>
        <div style={{ position: 'relative' }}>
          {openExpId === e.id && (
            <div
              className="card shadow-xl dropdown-content"
              style={{
                display: 'block',
                position: 'absolute',
                right: 0,
                top: '100%',
                background: '#FFFFFF',
                zIndex: 100,
                minWidth: '140px',
                padding: '6px',
                borderRadius: '12px',
                border: '1.5px solid #F1F5F9',
              }}
            >
              <div
                onClick={(ev) => {
                  ev.stopPropagation();
                  setExpenses((prev) => prev.map(x => x.id === e.id ? { ...x, isDeleted: !e.isDeleted } : x));
                  setOpenExpId(null);
                }}
                style={{ padding: '8px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', borderRadius: '8px', color: e.isDeleted ? '#10B981' : '#EF4444' }}
                className="hover-bg"
              >
                {e.isDeleted ? 'Restore Activity' : 'Delete Activity'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
