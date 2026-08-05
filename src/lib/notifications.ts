import { supabase } from './supabaseClient';

export type NotificationType =
  | 'group_add'
  | 'reminder'
  | 'payment_request'
  | 'link_request'
  | 'join'
  | 'rename_request'
  | 'admin_transfer'
  | 'removed';

export interface AppNotification {
  id: string | number;
  recipientEmail: string;
  type: NotificationType;
  title: string;
  body?: string;
  fromName?: string;
  fromEmail?: string;
  groupId?: string | number | null;
  amount?: number | null;
  currency?: string | null;
  isRead: boolean;
  createdAt: string;
}

const mapRow = (r: any): AppNotification => ({
  id: r.id,
  recipientEmail: r.recipient_email,
  type: r.type,
  title: r.title,
  body: r.body || undefined,
  fromName: r.from_name || undefined,
  fromEmail: r.from_email || undefined,
  groupId: r.group_id ?? null,
  amount: r.amount ?? null,
  currency: r.currency ?? null,
  isRead: !!r.is_read,
  createdAt: r.created_at,
});

// Fetch the most recent notifications for a recipient.
export const fetchNotifications = async (email: string): Promise<AppNotification[]> => {
  if (!email) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('recipient_email', email)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    console.error('Failed to load notifications:', error);
    return [];
  }
  return (data || []).map(mapRow);
};

// Mark every unread notification for this recipient as read.
export const markAllNotificationsRead = async (email: string): Promise<void> => {
  if (!email) return;
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('recipient_email', email)
    .eq('is_read', false);
  if (error) console.error('Failed to mark notifications read:', error);
};
// Delete all notifications for this user.
export const clearAllNotifications = async (email: string): Promise<void> => {
  if (!email) return;
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('recipient_email', email);
  if (error) console.error('Failed to clear notifications:', error);
};

// Insert a notification for another user. Fails softly so senders never break.
export const pushNotification = async (payload: {
  recipientEmail: string;
  type: NotificationType;
  title: string;
  body?: string;
  fromName?: string;
  fromEmail?: string;
  groupId?: string | number | null;
  amount?: number | null;
  currency?: string | null;
}): Promise<void> => {
  if (!payload.recipientEmail) return;
  const { error } = await supabase.from('notifications').insert({
    recipient_email: payload.recipientEmail,
    type: payload.type,
    title: payload.title,
    body: payload.body ?? null,
    from_name: payload.fromName ?? null,
    from_email: payload.fromEmail ?? null,
    group_id: payload.groupId ?? null,
    amount: payload.amount ?? null,
    currency: payload.currency ?? null,
    is_read: false,
  });
  if (error) console.error('Failed to push notification:', error);
};

// Subscribe to new notifications for a recipient in real time.
// Returns an unsubscribe function.
export const subscribeNotifications = (
  email: string,
  onInsert: (n: AppNotification) => void
): (() => void) => {
  if (!email) return () => {};
  const channel = supabase
    .channel(`notifications_${email}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_email=eq.${email}` },
      (payload) => onInsert(mapRow(payload.new))
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
};
