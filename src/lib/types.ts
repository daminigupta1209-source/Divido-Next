export interface Group {
  id: string | number;
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

export interface UserMetadata {
  upiId?: string;
  [key: string]: any;
}
