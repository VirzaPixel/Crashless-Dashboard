import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const MISSING_TABLE_MESSAGE =
  'Data pengguna belum tersedia. Pastikan konfigurasi basis data telah dipasang oleh administrator sistem.';

export function useOperators() {
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchOperators = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const baseColumns = 'id, email, role, domicile, is_active, created_at, updated_at';
      const ratingColumns = `${baseColumns}, rating_average, rating_count, suspension_stage, suspended_until, is_banned`;
      let { data, error: fetchError } = await supabase
        .from('user_profiles')
        .select(ratingColumns)
        .order('created_at', { ascending: false });
      const ratingSchemaMissing = fetchError && /column|schema cache|does not exist/i.test(fetchError.message || '');
      if (ratingSchemaMissing) {
        const fallback = await supabase
          .from('user_profiles')
          .select('id, email, role, is_active, created_at, updated_at')
          .order('created_at', { ascending: false });
        data = fallback.data;
        fetchError = fallback.error;
      }
      if (fetchError) {
        if (/relation|does not exist|schema cache/i.test(fetchError.message || '')) {
          throw new Error(MISSING_TABLE_MESSAGE);
        }
        throw fetchError;
      }
      const [reviewsResult, scoreResult] = await Promise.all([
        supabase.from('damage_reviews').select('operator_id,stars'),
        supabase.from('operator_score_events').select('operator_id,score_delta,dispute_status'),
      ]);
      // Skor bersifat pelengkap: halaman operator tetap tampil walau migrasi
      // operasional belum dijalankan.
      const reviews = reviewsResult.error ? [] : (reviewsResult.data || []);
      const scoreEvents = scoreResult.error ? [] : (scoreResult.data || []);
      const aggregates = (reviews || []).reduce((result, review) => {
        const entry = result.get(review.operator_id) || { total: 0, count: 0 };
        entry.total += review.stars;
        entry.count += 1;
        result.set(review.operator_id, entry);
        return result;
      }, new Map());
      const compliance = (scoreEvents || []).reduce((result, event) => {
        if (event.dispute_status === 'reversed') return result;
        result.set(event.operator_id, (result.get(event.operator_id) || 100) + Number(event.score_delta || 0));
        return result;
      }, new Map());
      setOperators((data || []).map((operator) => {
        const rating = aggregates.get(operator.id) || { total: 0, count: 0 };
        const hasStoredRating = operator.rating_average !== undefined && operator.rating_average !== null;
        return {
          ...operator,
          rating_average: hasStoredRating ? Number(operator.rating_average) : (rating.count ? rating.total / rating.count : 5),
          rating_count: operator.rating_count ?? rating.count,
          sla_score: Math.max(0, Math.min(100, compliance.get(operator.id) ?? 100)),
        };
      }));
    } catch (err) {
      setError(err.message);
      console.error('Error fetching operators:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const missingTable = useCallback((err) => {
    return /relation|does not exist|schema cache|user_profiles belum ada/i.test(err?.message || '');
  }, []);

  const updateRole = useCallback(async (targetId, role, currentSessionUserId) => {
    if (!['superadmin', 'admin', 'user'].includes(role)) {
      throw new Error('Peran tidak valid. Pilih Super Operator, Operator, atau User Mobile.');
    }
    if (targetId === currentSessionUserId && role !== 'superadmin') {
      throw new Error('Peran akun yang sedang digunakan tidak dapat diturunkan.');
    }
    const { error: rpcError } = await supabase.rpc('update_user_role_by_superadmin', {
      target_user_id: targetId,
      new_role: role,
    });
    if (rpcError) {
      throw new Error(rpcError.message || 'Perubahan peran gagal disimpan. Hubungi administrator sistem.');
    }
    // Perbarui state lokal; data terbaru akan tersinkron saat fetchOperators dipanggil ulang.
    setOperators((prev) =>
      prev.map((op) => (op.id === targetId ? { ...op, role } : op)),
    );
  }, []);

  const setActive = useCallback(async (targetId, isActive, currentSessionUserId) => {
    if (targetId === currentSessionUserId && !isActive) {
      throw new Error('Akun yang sedang digunakan tidak dapat dinonaktifkan.');
    }
    const { data, error: updateError } = await supabase
      .from('user_profiles')
      .update({ is_active: isActive })
      .eq('id', targetId)
      .select('id, email, role, is_active, created_at, updated_at, rating_average, rating_count, suspension_stage, suspended_until, is_banned')
      .maybeSingle();
    if (updateError) {
      if (/relation|does not exist|schema cache/i.test(updateError.message || '')) {
        throw new Error(MISSING_TABLE_MESSAGE);
      }
      throw updateError;
    }
    if (!data) {
      throw new Error('Perubahan status akun gagal disimpan. Hubungi administrator sistem.');
    }
    setOperators((prev) => prev.map((op) => (op.id === targetId ? data : op)));
    return data;
  }, []);

  const deleteOperator = useCallback(async (targetId, currentSessionUserId) => {
    if (targetId === currentSessionUserId) {
      throw new Error('Akun yang sedang digunakan tidak dapat dihapus.');
    }
    const { error: rpcError } = await supabase.rpc('delete_user_by_superadmin', {
      target_user_id: targetId,
    });

    if (rpcError) {
      throw new Error(
        'Penghapusan akun gagal diproses. ' + (rpcError.message || 'Hubungi administrator sistem.'),
      );
    }

    setOperators((prev) => prev.filter((op) => op.id !== targetId));
    return true;
  }, []);

  const createOperator = useCallback(async (newEmail, newPassword, newRole, newDomicile = '') => {
    let { error: rpcError } = await supabase.rpc('create_operator_by_superadmin', {
      new_email: newEmail,
      new_password: newPassword,
      new_role: newRole,
      new_domicile: newDomicile?.trim() || null,
    });

    if (rpcError && /function.*does not exist|parameter/i.test(rpcError.message || '')) {
      const fallback = await supabase.rpc('create_operator_by_superadmin', {
        new_email: newEmail,
        new_password: newPassword,
        new_role: newRole,
      });
      rpcError = fallback.error;
    }

    if (rpcError) {
      throw new Error(
        'Pendaftaran akun gagal diproses. ' + (rpcError.message || 'Hubungi administrator sistem.'),
      );
    }

    await fetchOperators();
    return true;
  }, [fetchOperators]);

  const updateDomicile = useCallback(async (targetId, newDomicile) => {
    const clean = newDomicile?.trim() || null;
    let { error: rpcError } = await supabase.rpc('update_user_domicile', {
      target_user_id: targetId,
      new_domicile: clean,
    });

    if (rpcError) {
      const fallback = await supabase
        .from('user_profiles')
        .update({ domicile: clean })
        .eq('id', targetId);
      rpcError = fallback.error;
    }

    if (rpcError) {
      throw new Error(
        'Pembaruan domisili gagal disimpan. ' + (rpcError.message || 'Hubungi administrator sistem.'),
      );
    }

    setOperators((prev) =>
      prev.map((op) => (op.id === targetId ? { ...op, domicile: clean } : op)),
    );
    return true;
  }, []);

  return {
    operators,
    loading,
    error,
    fetchOperators,
    updateRole,
    setActive,
    deleteOperator,
    createOperator,
    updateDomicile,
    missingTable,
  };
}
