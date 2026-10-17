import { useState, useEffect } from 'react';
import { LanguageContext } from './language';

const STORAGE_KEY = 'crashless-lang';

const translations = {
  id: {
    // Header & Navigation
    dashboardTitle: 'Dashboard Operasional',
    realtimeActive: 'Sinkronisasi Aktif',
    realtimeConnecting: 'Menghubungkan...',
    refresh: 'Perbarui',
    tabList: 'Daftar',
    tabMap: 'Peta',
    tabAnalytics: 'Analitik',
    toggleThemeDark: 'Beralih ke mode gelap',
    toggleThemeLight: 'Beralih ke mode terang',
    switchLang: 'Switch to English',
    
    // Analytics
    analyticsTitle: 'Tren & Sebaran Laporan',
    timeRangeAll: 'Semua',
    timeRangeToday: 'Hari Ini',
    timeRange7d: '7 Hari',
    timeRange30d: '30 Hari',
    timeRange90d: '3 Bulan',
    timeRangeYear: '1 Tahun',
    chartStatus: 'Sebaran Status',
    chartType: 'Jenis Kerusakan',
    chartTrend: 'Tren Laporan',
    incomingReport: 'Masuk',
    completedReport: 'Selesai',

    // Stats Panel
    statTotal: 'Total Laporan',
    statPending: 'Dalam Proses',
    statFixed: 'Selesai',
    statCompletionRate: 'Tingkat Selesai',
    statOverdue: 'Melewati Batas Waktu',
    statAwaitingVerification: 'Menunggu Verifikasi',

    // Filters & Search
    searchPlaceholder: 'Cari ID, alamat, atau status...',
    searchAria: 'Cari laporan',
    filterLabel: 'Filter',
    filterAllTypes: 'Semua Jenis',
    filterAllStatuses: 'Semua Status',
    filterAllPriorities: 'Semua Prioritas',
    typePothole: 'Lubang Jalan',
    typeCrack: 'Retakan',
    typeManhole: 'Manhole',
    typeNoDamage: 'Tanpa Kerusakan',
    statusPending: 'Menunggu',
    statusInProgress: 'Sedang Ditangani',
    statusFixed: 'Menunggu Verifikasi',
    statusVerified: 'Terverifikasi',
    statusRejected: 'Ditolak',
    priorityCritical: 'Kritis',
    priorityHigh: 'Tinggi',
    priorityMedium: 'Sedang',
    priorityLow: 'Rendah',

    // List & Empty state
    emptyTitle: 'Tidak Ada Laporan',
    emptyMatchedTitle: 'Laporan Tidak Ditemukan',
    emptyDesc: 'Belum ada data laporan yang tercatat dalam sistem.',
    emptyMatchedDesc: 'Sesuaikan kata kunci pencarian atau filter yang dipilih.',
    resetFilter: 'Reset Filter',
    mapHint: 'Menampilkan {count} dari {total} lokasi laporan sesuai filter.',

    // Card
    overdueBadge: 'Batas Waktu Lewat',
    noDamageText: 'Tanpa Kerusakan',
    noScoreText: 'Akurasi tidak tersedia',
    loadingLocation: 'Mengambil lokasi...',
    noLocation: 'Lokasi tidak tersedia',
    noTime: 'Waktu tidak tersedia',

    // Detail Page
    backToDashboard: 'Kembali ke Dashboard',
    detailTitle: 'Detail Kerusakan',
    priorityLabel: 'Prioritas',
    dueAtLabel: 'Batas Waktu',
    notSet: 'Belum ditentukan',
    photoDamage: 'Foto Kerusakan',
    photoRepair: 'Foto Hasil Perbaikan',
    progressHistory: 'Riwayat Penanganan',
    notes: 'Catatan Petugas',
    noNotes: 'Tidak ada catatan.',
    verifyAction: 'Verifikasi & Setujui',
    rejectAction: 'Tolak & Perbaiki Ulang',
    verificationNotesPlaceholder: 'Tuliskan catatan verifikasi (opsional)...',
    confirmApprove: 'Setujui',
    confirmReject: 'Tolak',
    processing: 'Memproses...',
    noDamageNotice: 'Laporan ini teridentifikasi tanpa kerusakan jalan dan tidak memerlukan tindakan perbaikan lapangan.',
    startRepairAction: 'Mulai Penanganan Perbaikan',
    reworkAction: 'Tangani Ulang Perbaikan',

    // Operators Page
    operatorsTitle: 'Pengelolaan Akun',
    operatorsSubtitle: 'Atur peran, status, dan akun operator sistem.',
    addAccount: 'Tambah Akun',
    emailCol: 'Alamat Email',
    roleCol: 'Peran',
    statusCol: 'Status',
    createdCol: 'Dibuat',
    actionCol: 'Aksi',
    activeStatus: 'Aktif',
    inactiveStatus: 'Nonaktif',
    deactivate: 'Nonaktifkan',
    activate: 'Aktifkan',
    delete: 'Hapus',
    currentAccountBadge: 'Akun aktif',

    // Auth
    authHeading: 'Masuk Operator',
    authSub: 'Gunakan akun operator atau super operator yang sudah aktif.',
    authEmail: 'Email',
    authPassword: 'Kata sandi',
    authSubmit: 'Masuk',
    authSubmitting: 'Memeriksa akses...',
    authSignOut: 'Keluar',
  },
  en: {
    // Header & Navigation
    dashboardTitle: 'Operations Dashboard',
    realtimeActive: 'Live Sync Active',
    realtimeConnecting: 'Connecting...',
    refresh: 'Refresh',
    tabList: 'List',
    tabMap: 'Map',
    tabAnalytics: 'Analytics',
    toggleThemeDark: 'Switch to dark mode',
    toggleThemeLight: 'Switch to light mode',
    switchLang: 'Ubah ke Bahasa Indonesia',

    // Analytics
    analyticsTitle: 'Trends & Report Distribution',
    timeRangeAll: 'All',
    timeRangeToday: 'Today',
    timeRange7d: '7 Days',
    timeRange30d: '30 Days',
    timeRange90d: '3 Months',
    timeRangeYear: '1 Year',
    chartStatus: 'Status Distribution',
    chartType: 'Damage Types',
    chartTrend: 'Report Trends',
    incomingReport: 'Incoming',
    completedReport: 'Resolved',

    // Stats Panel
    statTotal: 'Total Reports',
    statPending: 'In Progress',
    statFixed: 'Completed',
    statCompletionRate: 'Completion Rate',
    statOverdue: 'Overdue',
    statAwaitingVerification: 'Awaiting Verification',

    // Filters & Search
    searchPlaceholder: 'Search ID, address, or status...',
    searchAria: 'Search reports',
    filterLabel: 'Filter',
    filterAllTypes: 'All Types',
    filterAllStatuses: 'All Statuses',
    filterAllPriorities: 'All Priorities',
    typePothole: 'Pothole',
    typeCrack: 'Road Crack',
    typeManhole: 'Manhole',
    typeNoDamage: 'No Damage',
    statusPending: 'Pending',
    statusInProgress: 'In Progress',
    statusFixed: 'Awaiting Verification',
    statusVerified: 'Verified',
    statusRejected: 'Rejected',
    priorityCritical: 'Critical',
    priorityHigh: 'High',
    priorityMedium: 'Medium',
    priorityLow: 'Low',

    // List & Empty state
    emptyTitle: 'No Reports',
    emptyMatchedTitle: 'No Matching Reports',
    emptyDesc: 'No road damage reports recorded in the system yet.',
    emptyMatchedDesc: 'Adjust search keywords or active filters.',
    resetFilter: 'Reset Filters',
    mapHint: 'Showing {count} of {total} report locations matching active filters.',

    // Card
    overdueBadge: 'Overdue',
    noDamageText: 'No Damage',
    noScoreText: 'Confidence unavailable',
    loadingLocation: 'Fetching location...',
    noLocation: 'Location unavailable',
    noTime: 'Time unavailable',

    // Detail Page
    backToDashboard: 'Back to Dashboard',
    detailTitle: 'Damage Details',
    priorityLabel: 'Priority',
    dueAtLabel: 'Due Date',
    notSet: 'Not specified',
    photoDamage: 'Damage Photo',
    photoRepair: 'Repair Proof Photos',
    progressHistory: 'Progress History',
    notes: 'Technician Notes',
    noNotes: 'No notes available.',
    verifyAction: 'Verify & Approve',
    rejectAction: 'Reject & Require Rework',
    verificationNotesPlaceholder: 'Enter verification notes (optional)...',
    confirmApprove: 'Approve',
    confirmReject: 'Reject',
    processing: 'Processing...',
    noDamageNotice: 'This report is identified as having no road damage and does not require field repair actions.',
    startRepairAction: 'Initiate Repair Handling',
    reworkAction: 'Rework Repair Handling',

    // Operators Page
    operatorsTitle: 'Account Management',
    operatorsSubtitle: 'Manage system operator roles, statuses, and accounts.',
    addAccount: 'Add Account',
    emailCol: 'Email Address',
    roleCol: 'Role',
    statusCol: 'Status',
    createdCol: 'Created At',
    actionCol: 'Actions',
    activeStatus: 'Active',
    inactiveStatus: 'Inactive',
    deactivate: 'Deactivate',
    activate: 'Activate',
    delete: 'Delete',
    currentAccountBadge: 'Active account',

    // Auth
    authHeading: 'Operator Sign In',
    authSub: 'Use an active operator or super operator account.',
    authEmail: 'Email',
    authPassword: 'Password',
    authSubmit: 'Sign In',
    authSubmitting: 'Verifying access...',
    authSignOut: 'Sign Out',
  },
};

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    return window.localStorage.getItem(STORAGE_KEY) || 'id';
  });

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  const toggleLang = () => {
    setLang((current) => (current === 'id' ? 'en' : 'id'));
  };

  const t = (key) => {
    return translations[lang]?.[key] ?? translations.id[key] ?? key;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}
