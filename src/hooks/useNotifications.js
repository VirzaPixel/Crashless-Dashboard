import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useRole } from '../lib/roles';

const STORAGE_KEY = 'crashless_notifications_read';
const MAX_ITEMS = 30;

function loadReadIds() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistReadIds(ids) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(-200)));
  } catch {
    // Penyimpanan lokal tidak tersedia; abaikan.
  }
}

export function useNotifications() {
  const { session } = useRole();
  const userId = session?.user?.id ?? null;
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [readIds, setReadIds] = useState(loadReadIds);

  const fetchNotifications = useCallback(async () => {
    if (!userId) {
      setNotifications([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('operational_notification_queue')
        .select('id, damage_id, notification_type, title, body, payload, created_at')
        .order('created_at', { ascending: false })
        .limit(MAX_ITEMS);

      if (error) throw error;
      setNotifications(data || []);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void fetchNotifications();
    });
    return () => {
      cancelled = true;
    };
  }, [fetchNotifications]);

  useEffect(() => {
    if (!userId) return undefined;

    const channel = supabase
      .channel(`operator-notifications-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'operational_notification_queue',
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          setNotifications((prev) => [
            payload.new,
            ...prev.filter((item) => item.id !== payload.new.id),
          ].slice(0, MAX_ITEMS));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !readIds.includes(item.id)).length,
    [notifications, readIds],
  );

  const markRead = useCallback((id) => {
    setReadIds((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      persistReadIds(next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setReadIds((prev) => {
      const next = Array.from(new Set([...prev, ...notifications.map((item) => item.id)]));
      persistReadIds(next);
      return next;
    });
  }, [notifications]);

  return {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    markRead,
    markAllRead,
    isRead: (id) => readIds.includes(id),
  };
}
