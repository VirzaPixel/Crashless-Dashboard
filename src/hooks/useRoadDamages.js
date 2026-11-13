import { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { compressImage } from '../lib/imageCompression';
import { normalizeRoadDamage } from '../lib/roadDamage';

const WORKFLOW_MIGRATION_ERROR =
  'Data laporan tidak dapat dimuat karena konfigurasi sistem belum lengkap. Silakan hubungi administrator sistem.';

function getWorkflowError(error) {
  const message = error?.message || '';
  const missingWorkflowColumn =
    error?.code === 'PGRST204' ||
    /workflow_status|priority|due_at|repair_notes|verification_notes|fixed_photo/i.test(message);

  return missingWorkflowColumn
    ? new Error(WORKFLOW_MIGRATION_ERROR)
    : error;
}

export function useRoadDamages() {
  const [damages, setDamages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const listRequestRef = useRef(0);
  const detailRequestRef = useRef(0);

  const cancelOverdueReports = useCallback(async () => {
    try {
      await supabase.rpc('crashless_cancel_overdue_reports');
    } catch (err) {
      console.warn('Auto-cancel laporan lewat tenggat gagal dijalankan:', err?.message || err);
    }
    try {
      await supabase.rpc('crashless_auto_assign_pending_reports');
    } catch (err) {
      console.warn('Auto-assign laporan pending gagal dijalankan:', err?.message || err);
    }
  }, []);

  const fetchDamages = useCallback(async () => {
    await cancelOverdueReports();
    const requestId = ++listRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('road_damages')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw getWorkflowError(fetchError);
      const operatorIds = [...new Set((data || []).map((row) => row.assigned_operator_id).filter(Boolean))];
      const reporterIds = [...new Set((data || []).map((row) => row.user_id).filter(Boolean))];
      const profileIds = [...new Set([...operatorIds, ...reporterIds])];
      const profiles = profileIds.length
        ? await supabase.from('user_profiles').select('id,email').in('id', profileIds)
        : { data: [], error: null };
      if (profiles.error) throw profiles.error;
      const profileEmails = new Map((profiles.data || []).map((profile) => [profile.id, profile.email]));
      if (requestId === listRequestRef.current) {
        setDamages((data || []).map((row) => normalizeRoadDamage({
          ...row,
          assigned_operator_name: profileEmails.get(row.assigned_operator_id) || null,
          reporter_email: profileEmails.get(row.user_id) || null,
        })));
      }
    } catch (err) {
      const normalizedError = getWorkflowError(err);
      if (requestId === listRequestRef.current) {
        setError(normalizedError.message);
      }
      console.error('Error fetching road damages:', normalizedError);
    } finally {
      if (requestId === listRequestRef.current) {
        setLoading(false);
      }
    }
  }, [cancelOverdueReports]);

  const fetchDamageById = useCallback(async (id) => {
    await cancelOverdueReports();
    const requestId = ++detailRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('road_damages')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (fetchError) throw getWorkflowError(fetchError);
      if (!data) return null;
      const relatedIds = [...new Set([data.assigned_operator_id, data.user_id].filter(Boolean))];
      const profiles = relatedIds.length
        ? await supabase.from('user_profiles').select('id,email').in('id', relatedIds)
        : { data: [], error: null };
      if (profiles.error) throw profiles.error;
      const profileEmails = new Map((profiles.data || []).map((profile) => [profile.id, profile.email]));
      return normalizeRoadDamage({
        ...data,
        assigned_operator_name: profileEmails.get(data.assigned_operator_id) ?? null,
        reporter_email: profileEmails.get(data.user_id) ?? null,
      });
    } catch (err) {
      const normalizedError = getWorkflowError(err);
      if (requestId === detailRequestRef.current) {
        setError(normalizedError.message);
      }
      console.error(`Error fetching road damage by id (${id}):`, normalizedError);
      return null;
    } finally {
      if (requestId === detailRequestRef.current) {
        setLoading(false);
      }
    }
  }, [cancelOverdueReports]);

  const claimDamage = useCallback(async (id) => {
    const { data, error: claimError } = await supabase.rpc('crashless_claim_damage', { p_damage_id: id });
    if (claimError) throw claimError;
    return normalizeRoadDamage(data);
  }, []);

  const fetchOperationalData = useCallback(async (id) => {
    const [eventsResult, conversationResult, reviewsResult, scoresResult, extensionsResult] = await Promise.all([
      supabase.from('damage_status_events').select('id,actor_id,from_status,to_status,note,audience,event_type,created_at').eq('damage_id', id).order('created_at'),
      supabase.from('report_conversations').select('id').eq('damage_id', id).maybeSingle(),
      supabase.from('damage_reviews').select('stars,comment,operator_id,created_at').eq('damage_id', id).maybeSingle(),
      supabase.from('operator_score_events').select('id,score_delta,event_type,reason,dispute_status,dispute_reason,resolution_note,created_at').eq('damage_id', id).order('created_at', { ascending: false }),
      supabase.from('due_date_extensions').select('id,damage_id,old_due_at,requested_due_at,reason,requested_by,requested_at,status,decided_by,decided_at,decision_note').eq('damage_id', id).order('requested_at', { ascending: false }),
    ]);
    const operatorIds = [...new Set([
      ...(eventsResult.data || []).map((event) => event.actor_id),
      reviewsResult.data?.operator_id,
      ...(extensionsResult.data || []).flatMap((extension) => [extension.requested_by, extension.decided_by]),
    ].filter(Boolean))];
    const profilesResult = operatorIds.length
      ? await supabase.from('user_profiles').select('id,email').in('id', operatorIds)
      : { data: [], error: null };
    const failure = [eventsResult, conversationResult, reviewsResult, scoresResult, extensionsResult, profilesResult].find((result) => result.error);
    if (failure) throw failure.error;
    const names = new Map((profilesResult.data || []).map((profile) => [profile.id, profile.email]));
    return {
      events: (eventsResult.data || []).map((event) => ({ ...event, actor_name: names.get(event.actor_id) || 'Operator' })),
      conversation: conversationResult.data,
      review: reviewsResult.data ? { ...reviewsResult.data, operator_name: names.get(reviewsResult.data.operator_id) || 'Operator' } : null,
      scoreEvents: scoresResult.data ?? [],
      extensions: (extensionsResult.data || []).map((extension) => ({
        ...extension,
        requested_by_name: names.get(extension.requested_by) || 'Operator',
        decided_by_name: names.get(extension.decided_by) || null,
      })),
      operatorNames: names,
    };
  }, []);

  const fetchMessages = useCallback(async (damageId) => {
    const { data, error: messagesError } = await supabase.rpc('crashless_get_report_messages', {
      p_damage_id: damageId,
    });
    if (messagesError) throw messagesError;
    return data || [];
  }, []);

  const markConversationRead = useCallback(async (conversationId) => {
    const { error } = await supabase.rpc('crashless_mark_conversation_read', { p_conversation_id: conversationId });
    if (error) throw error;
  }, []);

  const sendMessage = useCallback(async (damageId, body) => {
    const { error } = await supabase.rpc('crashless_send_report_message', {
      p_damage_id: damageId,
      p_body: body.trim(),
    });
    if (error) throw error;
  }, []);

  const ensureConversation = useCallback(async (damageId) => {
    const { data, error } = await supabase.rpc('crashless_ensure_conversation', { p_damage_id: damageId });
    if (error) throw error;
    return { id: data };
  }, []);

  const addProgressNote = useCallback(async (damageId, note, audience = 'user') => {
    const { error } = await supabase.rpc('crashless_add_progress', {
      p_damage_id: damageId,
      p_note: note.trim(),
      p_audience: audience,
      p_to_status: null,
    });
    if (error) throw error;
  }, []);

  const submitReview = useCallback(async (damageId, stars, comment) => {
    const { error } = await supabase.rpc('crashless_submit_review', {
      p_damage_id: damageId,
      p_stars: stars,
      p_comment: comment.trim() || null,
    });
    if (error) throw error;
  }, []);

  const rejectDamage = useCallback(async (damageId, category, reason, resubmissionAllowed = true) => {
    const { data, error } = await supabase.rpc('crashless_verify_repair', {
      p_damage_id: damageId,
      p_approved: false,
      p_category: category,
      p_reason: reason.trim(),
      p_resubmission_allowed: resubmissionAllowed,
    });
    if (error) throw error;
    return normalizeRoadDamage(data);
  }, []);

  const rejectReport = useCallback(async (damageId, category, reason, resubmissionAllowed = true) => {
    const { data, error } = await supabase.rpc('crashless_reject_report', {
      p_damage_id: damageId,
      p_category: category,
      p_reason: reason.trim(),
      p_resubmission_allowed: resubmissionAllowed,
    });
    if (error) throw error;
    return normalizeRoadDamage(data);
  }, []);

  const reassignDamage = useCallback(async (damageId, operatorId, reason) => {
    const { error } = await supabase.rpc('crashless_reassign_damage', { p_damage_id: damageId, p_operator_id: operatorId, p_reason: reason.trim() });
    if (error) throw error;
  }, []);

  const requestDueExtension = useCallback(async (damageId, newDueAt, reason) => {
    const { data, error } = await supabase.rpc('crashless_request_due_extension', {
      p_damage_id: damageId,
      p_new_due_at: newDueAt,
      p_reason: reason.trim(),
    });
    if (error) throw error;
    return data;
  }, []);

  const decideDueExtension = useCallback(async (extensionId, approve, note) => {
    const { error } = await supabase.rpc('crashless_decide_due_extension', {
      p_extension_id: extensionId,
      p_approve: approve,
      p_note: note?.trim() || null,
    });
    if (error) throw error;
  }, []);

  const disputeScoreEvent = useCallback(async (eventId, reason) => {
    const { error } = await supabase.rpc('crashless_dispute_score_event', {
      p_event_id: eventId,
      p_reason: reason.trim(),
    });
    if (error) throw error;
  }, []);

  const resolveScoreEvent = useCallback(async (eventId, reverse, note) => {
    const { error } = await supabase.rpc('crashless_resolve_score_event', {
      p_event_id: eventId,
      p_reverse: reverse,
      p_note: note.trim(),
    });
    if (error) throw error;
  }, []);

  const uploadPhoto = useCallback(async (file, onStage) => {
    if (!file) return null;

    onStage?.('compress');
    const compressed = await compressImage(file);

    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
    const filePath = `fixed_photos/${fileName}`;

    onStage?.('upload');
    const { error: uploadError } = await supabase.storage
      .from('road-damage-images')
      .upload(filePath, compressed, {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage
      .from('road-damage-images')
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
  }, []);

  const updateWorkflow = useCallback(async (id, values, expectedStatuses) => {
    const expectedList = expectedStatuses
      ? (Array.isArray(expectedStatuses) ? expectedStatuses : [expectedStatuses])
      : null;

    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session) {
      throw new Error(
        'Sesi Anda telah berakhir. Silakan keluar lalu masuk kembali.',
      );
    }
    const sessionRole = sessionData.session.user?.app_metadata?.role;
    if (sessionRole && sessionRole !== 'admin' && sessionRole !== 'superadmin') {
      throw new Error(
        'Akun Anda tidak memiliki kewenangan untuk memperbarui status laporan. Hubungi Super Operator untuk mengatur peran akses Anda.',
      );
    }

    const { data: current, error: readError } = await supabase
      .from('road_damages')
      .select('id, workflow_status')
      .eq('id', id)
      .maybeSingle();
    if (readError) throw getWorkflowError(readError);
    if (!current) {
      throw new Error(
        'Laporan tidak ditemukan atau tidak bisa dibaca dengan sesi ini.',
      );
    }
    if (expectedList && !expectedList.includes(current.workflow_status)) {
      throw new Error(
        `Status laporan sudah berubah (saat ini: ${current.workflow_status}). Muat ulang halaman sebelum mencoba lagi.`,
      );
    }

    const query = supabase
      .from('road_damages')
      .update(values)
      .eq('id', id);

    if (expectedList) {
      query.in('workflow_status', expectedList);
    }

    const { data, error: updateError } = await query.select().maybeSingle();
    if (updateError) {
      console.error('Supabase updateWorkflow failed:', {
        code: updateError.code,
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint,
      });
      throw getWorkflowError(updateError);
    }
    if (!data) {
      const { data: after } = await supabase
        .from('road_damages')
        .select('workflow_status')
        .eq('id', id)
        .maybeSingle();
      if (after && expectedList && !expectedList.includes(after.workflow_status)) {
        throw new Error(
          'Status laporan telah diperbarui oleh pengguna lain. Muat ulang halaman sebelum mencoba kembali.',
        );
      }
      throw new Error(
        'Perubahan tidak dapat disimpan. Pastikan Anda memiliki kewenangan operator, muat ulang halaman, lalu coba kembali. Jika masalah berlanjut, hubungi administrator sistem.',
      );
    }
    return normalizeRoadDamage(data);
  }, []);

  const startRepair = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try {
      return await updateWorkflow(
        id,
        { workflow_status: 'in_progress' },
        ['pending', 'rejected'],
      );
    } catch (err) {
      const normalizedError = getWorkflowError(err);
      setError(normalizedError.message);
      throw normalizedError;
    } finally {
      setLoading(false);
    }
  }, [updateWorkflow]);

  const markAsFixed = useCallback(async (id, { files, fixedAt, repairNotes, onStage }) => {
    setLoading(true);
    setError(null);
    try {
      if (!files || files.length < 3) {
        throw new Error('Minimal harus mengunggah 3 foto dokumentasi perbaikan.');
      }

      const photoUrls = await Promise.all(
        Array.from(files).slice(0, 3).map((file) => uploadPhoto(file, onStage)),
      );

      if (photoUrls.some((url) => !url)) {
        throw new Error('Gagal mengunggah satu atau lebih foto dokumentasi.');
      }

      const { data, error } = await supabase.rpc('crashless_mark_fixed', {
        p_damage_id: id,
        p_photo_1: photoUrls[0],
        p_photo_2: photoUrls[1],
        p_photo_3: photoUrls[2],
        p_repair_notes: repairNotes?.trim() || null,
        p_fixed_at: fixedAt || new Date().toISOString(),
      });
      if (error) throw error;
      return normalizeRoadDamage(data);
    } catch (err) {
      const normalizedError = getWorkflowError(err);
      setError(normalizedError.message);
      console.error('Error marking road damage as fixed:', normalizedError);
      throw normalizedError;
    } finally {
      setLoading(false);
    }
  }, [uploadPhoto]);

  const verifyRepair = useCallback(async (id, { approved, verificationNotes, category, resubmissionAllowed = true }) => {
    setLoading(true);
    setError(null);
    try {
      if (!approved && (!category || !verificationNotes?.trim())) {
        throw new Error('Kategori dan alasan wajib diisi saat menolak laporan.');
      }

      const { data, error } = await supabase.rpc('crashless_verify_repair', {
        p_damage_id: id,
        p_approved: approved,
        p_category: approved ? null : category,
        p_reason: verificationNotes?.trim() || null,
        p_resubmission_allowed: approved ? false : resubmissionAllowed,
      });
      if (error) throw error;
      return normalizeRoadDamage(data);
    } catch (err) {
      const normalizedError = getWorkflowError(err);
      setError(normalizedError.message);
      console.error('Error verifying road damage repair:', normalizedError);
      throw normalizedError;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    damages,
    loading,
    error,
    fetchDamages,
    fetchDamageById,
    cancelOverdueReports,
    startRepair,
    markAsFixed,
    verifyRepair,
    claimDamage,
    fetchOperationalData,
    fetchMessages,
    sendMessage,
    ensureConversation,
    addProgressNote,
    submitReview,
    rejectDamage,
    rejectReport,
    reassignDamage,
    requestDueExtension,
    decideDueExtension,
    disputeScoreEvent,
    resolveScoreEvent,
    markConversationRead,
  };
}
