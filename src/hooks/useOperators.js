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
      const { data, error: fetchError } = await supabase
        .from('user_profiles')
        .select('id, email, role, is_active, created_at, updated_at')
        .order('created_at', { ascending: false });
      if (fetchError) {
        if (/relation|does not exist|schema cache/i.test(fetchError.message || '')) {
          throw new Error(MISSING_TABLE_MESSAGE);
        }
        throw fetchError;
      }
      setOperators(data || []);
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
      .select('id, email, role, is_active, created_at, updated_at')
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

  const createOperator = useCallback(async (newEmail, newPassword, newRole) => {
    const { error: rpcError } = await supabase.rpc('create_operator_by_superadmin', {
      new_email: newEmail,
      new_password: newPassword,
      new_role: newRole,
    });

    if (rpcError) {
      throw new Error(
        'Pendaftaran akun gagal diproses. ' + (rpcError.message || 'Hubungi administrator sistem.'),
      );
    }

    await fetchOperators();
    return true;
  }, [fetchOperators]);

  return {
    operators,
    loading,
    error,
    fetchOperators,
    updateRole,
    setActive,
    deleteOperator,
    createOperator,
    missingTable,
  };
}
