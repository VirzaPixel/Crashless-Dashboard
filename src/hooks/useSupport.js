import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useRole } from '../lib/roles';
import { normalizeRoadDamage } from '../lib/roadDamage';

const SUPPORT_BUCKET = 'support-attachments';

export function useSupport() {
  const { session } = useRole();
  const userId = session?.user?.id ?? null;
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const loadConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('crashless_list_support_conversations');
      if (rpcError) throw rpcError;
      setConversations(data || []);
      setError('');
    } catch (err) {
      setConversations([]);
      setError(err.message || 'Gagal memuat percakapan pusat bantuan.');
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId) => {
    if (!conversationId) return;
    setLoadingMessages(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('crashless_get_support_messages', {
        p_conversation_id: conversationId,
      });
      if (rpcError) throw rpcError;
      setMessages(data || []);
      await supabase.rpc('crashless_mark_support_read', { p_conversation_id: conversationId });
    } catch (err) {
      setMessages([]);
      setError(err.message || 'Gagal memuat pesan.');
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const openConversation = useCallback(async (conversationId) => {
    setActiveId(conversationId);
    await loadMessages(conversationId);
  }, [loadMessages]);

  const sendMessage = useCallback(async ({ body, imageUrl, damageId }) => {
    if (!activeId) return;
    setSending(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('crashless_send_support_message', {
        p_conversation_id: activeId,
        p_body: body?.trim() ? body.trim() : null,
        p_image_url: imageUrl ?? null,
        p_damage_id: damageId ?? null,
      });
      if (rpcError) throw rpcError;
      if (data) {
        setMessages((prev) => (prev.some((item) => item.id === data.id) ? prev : [...prev, data]));
      }
      void loadConversations();
      setError('');
    } finally {
      setSending(false);
    }
  }, [activeId, loadConversations]);

  const uploadImage = useCallback(async (file) => {
    if (!file) return null;
    if (!file.type.startsWith('image/')) {
      throw new Error('Hanya berkas gambar yang diperbolehkan.');
    }
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${userId || 'anon'}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(SUPPORT_BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from(SUPPORT_BUCKET).getPublicUrl(path);
    return data?.publicUrl ?? null;
  }, [userId]);

  const disciplinaryAction = useCallback(async (operatorId, action, days, reason) => {
    const { error: rpcError } = await supabase.rpc('crashless_operator_disciplinary_action', {
      p_operator_id: operatorId,
      p_action: action,
      p_days: days ?? null,
      p_reason: reason ?? null,
    });
    if (rpcError) throw rpcError;
  }, []);

  const reopenReport = useCallback(async (damageId, reason) => {
    const { error: rpcError } = await supabase.rpc('crashless_reopen_report', {
      p_damage_id: damageId,
      p_reason: reason ?? null,
    });
    if (rpcError) throw rpcError;
  }, []);

  const fetchReportContext = useCallback(async (damageId) => {
    if (!damageId) return null;
    try {
      const { data, error: selectError } = await supabase
        .from('road_damages')
        .select('*')
        .eq('id', damageId)
        .maybeSingle();

      if (selectError) {
        console.error('fetchReportContext error:', selectError);
        return null;
      }
      if (!data) return null;

      const profileIds = [
        ...new Set([data.user_id, data.assigned_operator_id, data.verified_by].filter(Boolean)),
      ];
      let profileMap = new Map();
      if (profileIds.length) {
        try {
          const { data: profs } = await supabase
            .from('user_profiles')
            .select('id, email, domicile, role, is_active, is_banned, suspended_until, rating_average')
            .in('id', profileIds);
          if (profs) {
            profileMap = new Map(profs.map((p) => [p.id, p]));
          }
        } catch (e) {
          console.warn('Gagal memuat profil terkait:', e);
        }
      }

      let recentEvents = [];
      try {
        const { data: events } = await supabase
          .from('damage_status_events')
          .select('id, created_at, from_status, to_status, note, audience, event_type, actor_id')
          .eq('damage_id', damageId)
          .order('created_at', { ascending: false })
          .limit(6);
        if (events) {
          recentEvents = events.map((ev) => ({
            ...ev,
            actor_email: profileMap.get(ev.actor_id)?.email || 'Sistem',
          }));
        }
      } catch (e) {
        console.warn('Gagal memuat riwayat status event:', e);
      }

      const normalized = normalizeRoadDamage(data);
      const operator =
        profileMap.get(data.assigned_operator_id) || profileMap.get(data.verified_by) || null;
      const reporter = profileMap.get(data.user_id) || null;

      return {
        ...normalized,
        operator,
        reporter,
        recent_events: recentEvents,
      };
    } catch (err) {
      console.error('Error in fetchReportContext:', err);
      return null;
    }
  }, []);

  const fetchUserReports = useCallback(async (ownerUserId) => {
    if (!ownerUserId) return [];
    const { data } = await supabase
      .from('road_damages')
      .select('id, address, domicile, workflow_status, created_at')
      .eq('user_id', ownerUserId)
      .order('created_at', { ascending: false })
      .limit(30);
    return data || [];
  }, []);

  const fetchOperator = useCallback(async (operatorId) => {
    if (!operatorId) return null;
    const { data } = await supabase
      .from('user_profiles')
      .select('id, email, domicile, is_banned, suspended_until')
      .eq('id', operatorId)
      .maybeSingle();
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void loadConversations();
    });
    return () => {
      cancelled = true;
    };
  }, [loadConversations]);

  useEffect(() => {
    if (!userId) return undefined;

    const channel = supabase
      .channel('support-center-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_messages' },
        (payload) => {
          const incoming = payload.new;
          if (incoming?.conversation_id && incoming.conversation_id === activeIdRef.current) {
            setMessages((prev) => (
              prev.some((item) => item.id === incoming.id) ? prev : [...prev, incoming]
            ));
          }
          void loadConversations();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'support_conversations' },
        () => {
          void loadConversations();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, loadConversations]);

  return {
    conversations,
    messages,
    activeId,
    loadingConversations,
    loadingMessages,
    sending,
    error,
    loadConversations,
    openConversation,
    sendMessage,
    uploadImage,
    disciplinaryAction,
    reopenReport,
    fetchReportContext,
    fetchUserReports,
    fetchOperator,
  };
}
