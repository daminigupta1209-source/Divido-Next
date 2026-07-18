import React from 'react';

interface RecurrenceSelectorProps {
  showRecurrencePopup: boolean;
  setShowRecurrencePopup: (b: boolean) => void;
  recurrence: 'weekly' | 'monthly' | 'yearly' | 'none';
  setRecurrence: (val: 'weekly' | 'monthly' | 'yearly' | 'none') => void;
}

export const RecurrenceSelector: React.FC<RecurrenceSelectorProps> = ({
  showRecurrencePopup,
  setShowRecurrencePopup,
  recurrence,
  setRecurrence,
}) => {
  if (!showRecurrencePopup) return null;

  return (
    <>
      <div
        onClick={() => setShowRecurrencePopup(false)}
        style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 99,
        }}
      />
    <div
      style={{
        position: 'absolute',
        bottom: '50px',
        right: 0,
        background: 'var(--w)',
        borderRadius: '12px',
        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
        border: '1.5px solid #F1F5F9',
        zIndex: 100,
        width: '140px',
        display: 'flex',
        flexDirection: 'column',
        padding: '4px 0',
      }}
    >
      {[
        { value: 'none', label: 'One-time' },
        { value: 'weekly', label: 'Weekly' },
        { value: 'monthly', label: 'Monthly' },
        { value: 'yearly', label: 'Yearly' },
      ].map((opt) => (
        <div
          key={opt.value}
          onClick={() => {
            setRecurrence(opt.value as any);
            setShowRecurrencePopup(false);
          }}
          style={{
            padding: '8px 12px',
            fontSize: '12px',
            fontWeight: '800',
            color: recurrence === opt.value ? '#10B981' : '#1E293B',
            cursor: 'pointer',
            background: recurrence === opt.value ? '#ECFDF5' : 'transparent',
            transition: 'background-color 0.1s',
          }}
        >
          {opt.label}
        </div>
      ))}
    </div>
    </>
  );
};
