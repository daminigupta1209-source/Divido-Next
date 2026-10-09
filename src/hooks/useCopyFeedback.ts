import { useState } from 'react';

// Copy a value and remember which field was copied for ~2s, so the UI can show
// "✓ Copied". Falls back to an alert with the value when the clipboard is unavailable.
export function useCopyFeedback() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copy = (key: string, value: string) => {
    if (!navigator.clipboard) {
      alert(value);
      return;
    }
    navigator.clipboard.writeText(value).then(
      () => {
        setCopiedKey(key);
        setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
      },
      () => alert(value)
    );
  };

  return { copiedKey, copy, reset: () => setCopiedKey(null) };
}
