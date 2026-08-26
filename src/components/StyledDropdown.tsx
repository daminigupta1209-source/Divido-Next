import React, { useState } from 'react';

export interface DropdownOption {
  value: string;
  label: string;
}

interface StyledDropdownProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  id?: string;
  /** Fixed width; ignored when fullWidth is set. */
  width?: string | number;
  fullWidth?: boolean;
  ariaLabel?: string;
  /** Overrides for the trigger button (e.g. font size, padding). */
  buttonStyle?: React.CSSProperties;
  /** Opens the menu aligned to the right edge of the trigger. */
  align?: 'left' | 'right';
}

/**
 * App-wide dropdown with a consistent, custom-styled menu — replaces native
 * <select> elements whose OS-rendered option lists can't be styled (the blue
 * highlight). Modeled on the "All Balances" filter: rounded trigger + soft
 * popup with a subtle grey highlight on the selected option.
 */
export const StyledDropdown: React.FC<StyledDropdownProps> = ({
  value,
  options,
  onChange,
  id,
  width,
  fullWidth,
  ariaLabel,
  buttonStyle,
  align = 'left',
}) => {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <div style={{ position: 'relative', display: fullWidth ? 'block' : 'inline-block', width: fullWidth ? '100%' : width }}>
      <button
        id={id}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '6px',
          width: fullWidth ? '100%' : undefined,
          padding: '10px 14px',
          borderRadius: '12px',
          border: '1.5px solid #E2E8F0',
          background: 'var(--w, #fff)',
          fontSize: '13px',
          fontWeight: 600,
          color: '#475569',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          boxSizing: 'border-box',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          ...buttonStyle,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{selected ? selected.label : ''}</span>
        <span style={{ fontSize: '9px', marginLeft: '2px', color: '#94A3B8', flexShrink: 0 }}>▼</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 199 }} />
          <div
            role="listbox"
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              [align === 'right' ? 'right' : 'left']: 0,
              background: 'var(--w, #fff)',
              border: '1.5px solid #F1F5F9',
              borderRadius: '14px',
              boxShadow: '0 8px 20px rgba(0,0,0,0.1)',
              zIndex: 200,
              width: fullWidth ? '100%' : 'max-content',
              minWidth: '140px',
              padding: '6px',
              boxSizing: 'border-box',
            }}
          >
            {options.map((opt) => {
              const active = value === opt.value;
              return (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={active}
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    fontWeight: active ? 800 : 600,
                    cursor: 'pointer',
                    color: '#1E293B',
                    background: active ? '#F1F5F9' : 'transparent',
                    textAlign: 'left',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#F8FAFC'; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                  {opt.label}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
