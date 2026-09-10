import React from 'react';

// Editable amount box for the settle view. Owns its own text state so typing is
// smooth (no cursor jumps, no cross-row edits from parent re-renders). Commits
// the raw text to the parent for calculations; enforces the max on blur.
export const SettleAmountInput: React.FC<{
  inputId: string;
  amount: number | string;
  maxAmt: number;
  disabled: boolean;
  shake: boolean;
  currency?: string;
  onCommit: (v: number | string) => void;
  onExceed: () => void;
}> = ({ inputId, amount, maxAmt, disabled, shake, currency, onCommit, onExceed }) => {
  const toStr = (a: number | string) =>
    a === '' || a == null ? '' : String(typeof a === 'number' ? Math.round(a * 100) / 100 : a);
  const ref = React.useRef<HTMLInputElement>(null);
  const lastTyped = React.useRef<string>(toStr(amount));
  // Show the amount as plain text until tapped; only then mount the real input.
  // No live input on screen = no keypad and no OS autofill bar just from the
  // settle sheet appearing. Tapping enters edit mode (a user gesture, so the
  // keypad opens); blurring returns to text.
  const [editing, setEditing] = React.useState(false);
  // UNCONTROLLED input: the browser owns the text and caret, so no React
  // re-render can ever move the cursor or clear/cross-wire the field while you
  // type. We only push the DOM value from the prop when it changed externally
  // (e.g. the Max button) AND the field isn't focused — never mid-type.
  React.useEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    const s = toStr(amount);
    if (s !== lastTyped.current && el.value !== s) {
      el.value = s;
      lastTyped.current = s;
    }
  }, [amount]);

  const currStr = currency || '';
  const paddingLeft = Math.max(20, currStr.length * 8 + 12);
  const valLen = Math.max(toStr(amount).length, 4);
  const inputWidth = Math.max(90, paddingLeft + valLen * 8 + 14);

  const boxStyle: React.CSSProperties = {
    width: `${inputWidth}px`,
    maxWidth: '135px',
    height: '32px',
    padding: `0 8px 0 ${paddingLeft}px`,
    margin: 0,
    borderRadius: '8px',
    border: `1.5px solid ${shake ? '#EF4444' : '#CBD5E1'}`,
    background: disabled ? '#F1F5F9' : '#FFFFFF',
    fontSize: '13px',
    fontWeight: 700,
    color: '#1E293B',
    outline: 'none',
    textAlign: 'left',
    boxSizing: 'border-box',
    transition: 'width 0.15s ease, padding 0.15s ease',
  };

  // Plain-text display until tapped — this is what keeps the keypad and the
  // OS autofill bar from appearing merely because the settle sheet opened.
  if (!editing) {
    return (
      <div
        onClick={() => { if (!disabled) setEditing(true); }}
        style={{ ...boxStyle, display: 'flex', alignItems: 'center', cursor: disabled ? 'default' : 'text' }}
      >
        {toStr(amount) || '0'}
      </div>
    );
  }

  return (
    <input
      ref={ref}
      id={inputId}
      type="search"
      inputMode="decimal"
      autoComplete="off"
      autoCorrect="off"
      spellCheck="false"
      data-1p-ignore
      data-lpignore="true"
      autoFocus
      defaultValue={toStr(amount)}
      disabled={disabled}
      onBlur={() => setEditing(false)}
      onChange={(e) => {
        const v = e.target.value;
        // Reject invalid characters — revert to the last good value.
        if (!(v === '' || /^\d*\.?\d*$/.test(v))) {
          e.target.value = lastTyped.current;
          return;
        }
        const cleaned = v.replace(/^0+(?=\d)/, '');
        const num = parseFloat(cleaned) || 0;
        // Block going above the owed amount immediately (shake for feedback).
        // Reducing (backspace) is always allowed since it can't exceed the max.
        if (num > maxAmt) {
          e.target.value = lastTyped.current;
          onExceed();
          return;
        }
        if (cleaned !== v) e.target.value = cleaned;
        lastTyped.current = cleaned;
        onCommit(cleaned);
      }}
      style={boxStyle}
    />
  );
};
