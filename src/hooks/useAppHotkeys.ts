import { useEffect } from 'react';
import { escManager } from '../lib/escManager';
import { Group } from '../lib/types';

interface UseAppHotkeysProps {
  groups: Group[];
  showMembersHealth: boolean;
  setShowMembersHealth: (show: boolean) => void;
  showDeleteAccountModal: boolean;
  setShowDeleteAccountModal: (show: boolean) => void;
  setFeedback: (feedback: string) => void;
  globalSettleData: { name: string; gId?: string | number | null } | null;
  setGlobalSettleData: (data: any) => void;
  localSettleEdits: any[];
  me: string;
}

export function useAppHotkeys({
  groups,
  showMembersHealth,
  setShowMembersHealth,
  showDeleteAccountModal,
  setShowDeleteAccountModal,
  setFeedback,
  globalSettleData,
  setGlobalSettleData,
  localSettleEdits,
  me,
}: UseAppHotkeysProps) {

  // Esc key registration for Members Health overlay
  useEffect(() => {
    if (showMembersHealth) {
      const unregister = escManager.register(() => {
        setShowMembersHealth(false);
      });
      return unregister;
    }
  }, [showMembersHealth, setShowMembersHealth]);

  // Esc key registration for Delete Account Modal
  useEffect(() => {
    if (showDeleteAccountModal) {
      const unregister = escManager.register(() => {
        setShowDeleteAccountModal(false);
        setFeedback('');
      });
      return unregister;
    }
  }, [showDeleteAccountModal, setShowDeleteAccountModal, setFeedback]);

  // Focus and key navigation for Delete Account Modal
  useEffect(() => {
    if (!showDeleteAccountModal) return;

    setTimeout(() => {
      document.getElementById('delete-feedback-textarea')?.focus();
    }, 50);

    const handleKey = (e: KeyboardEvent) => {
      if (
        e.key === 'ArrowDown' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowRight' ||
        e.key === 'ArrowLeft'
      ) {
        const activeEl = document.activeElement;
        const elements = ['delete-feedback-textarea', 'delete-cancel-btn', 'delete-confirm-btn'];
        const existingIds = elements.filter((id) => document.getElementById(id));

        if (activeEl) {
          const idx = existingIds.indexOf(activeEl.id);
          if (idx !== -1) {
            e.preventDefault();
            const isNext = e.key === 'ArrowDown' || e.key === 'ArrowRight';
            let nextIdx = isNext ? idx + 1 : idx - 1;
            if (nextIdx < 0) nextIdx = existingIds.length - 1;
            if (nextIdx >= existingIds.length) nextIdx = 0;
            const nextEl = document.getElementById(existingIds[nextIdx]);
            nextEl?.focus();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showDeleteAccountModal]);

  // Esc key registration for Global Settle Popup
  useEffect(() => {
    if (globalSettleData) {
      const unregister = escManager.register(() => {
        setGlobalSettleData(null);
      });
      return unregister;
    }
  }, [globalSettleData, setGlobalSettleData]);

  // Focus and key navigation for Global Settle Popup
  useEffect(() => {
    if (!globalSettleData) return;

    setTimeout(() => {
      const firstInput =
        document.getElementById('global-settle-val-0') ||
        document.getElementById('global-settle-submit-btn');
      firstInput?.focus();
    }, 50);

    const handleKey = (e: KeyboardEvent) => {
      if (
        e.key === 'ArrowDown' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowRight' ||
        e.key === 'ArrowLeft'
      ) {
        const activeEl = document.activeElement;
        const elements = localSettleEdits.flatMap((_, idx) => [
          `global-settle-check-${idx}`,
          `global-settle-val-${idx}`,
        ]);
        elements.push('global-settle-cancel-btn');
        elements.push('global-settle-submit-btn');

        const existingIds = elements.filter((id) => document.getElementById(id));

        if (activeEl) {
          const idx = existingIds.indexOf(activeEl.id);
          if (idx !== -1) {
            e.preventDefault();
            const isNext = e.key === 'ArrowDown' || e.key === 'ArrowRight';
            let nextIdx = isNext ? idx + 1 : idx - 1;
            if (nextIdx < 0) nextIdx = existingIds.length - 1;
            if (nextIdx >= existingIds.length) nextIdx = 0;
            const nextEl = document.getElementById(existingIds[nextIdx]);
            nextEl?.focus();
            if (nextEl?.tagName === 'INPUT') (nextEl as HTMLInputElement).select();
          }
        }
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        const activeEl = document.activeElement;
        if (activeEl && activeEl.id.startsWith('global-settle-check-')) {
          e.preventDefault();
          (activeEl as HTMLElement).click();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [globalSettleData, localSettleEdits]);

  // Handle numpad keys even when NumLock is OFF (e.g. key becomes arrow/nav keys but code remains NumpadX)
  useEffect(() => {
    const handleGlobalNumpad = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        const code = e.code;
        if (code && code.startsWith('Numpad') && code !== 'NumpadEnter') {
          const numpadMap: Record<string, string> = {
            Numpad0: '0',
            Numpad1: '1',
            Numpad2: '2',
            Numpad3: '3',
            Numpad4: '4',
            Numpad5: '5',
            Numpad6: '6',
            Numpad7: '7',
            Numpad8: '8',
            Numpad9: '9',
            NumpadDecimal: '.',
          };
          const mappedValue = numpadMap[code];
          if (mappedValue !== undefined) {
            const isNumLockOn = /^[0-9.]$/.test(e.key);
            if (!isNumLockOn) {
              e.preventDefault();
              e.stopPropagation();

              const input = activeEl as HTMLInputElement | HTMLTextAreaElement;
              let start: number | null = null;
              let end: number | null = null;
              try {
                start = input.selectionStart;
                end = input.selectionEnd;
              } catch (err) {}

              const val = input.value || '';
              let newVal = '';
              let newCursorPos: number | null = null;
              if (start !== null && end !== null) {
                newVal = val.substring(0, start) + mappedValue + val.substring(end);
                newCursorPos = start + mappedValue.length;
              } else {
                newVal = val + mappedValue;
              }

              // Retrieve the native browser setter (bypassing React's overridden setter wrapper)
              let nativeSetter: ((v: string) => void) | undefined;
              try {
                const iframe = document.createElement('iframe');
                iframe.style.display = 'none';
                document.body.appendChild(iframe);
                const win = iframe.contentWindow as any;
                if (win) {
                  const proto =
                    input.tagName === 'TEXTAREA'
                      ? win.HTMLTextAreaElement.prototype
                      : win.HTMLInputElement.prototype;
                  nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
                }
                document.body.removeChild(iframe);
              } catch (err) {
                // Fallback to local constructor prototype if iframe is blocked
                nativeSetter = Object.getOwnPropertyDescriptor(input.constructor.prototype, 'value')?.set;
              }

              if (nativeSetter) {
                nativeSetter.call(input, newVal);
              } else {
                input.value = newVal;
              }

              if (newCursorPos !== null) {
                try {
                  input.setSelectionRange(newCursorPos, newCursorPos);
                } catch (err) {}
              }

              // Dispatch both 'input' and 'change' events to guarantee React state updates
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        }
      }
    };
    window.addEventListener('keydown', handleGlobalNumpad, { capture: true });
    return () => window.removeEventListener('keydown', handleGlobalNumpad, { capture: true });
  }, []);

  // Arrow navigation & focus navigation for non-modal views
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.querySelector('.modal-overlay, .premium-confirm-overlay')) {
        return;
      }

      if (
        e.key === 'ArrowDown' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowRight' ||
        e.key === 'ArrowLeft'
      ) {
        const activeEl = document.activeElement;
        if (
          activeEl &&
          (activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'SELECT' ||
            activeEl.tagName === 'TEXTAREA' ||
            (activeEl as HTMLElement).contentEditable === 'true')
        ) {
          return;
        }

        const focusables = Array.from(
          document.querySelectorAll('.nav-btn, .group-item, .card[tabindex="0"], .btn-green, .btn-yellow, .btn-red')
        ) as HTMLElement[];
        if (focusables.length > 0) {
          const idx = focusables.indexOf(activeEl as HTMLElement);
          e.preventDefault();
          let nextIdx;
          if (idx === -1) {
            nextIdx = 0;
          } else {
            const isNext = e.key === 'ArrowDown' || e.key === 'ArrowRight';
            nextIdx = isNext ? idx + 1 : idx - 1;
            if (nextIdx < 0) nextIdx = focusables.length - 1;
            if (nextIdx >= focusables.length) nextIdx = 0;
          }
          if (nextIdx >= 0 && nextIdx < focusables.length) {
            focusables[nextIdx].focus();
          }
        }
        return;
      }

      if (e.key === 'Enter' || e.key === ' ') {
        const activeEl = document.activeElement;
        if (
          activeEl &&
          (activeEl.classList.contains('group-item') ||
            activeEl.classList.contains('nav-btn') ||
            activeEl.classList.contains('card'))
        ) {
          e.preventDefault();
          (activeEl as HTMLElement).click();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [groups]);
}
