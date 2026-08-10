import React, { useState } from 'react';
import { StyledDropdown } from '../StyledDropdown';

interface SplitSelectorProps {
  showSharesPopup: boolean;
  setShowSharesPopup: (b: boolean) => void;
  splitMode: string;
  setSplitMode: (s: string) => void;
  curr: string;
  amt: string;
  setAmt: (s: string) => void;
  selectedSplitters: string[];
  shares: Record<string, number>;
  setShares: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  manualEdits: Set<string>;
  setManualEdits: React.Dispatch<React.SetStateAction<Set<string>>>;
  me: string;
  handleShareChange: (name: string, val: string) => void;
  totalShares: number;
  getShareAmt: (m: string) => number;
  groupMembers?: string[];
}

export const SplitSelector: React.FC<SplitSelectorProps> = ({
  showSharesPopup,
  setShowSharesPopup,
  splitMode,
  setSplitMode,
  curr,
  amt,
  setAmt,
  selectedSplitters,
  shares,
  setShares,
  manualEdits,
  setManualEdits,
  me,
  handleShareChange,
  totalShares,
  getShareAmt,
  groupMembers,
}) => {
  const [shakingFriend, setShakingFriend] = useState<string | null>(null);

  if (!showSharesPopup) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(15, 23, 42, 0.5)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2200,
      }}
      onClick={() => setShowSharesPopup(false)}
    >
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.98)',
          border: '1.5px solid rgba(255, 255, 255, 0.7)',
          borderRadius: '24px',
          width: '92%',
          maxWidth: '420px',
          padding: '24px',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '15px', fontWeight: 950, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ⚖️ Split Shares ({splitMode})
          </span>
          <button
            type="button"
            onClick={() => setShowSharesPopup(false)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '16px',
              color: '#64748B',
              fontWeight: 'bold',
            }}
          >
            ✕
          </button>
        </div>

        {/* Total Amount & Split Mode Dropdown (Side-by-Side Flex) */}
        <div style={{ display: 'flex', gap: '10px' }}>
          {/* Total Amount */}
          <div className="step-container" style={{ flex: 1.2 }}>
            <label
              style={{
                fontSize: '9px',
                fontWeight: 950,
                color: '#10B981',
                textTransform: 'uppercase',
                letterSpacing: '1.2px',
              }}
            >
              Total Value ({curr})
            </label>
            <div style={{ position: 'relative', height: '38px', display: 'flex', alignItems: 'center', marginTop: '2px' }}>
              <input
                id="shares-val-input"
                type="number"
                autoComplete="one-time-code"
                autoCorrect="off"
                spellCheck="false"
                data-1p-ignore
                data-lpignore="true"
                placeholder="0.00"
                value={amt}
                onChange={(e) => setAmt(e.target.value)}
                style={{
                  width: '100%',
                  height: '100%',
                  padding: '0 10px',
                  fontSize: '15px',
                  fontWeight: '900',
                  textAlign: 'left',
                  borderRadius: '10px',
                  border: '2px solid #F1F5F9',
                  background: 'var(--bg)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  margin: 0,
                }}
              />
            </div>
          </div>

          {/* Split Mode Dropdown */}
          <div className="step-container" style={{ flex: 1 }}>
            <label
              style={{
                fontSize: '9px',
                fontWeight: 950,
                color: '#10B981',
                textTransform: 'uppercase',
                letterSpacing: '1.2px',
              }}
            >
              Split Mode ⚖️
            </label>
            <div style={{ position: 'relative', height: '38px', display: 'flex', alignItems: 'center', marginTop: '2px' }}>
              <StyledDropdown
                id="shares-split-mode-select"
                fullWidth
                ariaLabel="Split mode"
                value={splitMode}
                options={[
                  { value: 'Equally', label: 'Equally' },
                  { value: 'Unequally', label: 'Unequally' },
                  { value: 'Percentage', label: 'Percentage' },
                ]}
                onChange={(mode) => {
                  setSplitMode(mode);
                  setShares({});
                  setManualEdits(new Set());
                  if (mode === 'Equally') {
                    setShowSharesPopup(false);
                  }
                }}
                buttonStyle={{
                  height: '38px',
                  fontSize: '13px',
                  fontWeight: 900,
                  border: '2.5px solid #F1F5F9',
                  color: '#0F172A',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.03)',
                }}
              />
            </div>
          </div>
        </div>

        {/* Scrollable list of selected friends with inputs */}
        <div
          className="splitter-scroll"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            maxHeight: '220px',
            overflowY: 'auto',
            padding: '4px',
            background: '#F8FAFC',
            borderRadius: '12px',
            border: '1px dashed #CBD5E1',
          }}
        >
          {selectedSplitters.map((friend) => {
            const isLeft = groupMembers?.some(
              (m) =>
                m.endsWith(' (Left)') &&
                m.replace(' (Left)', '').toLowerCase() === friend.toLowerCase()
            );
            return (
              <div
                key={friend}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 10px',
                  background: 'var(--w)',
                  borderRadius: '10px',
                  border: '1.5px solid #F8FAFC',
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    color: '#1E293B',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {friend === me ? (
                    <img
                      src="/divido_laughing_cat_mascot_1778063273427.png"
                      style={{ width: '16px', height: '16px', borderRadius: '50%' }}
                      alt="cat avatar"
                    />
                  ) : null}
                  {friend === me ? 'You' : (isLeft ? `${friend} (Left)` : friend)}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <style>{`
                  .placeholder-faded::placeholder {
                    color: #94A3B8 !important;
                    opacity: 0.25 !important;
                    font-size: 11px !important;
                  }
                  /* Disable spin buttons and native user-agent input styling boxes */
                  input[type="number"]::-webkit-outer-spin-button,
                  input[type="number"]::-webkit-inner-spin-button {
                    -webkit-appearance: none;
                    margin: 0;
                  }
                  input.placeholder-faded, input.placeholder-faded:focus, input.placeholder-faded:active {
                    -moz-appearance: textfield !important;
                    appearance: textfield !important;
                    background: transparent !important;
                    background-color: transparent !important;
                    border: none !important;
                    outline: none !important;
                    box-shadow: none !important;
                    padding: 0 !important;
                    margin: 0 !important;
                    border-radius: 0 !important;
                    text-align: left !important;
                    font-weight: 800 !important;
                    width: 60px !important;
                    height: 24px !important;
                  }
                  input:-webkit-autofill,
                  input:-webkit-autofill:hover, 
                  input:-webkit-autofill:focus, 
                  input:-webkit-autofill:active {
                    -webkit-box-shadow: 0 0 0 30px white inset !important;
                    -webkit-text-fill-color: #1E293B !important;
                  }
                `}</style>
                <div
                  className={shakingFriend === friend ? 'shake' : ''}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    borderBottom: '1.5px solid #CBD5E1',
                    padding: '4px 0',
                    transition: 'border-color 0.2s',
                  }}
                  onFocusCapture={(e) => {
                    e.currentTarget.style.borderColor = '#10B981';
                  }}
                  onBlurCapture={(e) => {
                    e.currentTarget.style.borderColor = '#CBD5E1';
                  }}
                >
                  {splitMode === 'Unequally' && (
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#64748B', marginRight: '8px', userSelect: 'none' }}>{curr}</span>
                  )}
                  <input
                    id={`share-input-${friend}`}
                    type="number"
                    autoComplete="one-time-code"
                    autoCorrect="off"
                    spellCheck="false"
                    data-1p-ignore
                    data-lpignore="true"
                    value={shares[friend] === undefined ? '' : shares[friend]}
                    onChange={(e) => {
                      const inputVal = e.target.value;
                      const numVal = parseFloat(inputVal) || 0;
                      
                      if (splitMode === 'Unequally') {
                        const totalAmt = parseFloat(amt) || 0;
                        // Only count other shares that have been manually edited. Unedited/autofilled shares adjust dynamically.
                        const otherManualSum = selectedSplitters
                          .filter((m) => m !== friend && manualEdits.has(m))
                          .reduce((sum, m) => sum + (shares[m] || 0), 0);
                        const maxAllowed = totalAmt - otherManualSum;
                        if (numVal > maxAllowed) {
                          setShakingFriend(friend);
                          setTimeout(() => setShakingFriend(null), 500);
                          return;
                        }
                      }
                      
                      if (splitMode === 'Percentage') {
                        const otherManualSum = selectedSplitters
                          .filter((m) => m !== friend && manualEdits.has(m))
                          .reduce((sum, m) => sum + (shares[m] || 0), 0);
                        const maxAllowed = 100 - otherManualSum;
                        if (numVal > maxAllowed) {
                          setShakingFriend(friend);
                          setTimeout(() => setShakingFriend(null), 500);
                          return;
                        }
                      }
                      
                      handleShareChange(friend, inputVal);
                    }}
                    placeholder="0.00"
                    className="placeholder-faded"
                    style={{
                      width: '60px',
                      height: '24px',
                      lineHeight: '24px',
                      fontSize: '17.5px',
                      textAlign: 'left',
                      background: 'transparent',
                      border: 'none',
                      outline: 'none',
                      fontWeight: 800,
                      color: '#1E293B',
                      padding: 0,
                      margin: 0,
                      caretColor: '#000000',
                    }}
                  />
                  {splitMode === 'Percentage' && (
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 900,
                        color: '#64748B',
                        opacity: 0.8,
                        marginLeft: '2px',
                        userSelect: 'none',
                      }}
                    >
                      %
                    </span>
                  )}
                </div>
                {splitMode !== 'Unequally' && (
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 900,
                      color: '#64748B',
                      minWidth: '55px',
                      textAlign: 'right',
                    }}
                  >
                    {curr}
                    {getShareAmt(friend).toLocaleString(undefined, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

        {/* Allocation Status / Validation Box */}
        <div
          style={{
            padding: '10px 14px',
            background:
              splitMode === 'Unequally'
                ? Math.abs(totalShares - (parseFloat(amt) || 0)) < 0.01
                  ? '#ECFDF5'
                  : '#FFF1F2'
                : Math.abs(totalShares - 100) < 0.01
                ? '#ECFDF5'
                : '#FFF1F2',
            border:
              splitMode === 'Unequally'
                ? Math.abs(totalShares - (parseFloat(amt) || 0)) < 0.01
                  ? '1.5px solid #A7F3D0'
                  : '1.5px solid #FECDD3'
                : Math.abs(totalShares - 100) < 0.01
                ? '1.5px solid #A7F3D0'
                : '1.5px solid #FECDD3',
            borderRadius: '12px',
            fontSize: '11px',
            fontWeight: 800,
            color:
              splitMode === 'Unequally'
                ? Math.abs(totalShares - (parseFloat(amt) || 0)) < 0.01
                  ? '#065F46'
                  : '#9F1239'
                : Math.abs(totalShares - 100) < 0.01
                ? '#065F46'
                : '#9F1239',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '14px' }}>
            {splitMode === 'Unequally'
              ? Math.abs(totalShares - (parseFloat(amt) || 0)) < 0.01
                ? '🎉'
                : '🛑'
              : Math.abs(totalShares - 100) < 0.01
              ? '🎉'
              : '🛑'}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            <span style={{ textTransform: 'uppercase', fontSize: '9px', fontWeight: 900, opacity: 0.6 }}>
              Split Balance Status
            </span>
            <span>
              {splitMode === 'Unequally' ? (
                Math.abs(totalShares - (parseFloat(amt) || 0)) < 0.01 ? (
                  `Perfect split! Exact amount of ${curr}${totalShares.toFixed(2)} allocated.`
                ) : (
                  `Allocated: ${curr}${totalShares.toFixed(2)} of ${curr}${(parseFloat(amt) || 0).toFixed(2)}. ${
                    totalShares > (parseFloat(amt) || 0)
                      ? `Over by ${curr}${Math.abs(totalShares - (parseFloat(amt) || 0)).toFixed(2)}`
                      : `Short by ${curr}${Math.abs(totalShares - (parseFloat(amt) || 0)).toFixed(2)}`
                  }.`
                )
              ) : (
                Math.abs(totalShares - 100) < 0.01 ? (
                  'Perfect split! Exact 100% allocated.'
                ) : (
                  `Allocated: ${totalShares.toFixed(1)}% of 100%. ${
                    totalShares > 100
                      ? `Over by ${(totalShares - 100).toFixed(1)}%`
                      : `Short by ${(100 - totalShares).toFixed(1)}%`
                  }.`
                )
              )}
            </span>
          </div>
        </div>

        {/* Done button */}
        <button
          id="shares-done-btn"
          type="button"
          onClick={() => {
            setShowSharesPopup(false);
            const el = document.getElementById('split-mode-select');
            if (el) setTimeout(() => el.focus(), 50);
          }}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '14px',
            fontWeight: 900,
            borderRadius: '14px',
            background: '#10B981',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'center',
          }}
          className="hover-up-mini"
        >
          Done
        </button>
      </div>
    </div>
  );
};
