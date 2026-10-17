import { useMemo, useEffect, useState } from 'react';
import { Camera, Calendar, AlertCircle, CheckCircle2, FileDown } from 'lucide-react';
import { Modal } from '../common/Modal';
import { formatBytes } from '../../lib/imageCompression';
import './FixedModal.css';

export function FixedModal({ isOpen, onClose, damageId, onFixedSuccess, markAsFixed, loading }) {
  const [files, setFiles] = useState([null, null, null]);
  const [fixedAt, setFixedAt] = useState(new Date().toISOString().substring(0, 16));
  const [repairNotes, setRepairNotes] = useState('');
  const [formError, setFormError] = useState(null);
  const [uploadStage, setUploadStage] = useState('');
  const [savedBytes, setSavedBytes] = useState(null);
  const previewUrls = useMemo(
    () => files.map((file) => (file ? URL.createObjectURL(file) : null)),
    [files],
  );

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [previewUrls]);

  const handleFileChange = (index, e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    if (!selectedFile.type.startsWith('image/')) {
      setFormError('File dokumentasi harus berupa gambar.');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setFormError('Ukuran setiap foto maksimal 10 MB.');
      return;
    }

    const updatedFiles = [...files];
    updatedFiles[index] = selectedFile;
    setFiles(updatedFiles);
    setFormError(null);
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSavedBytes(null);

    // Validasi 3 file foto wajib
    if (files.some(file => file === null)) {
      setFormError('Harap lampirkan minimal 3 foto dokumentasi perbaikan.');
      return;
    }

    try {
      const parsedDate = new Date(fixedAt);
      if (Number.isNaN(parsedDate.getTime())) {
        setFormError('Waktu perbaikan tidak valid.');
        return;
      }

      setUploadStage('Mengompresi foto...');
      const formattedDate = parsedDate.toISOString();
      const originalTotal = files.reduce((sum, f) => sum + (f?.size || 0), 0);
      await markAsFixed(damageId, {
        files: files.filter((file) => file !== null),
        fixedAt: formattedDate,
        repairNotes,
        onStage: (stage) => setUploadStage(stage === 'upload' ? 'Mengunggah foto...' : 'Mengompresi foto...'),
      });
      // Estimasi hemat: asumsi hasil kompres ~220 KB/foto (1280px q0.78).
      const estimateSaved = Math.max(originalTotal - files.filter(Boolean).length * 220 * 1024, 0);
      setSavedBytes(estimateSaved);

      setFiles([null, null, null]);
      setFixedAt(new Date().toISOString().substring(0, 16));
      setRepairNotes('');

      await onFixedSuccess();
      onClose();
    } catch (err) {
      setFormError(err.message || 'Terjadi kesalahan saat memperbarui status perbaikan.');
    } finally {
      setUploadStage('');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Laporkan perbaikan">
      <form onSubmit={handleSubmit} className="fixed-form">
        <div className="form-description">
          Unggah tiga foto bukti perbaikan sebelum mengirim laporan.
          Foto dikompresi otomatis (±1280px) agar menghemat kuota &amp; penyimpanan.
        </div>

        {savedBytes !== null && savedBytes > 0 && (
          <div className="form-saved-panel" role="status">
            <FileDown size={17} />
            <span>Estimasi penghematan penyimpanan: {formatBytes(savedBytes)}.</span>
          </div>
        )}

        {formError && (
          <div className="form-error-panel">
            <AlertCircle size={18} />
            <span>{formError}</span>
          </div>
        )}

        <div className="photo-upload-grid">
          {files.map((file, index) => {
            const inputId = `repair-photo-${damageId}-${index}`;
            return (
              <label
                key={inputId}
                className={`photo-uploader-card ${file ? 'has-file' : ''}`}
                htmlFor={inputId}
              >
                <input
                  id={inputId}
                  className="photo-input-hidden"
                  type="file"
                  onChange={(event) => handleFileChange(index, event)}
                  accept="image/*"
                  aria-label={`Pilih foto dokumentasi ${index + 1}`}
                  disabled={loading}
                />
                {file ? (
                  <span className="preview-container">
                    <img src={previewUrls[index]} alt={`Dokumentasi ${index + 1}`} />
                    <span className="change-photo-badge">Ubah foto {index + 1}</span>
                  </span>
                ) : (
                  <span className="upload-placeholder">
                    <Camera size={25} aria-hidden="true" />
                    <span>Foto {index + 1}</span>
                  </span>
                )}
              </label>
            );
          })}
        </div>

        <div className="input-group">
          <label htmlFor="fixed-at-picker">
            <Calendar size={16} />
            Waktu Perbaikan Selesai
          </label>
          <input 
            type="datetime-local" 
            id="fixed-at-picker"
            value={fixedAt}
            onChange={(e) => setFixedAt(e.target.value)}
            required
          />
        </div>

        <div className="input-group">
          <label htmlFor="repair-notes">Catatan Perbaikan (opsional)</label>
          <textarea
            id="repair-notes"
            value={repairNotes}
            onChange={(event) => setRepairNotes(event.target.value)}
            placeholder="Jelaskan tindakan perbaikan yang dilakukan..."
            rows={3}
            disabled={loading}
          />
        </div>

        <button 
          type="submit" 
          className="submit-fixed-btn" 
          disabled={loading}
        >
          {loading ? (
            <span className="btn-progress">
              <span className="btn-spinner" aria-hidden="true"></span>
              <span>{uploadStage || 'Memproses...'}</span>
            </span>
          ) : (
            <>
              <CheckCircle2 size={18} />
              Kirim Dokumentasi Perbaikan
            </>
          )}
        </button>
      </form>
    </Modal>
  );
}
