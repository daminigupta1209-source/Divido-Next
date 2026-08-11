import React, { useState, useRef, useEffect } from 'react';
import { worldCurrencies } from '../lib/utils';
import { Group } from '../lib/types';

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
  const [selectedEmoji, setSelectedEmoji] = useState('🏘️');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState(myDefaultCurrency || '₹');
  const [participants, setParticipants] = useState<string[]>([me]);
  const [nameError, setNameError] = useState('');

  const titleInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Autofocus title input on mount
  useEffect(() => {
    setTimeout(() => {
      titleInputRef.current?.focus();
    }, 100);
  }, []);

  // Close emoji picker when clicking outside
  useEffect(() => {
    const clickOutside = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    window.addEventListener('click', clickOutside);
    return () => window.removeEventListener('click', clickOutside);
  }, []);

  const popularEmojis = ['🏘️', '✈️', '🍻', '🍔', '🚗', '🛒', '⛺', '🏠', '💸', '🎟️', '🎒', '🍕', '🎉', '🏖️', '⛰️', '💡'];

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
    <div className="content-width-limit" style={{ padding: '20px 16px', boxSizing: 'border-box' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <button
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

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* TITLE SECTION */}
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 850, color: 'var(--g)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Title
          </label>
          <div style={{ display: 'flex', gap: '12px', position: 'relative' }}>
            {/* Emoji Box Trigger */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                setShowEmojiPicker(!showEmojiPicker);
              }}
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '16px',
                background: 'var(--card-bg)',
                border: '1.5px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                cursor: 'pointer',
                userSelect: 'none',
                boxShadow: '0 4px 10px rgba(0,0,0,0.02)',
              }}
            >
              {selectedEmoji}
            </div>

            {/* Emoji Picker Popover */}
            {showEmojiPicker && (
              <div
                ref={emojiPickerRef}
                style={{
                  position: 'absolute',
                  top: '64px',
                  left: 0,
                  background: 'var(--w)',
                  border: '1.5px solid var(--border)',
                  borderRadius: '16px',
                  padding: '12px',
                  zIndex: 2000,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '8px',
                  boxShadow: '0 12px 30px rgba(0,0,0,0.1)',
                }}
              >
                {popularEmojis.map((emoji) => (
                  <div
                    key={emoji}
                    onClick={() => {
                      setSelectedEmoji(emoji);
                      setShowEmojiPicker(false);
                    }}
                    style={{
                      fontSize: '24px',
                      padding: '6px',
                      cursor: 'pointer',
                      borderRadius: '8px',
                      textAlign: 'center',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                  >
                    {emoji}
                  </div>
                ))}
              </div>
            )}

            {/* Text Input */}
            <div style={{ flex: 1 }}>
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
                  width: '100%',
                  height: '54px',
                  borderRadius: '16px',
                  background: 'var(--card-bg)',
                  border: nameError ? '2px solid #EF4444' : '1.5px solid var(--border)',
                  padding: '0 16px',
                  fontSize: '16px',
                  fontWeight: 700,
                  color: 'var(--t)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  fontFamily: 'Nunito',
                }}
              />
              {nameError && (
                <span style={{ fontSize: '11px', color: '#EF4444', fontWeight: 700, marginTop: '4px', display: 'block' }}>
                  {nameError}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* OPTIONS SECTION (CURRENCY) */}
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 850, color: 'var(--g)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Options
          </label>
          <div
            style={{
              borderRadius: '16px',
              background: 'var(--card-bg)',
              border: '1.5px solid var(--border)',
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 4px 10px rgba(0,0,0,0.02)',
            }}
          >
            <span style={{ fontSize: '14px', fontWeight: 750, color: 'var(--t)' }}>Currency</span>
            <select
              value={selectedCurrency}
              onChange={(e) => setSelectedCurrency(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                outline: 'none',
                color: 'var(--t)',
                fontWeight: 800,
                fontSize: '14px',
                cursor: 'pointer',
                textAlign: 'right',
                fontFamily: 'Nunito',
                direction: 'rtl', // pushes select text to right
              }}
            >
              {worldCurrencies.map((c) => (
                <option key={c.s + c.c} value={c.s} style={{ direction: 'ltr', background: 'var(--w)', color: 'var(--t)' }}>
                  {c.n} ({c.s})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* PARTICIPANTS SECTION */}
        <div>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 850, color: 'var(--g)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Participants
          </label>
          <div
            style={{
              borderRadius: '16px',
              background: 'var(--card-bg)',
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
                  placeholder={index === 0 ? "Your name" : `Participant ${index + 1}`}
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

            {/* Add Participant Button Link */}
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
              + Add Participant
            </button>
          </div>
        </div>

        {/* CREATE BUTTON */}
        <button
          type="submit"
          disabled={!title.trim()}
          style={{
            height: '52px',
            borderRadius: '16px',
            background: title.trim() ? '#3B82F6' : '#93C5FD',
            color: '#FFFFFF',
            border: 'none',
            fontWeight: 850,
            fontSize: '15px',
            cursor: title.trim() ? 'pointer' : 'not-allowed',
            boxShadow: title.trim() ? '0 10px 20px rgba(59, 130, 246, 0.3)' : 'none',
            transition: 'all 0.2s',
            marginTop: '12px',
            fontFamily: 'Nunito',
          }}
        >
          Create Group
        </button>

      </form>
    </div>
  );
};
