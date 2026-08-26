export interface Group {
  id: string | number;
  // True only for a group created on THIS device that has not yet been inserted
  // into the cloud. Set at creation, cleared once the group's row exists in
  // Supabase. Replaces the old "temp float id vs real DB int id" heuristic as the
  // signal for "needs a cloud insert" — the id itself is now a permanent UUID
  // that never changes. Client-only; never persisted to the database.
  pendingSync?: boolean;
  name: string;
  members: string[];
  currency: string;
  emoji?: string;
  simplifyDebts?: boolean;
  createdDate?: string; // date the group was formed (YYYY-MM-DD), editable
  pendingMembers?: string[]; // names of members who haven't joined yet
  pendingLinkRequests?: Array<{
    id: string;
    placeholderName: string;
    requestName: string;
    requestEmail: string;
  }>;
  // Hidden per-person identity for each member NAME in this group.
  // Value = person_id (for deliberately linked/separated placeholders) OR the
  // member's email (signed-in) OR the name itself (legacy, unlinked). Used only
  // for cross-group balance bucketing so two same-named people don't merge.
  memberIdentities?: Record<string, string>;
}

export interface PendingMatchPrompt {
  newMemberName: string;
  newMemberEmail: string;
  newMemberRecordId: string;
  groupId: string | number;
  groupName: string;
  pendingPlaceholders: { id: string; name: string }[];
}

export interface Expense {
  id: string | number;
  timestamp?: number;
  gId: string | number;
  title: string;
  amt: number;
  paid: string;
  date: string;
  mode?: 'Equally' | 'Unequally' | 'Percentage' | string;
  shares?: Record<string, number>;
  splitters?: string[];
  category?: string | null;
  currency?: string;
  notes?: string;
  attachments?: string[];
  isConversion?: boolean;
  isNormalization?: boolean;
  ratesUsed?: string;
  snapshot?: string;
  toCurr?: string;
  fromCurr?: string;
  origAmt?: number;
  origShares?: Record<string, number>;
  prevCurr?: string;
  isRecurring?: boolean;
  recurrence?: 'weekly' | 'monthly' | 'yearly' | 'none';
  nextOccurrence?: string;
  tags?: string[];
}

export interface ConfirmState {
  show: boolean;
  title?: string;
  desc?: string;
  onConfirm?: (() => void) | null;
  type?: 'danger' | 'logout' | 'success' | 'info' | 'warning';
  confirmText?: string;
  cancelText?: string;
}

export interface GlobalSettleData {
  name: string;
  gId?: string | number | null;
  identity?: string;
  groups?: string[];
  balances?: Record<string, number>;
}

export interface UserMetadata {
  upiId?: string;
  [key: string]: any;
}
