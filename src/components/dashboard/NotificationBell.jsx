import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  FileWarning,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Clock,
  Wrench,
} from 'lucide-react';
import { useNotifications } from '../../hooks/useNotifications';
import './NotificationBell.css';

const TYPE_META = {
  new_report: { icon: FileWarning, label: 'Laporan baru', tone: 'new' },
  chat_message: { icon: MessageSquare, label: 'Pesan baru', tone: 'chat' },
  report_verified: { icon: CheckCircle2, label: 'Laporan diverifikasi', tone: 'ok' },
  report_rejected: { icon: XCircle, label: 'Laporan ditolak', tone: 'danger' },
  overdue: { icon: Clock, label: 'Melewati tenggat', tone: 'danger' },
  progress_update: { icon: Wrench, label: 'Pembaruan progres', tone: 'info' },
  review_received: { icon: CheckCircle2, label: 'Ulasan diterima', tone: 'ok' },
};

function relativeTime(value) {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Math.max(0, Date.now() - then);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return `${days} hari lalu`;
}

export function NotificationBell() {
  const navigate = useNavigate();
  const { notifications, unreadCount, loading, markRead, markAllRead, isRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const handleOpenItem = (item) => {
    markRead(item.id);
    setOpen(false);
    if (item.damage_id) navigate(`/damage/${item.damage_id}`);
  };

  return (
    <div className="notification-bell" ref={wrapRef}>
      <button
        type="button"
        className={`header-icon-btn notification-trigger ${unreadCount > 0 ? 'has-unread' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-label="Notifikasi"
        aria-expanded={open}
        title="Notifikasi"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notification-panel" role="dialog" aria-label="Daftar notifikasi">
          <div className="notification-panel-head">
            <span>Notifikasi</span>
            {unreadCount > 0 && (
              <button type="button" className="notification-mark-all" onClick={markAllRead}>
                <CheckCheck size={13} /> Tandai dibaca
              </button>
            )}
          </div>

          <div className="notification-list">
            {loading && notifications.length === 0 && (
              <p className="notification-empty">Memuat notifikasi…</p>
            )}
            {!loading && notifications.length === 0 && (
              <p className="notification-empty">Belum ada notifikasi.</p>
            )}

            {notifications.map((item) => {
              const meta = TYPE_META[item.notification_type] ?? { icon: Bell, label: 'Notifikasi', tone: 'info' };
              const Icon = meta.icon;
              const read = isRead(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`notification-item ${read ? 'read' : 'unread'}`}
                  onClick={() => handleOpenItem(item)}
                >
                  <span className={`notification-icon tone-${meta.tone}`}>
                    <Icon size={15} />
                  </span>
                  <span className="notification-body">
                    <span className="notification-title">{item.title || meta.label}</span>
                    {item.body && <span className="notification-text">{item.body}</span>}
                    <span className="notification-time">{relativeTime(item.created_at)}</span>
                  </span>
                  {!read && <span className="notification-dot" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
