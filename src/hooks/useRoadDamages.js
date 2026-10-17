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
