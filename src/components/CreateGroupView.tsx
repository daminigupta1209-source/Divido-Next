import React, { useState, useRef, useEffect } from 'react';
import { worldCurrencies } from '../lib/utils';
import { Group } from '../lib/types';
import { SearchableCurrencyPicker } from './SearchableCurrencyPicker';

interface CreateGroupViewProps {
  me: string;
  myDefaultCurrency: string;
  onCancel: () => void;
  onCreateGroup: (groupData: { name: string; currency: string; members: string[]; emoji: string }) => void;
  groups: Group[];
  userName: string;
}

export const CreateGroupView: React.FC<CreateGroupViewProps> = ({
  me,
  myDefaultCurrency,
  onCancel,
  onCreateGroup,
  groups,
  userName,
}) => {
  const [title, setTitle] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('🏘️'); // Stores base64 group DP URL or default emoji fallback
  const [selectedCurrency, setSelectedCurrency] = useState(myDefaultCurrency || '₹');
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [participants, setParticipants] = useState<string[]>([me]);
  const [nameError, setNameError] = useState('');

  const currencyInfo = worldCurrencies.find((c) => c.s === selectedCurrency) || { s: '₹', n: 'Indian Rupee', c: 'INR' };

  const titleInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Autofocus title input on mount
  useEffect(() => {
    setTimeout(() => {
      titleInputRef.current?.focus();
    }, 100);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        setSelectedEmoji(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddParticipant = () => {
    setParticipants([...participants, '']);
  };

  const handleParticipantChange = (index: number, val: string) => {
    const updated = [...participants];
    updated[index] = val;
    setParticipants(updated);
  };

  const handleRemoveParticipant = (index: number) => {
    if (index === 0) return; // Cannot remove yourself
    const updated = participants.filter((_, i) => i !== index);
    setParticipants(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    // Check duplicate group name
    const isDuplicate = groups.some(
      (g) => g.name.toLowerCase() === trimmedTitle.toLowerCase()
    );
    if (isDuplicate) {
      setNameError('This group name already exists! 🏘️');
      return;
    }

    // Filter out empty participant names and map duplicates/unnamed
    const cleanMembers = participants
      .map((p, idx) => {
        const val = p.trim();
        if (idx === 0) return val || me;
        return val;
      })
      .filter((p) => p !== '');

    // Make unique members list
    const uniqueMembers = Array.from(new Set(cleanMembers));

    onCreateGroup({
      name: trimmedTitle,
      currency: selectedCurrency,
      members: uniqueMembers,
      emoji: selectedEmoji,
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="content-width-limit"
      style={{
        padding: '20px 16px',
        boxSizing: 'border-box',
        minHeight: '100vh',
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}
    >
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: 'var(--t)',
              padding: 0,
              lineHeight: 1,
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            ←
          </button>
          <h1 style={{ fontSize: '20px', fontWeight: 950, color: 'var(--t)', margin: 0, fontFamily: 'Nunito' }}>
            New Group
          </h1>
        </div>

        {/* Submit Tick Button */}
        <button
          type="submit"
          disabled={!title.trim()}
          style={{
            background: 'none',
            border: 'none',
            color: title.trim() ? '#10B981' : '#A7F3D0',
            fontSize: '28px',
            fontWeight: 'bold',
            cursor: title.trim() ? 'pointer' : 'not-allowed',
            padding: '4px 8px',
            display: 'inline-flex',
            alignItems: 'center',
            lineHeight: 1,
            transition: 'color 0.2s',
          }}
        >
          ✓
        </button>
      </div>
        
        {/* GROUP NAME SECTION */}
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 850, color: 'var(--g)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Group Name
          </label>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {/* DP Upload Circle Container */}
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                background: '#FFFFFF',
                border: '1.5px dashed var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                overflow: 'hidden',
                position: 'relative',
                boxShadow: '0 4px 10px rgba(0,0,0,0.02)',
                flexShrink: 0,
                boxSizing: 'border-box',
              }}
            >
              {selectedEmoji && (selectedEmoji.startsWith('data:image/') || selectedEmoji.startsWith('http')) ? (
                <img
                  src={selectedEmoji}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  alt="Group DP"
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: '#94A3B8' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </div>

              <input
                ref={titleInputRef}
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setNameError('');
                }}
                placeholder="E.g. City Trip"
                required
                style={{
                  flex: 1,
                  height: '54px',
                  borderRadius: '16px',
                  background: '#FFFFFF',
                  border: nameError ? '2px solid #EF4444' : '1.5px solid var(--border)',
                  padding: '0 16px',
                  fontSize: '16px',
                  fontWeight: 700,
                  color: 'var(--t)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'Nunito',
                  marginTop: 0,
                }}
              />
            </div>
          {nameError && (
            <span style={{ fontSize: '11px', color: '#EF4444', fontWeight: 700, marginTop: '6px', display: 'block' }}>
              {nameError}
            </span>
          )}
        </div>

        {/* OPTIONS SECTION (CURRENCY) */}
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 850, color: 'var(--g)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Currency
          </label>
          <div
            onClick={() => setShowCurrencyPicker(true)}
            style={{
              borderRadius: '16px',
              background: '#FFFFFF',
              border: '1.5px solid var(--border)',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 4px 10px rgba(0,0,0,0.02)',
              cursor: 'pointer',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'var(--bg)',
                  border: '1.5px solid var(--border)',
                  color: 'var(--t)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  fontWeight: 900,
                  flexShrink: 0,
                  fontFamily: 'Nunito',
                }}
              >
                {currencyInfo?.s || '₹'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, alignItems: 'flex-start' }}>
                <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--t)', textAlign: 'left' }}>
                  {currencyInfo?.n || 'Indian Rupee'}
                </span>
                <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#A09586', marginTop: '2px', textAlign: 'left' }}>
                  {currencyInfo?.c || 'INR'} — {currencyInfo?.s || '₹'}
                </span>
              </div>
            </div>
            <span style={{ fontSize: '20px', color: '#CFC6BB', fontWeight: 900, userSelect: 'none' }}>›</span>
          </div>
        </div>

        {/* PARTICIPANTS SECTION */}
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 850, color: 'var(--g)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Friends
          </label>
          <div
            style={{
              borderRadius: '16px',
              background: '#FFFFFF',
              border: '1.5px solid var(--border)',
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              boxShadow: '0 4px 10px rgba(0,0,0,0.02)',
            }}
          >
            {participants.map((participant, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'var(--bg)',
                  borderRadius: '12px',
                  padding: '4px 12px',
                }}
              >
                <input
                  type="text"
                  value={index === 0 && participant === me ? userName : participant}
                  placeholder={index === 0 ? "Your name" : `Friend ${index + 1}`}
                  onChange={(e) => handleParticipantChange(index, e.target.value)}
                  disabled={index === 0} // First user is always yourself
                  style={{
                    flex: 1,
                    height: '36px',
                    border: 'none',
                    background: 'transparent',
                    outline: 'none',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: index === 0 ? 'var(--g)' : 'var(--t)',
                    fontFamily: 'Nunito',
                  }}
                />
                {index > 0 && participant.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      alert(`Please create the group "${title || 'Untitled'}" first! Once created, you will get a personalized invite link to share with ${participant}.`);
                    }}
                    style={{
                      background: 'rgba(59, 130, 246, 0.1)',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '5px 10px',
                      color: '#2563EB',
                      fontSize: '11px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      transition: '0.15s all ease',
                      whiteSpace: 'nowrap',
                      fontFamily: 'Nunito',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(59, 130, 246, 0.2)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)'; }}
                  >
                    🔗 Invite
                  </button>
                )}
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveParticipant(index)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#94A3B8',
                      fontSize: '16px',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}

            {/* Add Friend Button Link */}
            <button
              type="button"
              onClick={handleAddParticipant}
              style={{
                background: 'none',
                border: 'none',
                color: '#3B82F6',
                fontWeight: 800,
                fontSize: '13px',
                padding: '10px 12px',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'inline-flex',
                alignItems: 'center',
                fontFamily: 'Nunito',
              }}
            >
              + Add Friend
            </button>
          </div>
        </div>

      <SearchableCurrencyPicker
        show={showCurrencyPicker}
        onClose={() => setShowCurrencyPicker(false)}
        current={selectedCurrency}
        onSelect={(symbol) => {
          setSelectedCurrency(symbol);
          setShowCurrencyPicker(false);
        }}
      />
    </form>
  );
};
