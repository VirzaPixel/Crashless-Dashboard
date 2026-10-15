import { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeRoadDamage } from '../lib/roadDamage';

const WORKFLOW_MIGRATION_ERROR =
  'Migration workflow belum dijalankan. Jalankan Crashless-Web/supabase/migrations/001_repair_workflow.sql di Supabase.';

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

  const fetchDamages = useCallback(async () => {
    const requestId = ++listRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('road_damages')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw getWorkflowError(fetchError);
      if (requestId === listRequestRef.current) {
        setDamages((data || []).map(normalizeRoadDamage));
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
  }, []);

  const fetchDamageById = useCallback(async (id) => {
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
      return data ? normalizeRoadDamage(data) : null;
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
  }, []);

  const uploadPhoto = useCallback(async (file) => {
    if (!file) return null;

    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `fixed_photos/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('road-damage-images')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage
      .from('road-damage-images')
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
  }, []);

  const updateWorkflow = useCallback(async (id, values, expectedStatus) => {
    const query = supabase
      .from('road_damages')
      .update(values)
      .eq('id', id);

    if (expectedStatus) {
      query.eq('workflow_status', expectedStatus);
    }

    const { data, error: updateError } = await query.select().maybeSingle();
    if (updateError) throw getWorkflowError(updateError);
    if (!data) {
      throw new Error(
        'Laporan tidak dapat diperbarui. Pastikan sesi admin aktif dan status laporan belum berubah.',
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
        'pending',
      );
    } catch (err) {
      const normalizedError = getWorkflowError(err);
      setError(normalizedError.message);
      throw normalizedError;
    } finally {
      setLoading(false);
    }
  }, [updateWorkflow]);

  const markAsFixed = useCallback(async (id, { files, fixedAt, repairNotes }) => {
    setLoading(true);
    setError(null);
    try {
      if (!files || files.length < 3) {
        throw new Error('Minimal harus mengunggah 3 foto dokumentasi perbaikan.');
      }

      const photoUrls = await Promise.all(
        Array.from(files).slice(0, 3).map(uploadPhoto),
      );

      if (photoUrls.some((url) => !url)) {
        throw new Error('Gagal mengunggah satu atau lebih foto dokumentasi.');
      }

      return await updateWorkflow(
        id,
        {
          workflow_status: 'fixed',
          status: 'fixed',
          fixed_at: fixedAt || new Date().toISOString(),
          fixed_photo_1: photoUrls[0],
          fixed_photo_2: photoUrls[1],
          fixed_photo_3: photoUrls[2],
          repair_notes: repairNotes?.trim() || null,
        },
        'in_progress',
      );
    } catch (err) {
      const normalizedError = getWorkflowError(err);
      setError(normalizedError.message);
      console.error('Error marking road damage as fixed:', normalizedError);
      throw normalizedError;
    } finally {
      setLoading(false);
    }
  }, [updateWorkflow, uploadPhoto]);

  const verifyRepair = useCallback(async (id, { approved, verificationNotes }) => {
    setLoading(true);
    setError(null);
    try {
      if (!approved && !verificationNotes?.trim()) {
        throw new Error('Catatan wajib diisi saat verifikasi ditolak.');
      }

      return await updateWorkflow(
        id,
        {
          workflow_status: approved ? 'verified' : 'rejected',
          status: approved ? 'fixed' : 'pending',
          verification_notes: verificationNotes?.trim() || null,
          verified_at: new Date().toISOString(),
          verified_by: (await supabase.auth.getUser()).data.user?.id ?? null,
        },
        'fixed',
      );
    } catch (err) {
      const normalizedError = getWorkflowError(err);
      setError(normalizedError.message);
      console.error('Error verifying road damage repair:', normalizedError);
      throw normalizedError;
    } finally {
      setLoading(false);
    }
  }, [updateWorkflow]);

  return {
    damages,
    loading,
    error,
    fetchDamages,
    fetchDamageById,
    startRepair,
    markAsFixed,
    verifyRepair,
  };
}
