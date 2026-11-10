// Link added to a "Send Reminder" message so the friend lands on the page the
// balance lives on. Pure module: the caller passes `origin`.
//
// - One real group  → `?joinGroupId=<id>`: a member lands straight on that
//   group's Activities tab (and a shared 1:1 thread shows under Non-Group);
//   someone not yet in it gets the normal join flow.
// - Non-Group only   → `?open=nongroup` (local STANDALONE balances have no
//   cloud id the friend could open).
// - Mixed / unknown  → the app home.

export const NON_GROUP_OPEN_PARAM = 'nongroup';

export interface ReminderItem {
  gId: string | number;
  /** True for STANDALONE and shared 1:1 (isDirect) threads, shown as "Non-Group". */
  nonGroup: boolean;
}

export const buildReminderLink = (origin: string, items: ReminderItem[]): string => {
  const targets = new Set(
    items.map((it) => (it.nonGroup ? NON_GROUP_OPEN_PARAM : `g:${it.gId}`)),
  );
  if (targets.size !== 1) return `${origin}/`;
  const [only] = targets;
  if (only === NON_GROUP_OPEN_PARAM) {
    // A shared 1:1 thread has a real id the friend is a member of; the join
    // flow already lands it on Non-Group, and works on their side too.
    const direct = items.find((it) => it.nonGroup && String(it.gId) !== 'STANDALONE');
    const allSameDirect = direct && items.every((it) => String(it.gId) === String(direct.gId));
    return allSameDirect
      ? `${origin}/?joinGroupId=${encodeURIComponent(String(direct.gId))}`
      : `${origin}/?open=${NON_GROUP_OPEN_PARAM}`;
  }
  return `${origin}/?joinGroupId=${encodeURIComponent(only.slice(2))}`;
};
