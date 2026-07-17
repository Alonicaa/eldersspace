function resolveApiBaseUrl() {
    const search = new URLSearchParams(window.location.search);
    const queryBase = (search.get('apiBase') || '').trim();
    if (queryBase) {
        return queryBase.replace(/\/$/, '');
    }

    const storedBase = (localStorage.getItem('elderspace_api_base') || '').trim();
    if (storedBase) {
        return storedBase.replace(/\/$/, '');
    }

    return 'https://eldersspace-backend.onrender.com';
}
const API_BASE_URL = resolveApiBaseUrl();

// Auto-save API URL to localStorage for future sessions
localStorage.setItem('elderspace_api_base', API_BASE_URL);
const ADS_STORAGE_KEY = 'elderspace_admin_ads_drafts';

function resolveMediaUrl(rawUrl) {
    if (!rawUrl || !String(rawUrl).trim()) return '';

    const url = String(rawUrl).trim();
    if (/^https?:\/\//i.test(url)) return url;

    const normalized = url.replace(/^\/+/, '');
    if (normalized.startsWith('uploads/')) {
        return `${API_BASE_URL}/${normalized}`;
    }

    return `${API_BASE_URL}/uploads/${normalized}`;
}

    
let moderationFiltersBound = false;
let currentContentFilter = 'all';
let currentContentSearchQuery = '';
let currentReportFilter = 'pending';
let contentMonitorSourceRows = [];
let reportQueueSourceRows = [];
let companySourceRows = [];
let currentCompanySearchQuery = '';
let currentRedemptionRows = [];
let currentRedemptionGroups = [];
let currentRedemptionVisibleRows = [];
let currentRedemptionQuickMode = '';
let currentRedemptionAnalyticsView = 'campaign';
let currentActivityView = 'today';
let selectedMonthForActivity = null; // Track selected month for activity view
let selectedDateForToday = null; // Track selected date for today view
let selectedWeekStart = null; // Track start date for week view
const ADMIN_TOKEN_KEY = 'elderspace_admin_token';
const ADMIN_PROFILE_KEY = 'elderspace_admin_profile';
let activityChart;
let dashboardPayload = null;
let adminOtpRequestedPhone = '';
let currentPostDetail = null;
let currentUserDetail = null;
let adDrafts = [];
let actionDialogResolve = null;
let fullDashboardActivity = null;
let currentRewardSettings = null;
let currentSecurityState = {
    range: 'today',
    category: 'all',
    logs: [],
    alerts: [],
    metrics: {}
};
let securityFiltersBound = false;
let redemptionCharts = {
    trend: null,
    topRewards: null,
    points: null,
    campaignPerformance: null
};

const redemptionAnalyticsSortOptions = {
    campaign: [
        { value: 'count_desc', label: 'แลกมากสุด' },
        { value: 'points_desc', label: 'แต้มมากสุด' },
        { value: 'users_desc', label: 'ผู้ใช้มากสุด' },
        { value: 'latest_desc', label: 'ล่าสุดก่อน' },
        { value: 'name_asc', label: 'ชื่อ A-Z' }
    ],
    daily: [
        { value: 'date_desc', label: 'วันที่ล่าสุดก่อน' },
        { value: 'date_asc', label: 'วันที่เก่าก่อน' },
        { value: 'count_desc', label: 'จำนวนมากสุด' },
        { value: 'points_desc', label: 'แต้มมากสุด' },
        { value: 'users_desc', label: 'ผู้ใช้มากสุด' }
    ]
};


function getUserMetricLabel(view) {
    if (view === 'week') return 'Active Users (สัปดาห์)';
    if (view === 'month') return 'Active Users (เดือน)';
    return 'Active Users (วันนี้)';
}

function getXAxisTitle(view) {
    if (view === 'today') return 'เวลา (ชั่วโมง)';
    if (view === 'week') return 'วันในสัปดาห์';
    return 'วันในเดือน';
}

function getYAxisTitle() {
    return 'จำนวนผู้ใช้งานที่ active';
}

function getActionDialogEls() {
    return {
        modal: document.getElementById('action-dialog-modal'),
        title: document.getElementById('action-dialog-title'),
        message: document.getElementById('action-dialog-message'),
        close: document.getElementById('action-dialog-close'),
        cancel: document.getElementById('action-dialog-cancel'),
        confirm: document.getElementById('action-dialog-confirm')
    };
}

function closeActionDialog(result = false) {
    const els = getActionDialogEls();
    if (els.modal) els.modal.classList.add('hidden');

    if (typeof actionDialogResolve === 'function') {
        const resolve = actionDialogResolve;
        actionDialogResolve = null;
        resolve(result);
    }
}

function openActionDialog({
    title = 'ยืนยันการดำเนินการ',
    message = '',
    confirmText = 'ยืนยัน',
    cancelText = 'ยกเลิก',
    confirmClass = 'btn btn-del',
    showCancel = true
} = {}) {
    const els = getActionDialogEls();
    if (!els.modal || !els.title || !els.message || !els.confirm || !els.cancel) {
        return Promise.resolve(false);
    }

    if (typeof actionDialogResolve === 'function') {
        closeActionDialog(false);
    }

    els.title.textContent = title;
    els.message.textContent = message;
    els.confirm.textContent = confirmText;
    els.confirm.className = confirmClass;
    els.confirm.style.display = '';
    els.cancel.textContent = cancelText;
    els.cancel.classList.toggle('hidden', !showCancel);
    els.modal.classList.remove('hidden');

    return new Promise((resolve) => {
        actionDialogResolve = resolve;
    });
}

async function showActionDialogInfo(message, title = 'แจ้งเตือน') {
    await openActionDialog({
        title,
        message,
        confirmText: 'ตกลง',
        confirmClass: 'btn btn-check',
        showCancel: false
    });
}

const ALLOWED_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp'
]);

function validateImageFile(file, label = 'รูปภาพ', maxSizeMb = 5) {
    if (!file) return null;
    if (!ALLOWED_IMAGE_TYPES.has((file.type || '').toLowerCase())) {
        return `${label} ต้องเป็นไฟล์ภาพประเภท JPG, PNG, GIF หรือ WebP`;
    }
    const maxSizeBytes = maxSizeMb * 1024 * 1024;
    if (file.size > maxSizeBytes) {
        return `${label} ต้องมีขนาดไม่เกิน ${maxSizeMb}MB`;
    }
    return null;
}

function isValidHttpUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseDateInput(value) {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function validateCampaignRange(startValue, endValue) {
    if (!startValue || !endValue) return null;
    const startDate = parseDateInput(startValue);
    const endDate = parseDateInput(endValue);
    if (!startDate || !endDate) {
        return 'รูปแบบวันเวลาแคมเปญไม่ถูกต้อง';
    }
    if (endDate < startDate) {
        return 'วันสิ้นสุดแคมเปญต้องไม่น้อยกว่าวันเริ่มต้น';
    }
    return null;
}

function getStoredToken() {
    return localStorage.getItem(ADMIN_TOKEN_KEY) || '';
}

function getStoredProfile() {
    const raw = localStorage.getItem(ADMIN_PROFILE_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (error) {
        return null;
    }
}

function saveAuthSession(token, profile) {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
    localStorage.setItem(ADMIN_PROFILE_KEY, JSON.stringify(profile || {}));
}

function clearAuthSession() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_PROFILE_KEY);
}

function getAuthHeaders() {
    const token = getStoredToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

const ADMIN_AUTH_ERROR_MESSAGES = {
    'phone_number is required': 'กรุณากรอกเบอร์โทรศัพท์',
    'phone_number and otp_code are required': 'กรุณากรอกเบอร์โทรและรหัส OTP',
    'Forbidden: admin role required': 'เบอร์นี้ไม่มีสิทธิ์เข้าใช้งานระบบผู้ดูแล',
    'Invalid or expired OTP': 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ กรุณาขอรหัสใหม่',
    'Failed to send OTP via SMS': 'ส่ง OTP ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
};

function friendlyAdminAuthError(rawMessage) {
    return ADMIN_AUTH_ERROR_MESSAGES[rawMessage] || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
}

function isValidAdminPhone(value) {
    return /^0\d{9}$/.test(value);
}

function showLogin(message = '') {
    const loginScreen = document.getElementById('login-screen');
    const dashboardApp = document.getElementById('dashboard-app');
    const loginError = document.getElementById('login-error');
    const otpInput = document.getElementById('admin-otp');
    const verifyBtn = document.getElementById('verify-otp-btn');
    const otpHint = document.getElementById('otp-hint');

    if (loginScreen) loginScreen.classList.remove('hidden');
    if (dashboardApp) dashboardApp.classList.add('hidden');
    if (loginError) loginError.textContent = message;

    adminOtpRequestedPhone = '';
    if (otpInput) {
        otpInput.disabled = true;
        otpInput.value = '';
    }
    if (verifyBtn) verifyBtn.disabled = true;
    if (otpHint) otpHint.textContent = 'ยังไม่ได้ขอ OTP';
    if (otpHint) otpHint.title = `API: ${API_BASE_URL}`;
}

function showDashboard() {
    const loginScreen = document.getElementById('login-screen');
    const dashboardApp = document.getElementById('dashboard-app');

    if (loginScreen) loginScreen.classList.add('hidden');
    if (dashboardApp) dashboardApp.classList.remove('hidden');
}

function updateAdminHeader() {
    const profile = getStoredProfile();
    const nameEl = document.getElementById('admin-name');
    const phoneEl = document.getElementById('admin-phone-label');
    const avatarEl = document.getElementById('admin-avatar');

    const fullName = profile?.full_name || 'Admin';
    const phone = profile?.phone_number || '-';

    if (nameEl) nameEl.textContent = fullName;
    if (phoneEl) phoneEl.textContent = phone;
    if (avatarEl) {
        avatarEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=4e73df&color=fff`;
    }
}

async function handleAdminLogin(event) {
    event.preventDefault();

    const form = event.currentTarget;
    const loginError = document.getElementById('login-error');
    const button = document.getElementById('verify-otp-btn');
    const phoneInput = document.getElementById('admin-phone');
    const otpInput = document.getElementById('admin-otp');
    const otpHint = document.getElementById('otp-hint');
    const requestOtpBtn = document.getElementById('request-otp-btn');

    const phone_number = (phoneInput?.value || '').trim();
    const otp_code = (otpInput?.value || '').trim();

    if (!phone_number || !otp_code) {
        if (loginError) loginError.textContent = 'กรุณากรอกเบอร์โทรและ OTP';
        return;
    }

    if (!isValidAdminPhone(phone_number)) {
        if (loginError) loginError.textContent = 'เบอร์โทรศัพท์ไม่ถูกต้อง กรุณากรอกตัวเลข 10 หลัก';
        return;
    }

    if (!/^\d{6}$/.test(otp_code)) {
        if (loginError) loginError.textContent = 'รหัส OTP ต้องเป็นตัวเลข 6 หลัก';
        return;
    }

    if (!adminOtpRequestedPhone || adminOtpRequestedPhone !== phone_number) {
        if (loginError) loginError.textContent = 'กรุณากดขอ OTP ก่อน';
        return;
    }

    if (button) button.disabled = true;
    if (requestOtpBtn) requestOtpBtn.disabled = true;
    if (loginError) loginError.textContent = '';

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/admin/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone_number, otp_code })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(friendlyAdminAuthError(data?.error));
        }

        if (String(data?.admin?.role || '').toLowerCase() !== 'admin') {
            throw new Error('บัญชีนี้ไม่ใช่ admin');
        }

        saveAuthSession(data.token, data.admin);
        updateAdminHeader();
        showDashboard();
        await loadDashboardSummary();
        form.reset();
        adminOtpRequestedPhone = '';
        if (otpInput) otpInput.disabled = true;
        if (button) button.disabled = true;
        if (otpHint) otpHint.textContent = 'ยังไม่ได้ขอ OTP';
    } catch (error) {
        showLogin(error.message || 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
        if (button) button.disabled = false;
        if (requestOtpBtn) requestOtpBtn.disabled = false;
    }
}

async function handleRequestAdminOtp() {
    const loginError = document.getElementById('login-error');
    const phoneInput = document.getElementById('admin-phone');
    const otpInput = document.getElementById('admin-otp');
    const otpHint = document.getElementById('otp-hint');
    const verifyBtn = document.getElementById('verify-otp-btn');
    const requestBtn = document.getElementById('request-otp-btn');

    const phone_number = (phoneInput?.value || '').trim();
    if (!phone_number) {
        if (loginError) loginError.textContent = 'กรุณากรอกเบอร์โทรก่อนขอ OTP';
        return;
    }

    if (!isValidAdminPhone(phone_number)) {
        if (loginError) loginError.textContent = 'เบอร์โทรศัพท์ไม่ถูกต้อง กรุณากรอกตัวเลข 10 หลัก';
        return;
    }

    if (requestBtn) requestBtn.disabled = true;
    if (loginError) loginError.textContent = '';

    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/admin/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone_number })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(friendlyAdminAuthError(data?.error));
        }

        adminOtpRequestedPhone = phone_number;
        if (otpInput) {
            otpInput.disabled = false;
            otpInput.focus();
        }
        if (verifyBtn) verifyBtn.disabled = false;
        if (otpHint) {
            const hasDevOtp = data?.isDevelopment === true && data?.otp;
            otpHint.textContent = hasDevOtp
                ? `โหมดพัฒนา — รหัส OTP คือ ${data.otp}`
                : 'ส่ง OTP แล้ว กรุณาตรวจสอบอุปกรณ์ของคุณ';
        }
    } catch (error) {
        if (loginError) loginError.textContent = error.message || 'ขอ OTP ไม่สำเร็จ';
    } finally {
        if (requestBtn) requestBtn.disabled = false;
    }
}

function handleLogout() {
    clearAuthSession();
    showLogin('ออกจากระบบแล้ว');
    const form = document.getElementById('admin-login-form');
    if (form) form.reset();
}

async function bootstrapAuth() {
    // Check if token exists
    const token = getStoredToken();
    if (!token) {
        showLogin();
        return;
    }

    updateAdminHeader();
    showDashboard();
    await loadDashboardSummary();
}

// ============================================================
// REWARD SETTINGS & BONUS EVENTS FUNCTIONS
// ============================================================

function normalizeRewardSettings(result) {
    const raw = result && typeof result === 'object' && result.data ? result.data : result;
    const threshold = Number(raw?.session_bonus_threshold);
    const points = Number(raw?.session_bonus_points);
    const dailyLimit = Number(raw?.usage_reward_daily_limit_count);

    if (!Number.isFinite(threshold) || threshold <= 0) {
        throw new Error('ค่ากลาง session_bonus_threshold ไม่ถูกต้อง');
    }
    if (!Number.isFinite(points) || points <= 0) {
        throw new Error('ค่ากลาง session_bonus_points ไม่ถูกต้อง');
    }
    if (!Number.isFinite(dailyLimit) || dailyLimit <= 0) {
        throw new Error('ค่ากลาง usage_reward_daily_limit_count ไม่ถูกต้อง');
    }

    return {
        session_bonus_threshold: threshold,
        session_bonus_points: points,
        usage_reward_daily_limit_count: dailyLimit
    };
}

function renderRewardSettingsSummary(settings) {
    const summaryEl = document.getElementById('reward-settings-current');
    if (!summaryEl) return;

    if (!settings) {
        summaryEl.textContent = 'ค่าปัจจุบันจากระบบ: โหลดไม่สำเร็จ';
        return;
    }

    summaryEl.textContent =
        `ค่าปัจจุบันจากระบบ: ${settings.session_bonus_threshold} นาที/โบนัส, ` +
        `${settings.session_bonus_points} แต้ม/โบนัส, ` +
        `สูงสุด ${settings.usage_reward_daily_limit_count} ครั้ง/วัน`;
}

async function loadRewardSettings() {
    try {
        const result = await fetchAuthJson(`${API_BASE_URL}/api/admin/reward-settings`);
        const settings = normalizeRewardSettings(result);

        currentRewardSettings = settings;
        document.getElementById('session-bonus-threshold').value = settings.session_bonus_threshold;
        document.getElementById('session-bonus-points').value = settings.session_bonus_points;
        document.getElementById('usage-reward-daily-limit-count').value = settings.usage_reward_daily_limit_count;
        renderRewardSettingsSummary(settings);
    } catch (error) {
        console.error('Failed to load reward settings:', error);
        renderRewardSettingsSummary(null);
        await showActionDialogInfo('❌ ไม่สามารถโหลดการตั้งค่าแต้ม', 'เกิดข้อผิดพลาด');
    }
}

async function saveRewardSettings() {
    try {
        const sessionBonusThreshold = Number(document.getElementById('session-bonus-threshold').value);
        const sessionBonusPoints = Number(document.getElementById('session-bonus-points').value);
        const usageRewardDailyLimitCount = Number(document.getElementById('usage-reward-daily-limit-count').value);

        if (!Number.isFinite(sessionBonusThreshold) || sessionBonusThreshold <= 0) {
            await showActionDialogInfo('❌ นาทีต่อโบนัสต้องมากกว่า 0', 'ตรวจสอบข้อมูล');
            return;
        }
        if (!Number.isFinite(sessionBonusPoints) || sessionBonusPoints <= 0) {
            await showActionDialogInfo('❌ แต้มต่อโบนัสต้องมากกว่า 0', 'ตรวจสอบข้อมูล');
            return;
        }
        if (!Number.isFinite(usageRewardDailyLimitCount) || usageRewardDailyLimitCount <= 0) {
            await showActionDialogInfo('❌ โบนัสสูงสุดต่อวันต้องมากกว่า 0', 'ตรวจสอบข้อมูล');
            return;
        }

        const maxDailyPoints = sessionBonusPoints * usageRewardDailyLimitCount;
        const minutesToHitCap = sessionBonusThreshold * usageRewardDailyLimitCount;
        const confirmed = await openActionDialog({
            title: 'ยืนยันการบันทึก Reward Settings',
            message:
                `นาทีต่อโบนัส: ${sessionBonusThreshold} นาที\n` +
                `แต้มต่อโบนัส: ${sessionBonusPoints} แต้ม\n` +
                `โบนัสสูงสุดต่อวัน: ${usageRewardDailyLimitCount} ครั้ง\n` +
                `แต้มสูงสุดต่อวัน: ${maxDailyPoints} แต้ม\n` +
                `ครบโควตาเมื่อใช้งานสะสม: ${minutesToHitCap} นาที\n` +
                `รีเซ็ตโควตา: ทุกวัน 00:00 (เวลาไทย)`,
            confirmText: 'บันทึกการตั้งค่า',
            cancelText: 'ยกเลิก',
            confirmClass: 'btn btn-check',
            showCancel: true
        });
        if (!confirmed) {
            return;
        }

        const response = await fetch(`${API_BASE_URL}/api/admin/reward-settings`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getStoredToken()}`
            },
            body: JSON.stringify({
                session_bonus_threshold: sessionBonusThreshold,
                session_bonus_points: sessionBonusPoints,
                usage_reward_daily_limit_count: usageRewardDailyLimitCount
            })
        });

        if (!response.ok) throw new Error('Failed to save settings');
        
        const result = await response.json();
        if (result.success) {
            await loadRewardSettings();
            await showActionDialogInfo(
                `✅ บันทึกการตั้งค่าสำเร็จ\n` +
                `แต้มสูงสุดต่อวัน = ${sessionBonusPoints} x ${usageRewardDailyLimitCount} = ${maxDailyPoints} แต้ม\n` +
                `ครบโควตาเมื่อใช้งานสะสม ${minutesToHitCap} นาที/วัน`,
                'บันทึกสำเร็จ'
            );
        }
    } catch (error) {
        console.error('Failed to save reward settings:', error);
        await showActionDialogInfo('❌ ไม่สามารถบันทึกการตั้งค่า', 'เกิดข้อผิดพลาด');
    }
}

async function loadDailyLoginSettings() {
    try {
        const result = await fetchAuthJson(`${API_BASE_URL}/api/admin/reward-settings`);
        const settings = result?.data || result;
        const dailyLoginBonus = settings.daily_login_bonus || 5;
        const threshold3x = settings.daily_login_bonus_3x_threshold || 30;
        const multiplier3x = settings.daily_login_bonus_3x_multiplier || 1.2;

        document.getElementById('daily-login-bonus').value = dailyLoginBonus;
        document.getElementById('daily-login-3x-threshold').value = threshold3x;
        document.getElementById('daily-login-3x-multiplier').value = multiplier3x;

        const summaryEl = document.getElementById('daily-login-current');
        if (summaryEl) {
            summaryEl.textContent = `ค่าปัจจุบันจากระบบ: ${dailyLoginBonus} แต้ม/วัน, ตัวคูณ ×${multiplier3x} เมื่อ streak ≥ ${threshold3x} วัน`;
        }
    } catch (error) {
        console.error('Failed to load daily login settings:', error);
        const summaryEl = document.getElementById('daily-login-current');
        if (summaryEl) {
            summaryEl.textContent = 'ค่าปัจจุบันจากระบบ: โหลดไม่สำเร็จ';
        }
    }
}

async function saveDailyLoginSettings() {
    try {
        const dailyLoginBonus = Number(document.getElementById('daily-login-bonus').value);
        const threshold3x = Number(document.getElementById('daily-login-3x-threshold').value);
        const multiplier3x = Number(document.getElementById('daily-login-3x-multiplier').value);

        if (!Number.isFinite(dailyLoginBonus) || dailyLoginBonus <= 0) {
            await showActionDialogInfo('❌ แต้มต่อการเข้าสู่ระบบต้องมากกว่า 0', 'ตรวจสอบข้อมูล');
            return;
        }
        if (!Number.isFinite(threshold3x) || threshold3x <= 0) {
            await showActionDialogInfo('❌ Streak ขั้นต่ำต้องมากกว่า 0 วัน', 'ตรวจสอบข้อมูล');
            return;
        }
        if (!Number.isFinite(multiplier3x) || multiplier3x < 1) {
            await showActionDialogInfo('❌ ตัวคูณต้องมากกว่าหรือเท่ากับ 1', 'ตรวจสอบข้อมูล');
            return;
        }

        const confirmed = await openActionDialog({
            title: 'ยืนยันการบันทึก Daily Login Settings',
            message:
                `แต้มต่อการเข้าสู่ระบบรายวัน: ${dailyLoginBonus} แต้ม\n` +
                `ตัวคูณ ×${multiplier3x} เมื่อ streak ≥ ${threshold3x} วัน\n` +
                `(แต้มสูงสุดเมื่อมีตัวคูณ: ${(dailyLoginBonus * multiplier3x).toFixed(1)} แต้ม/วัน)`,
            confirmText: 'บันทึกการตั้งค่า',
            cancelText: 'ยกเลิก',
            confirmClass: 'btn btn-check',
            showCancel: true
        });
        if (!confirmed) {
            return;
        }

        const response = await fetch(`${API_BASE_URL}/api/admin/reward-settings`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getStoredToken()}`
            },
            body: JSON.stringify({
                daily_login_bonus: dailyLoginBonus,
                daily_login_bonus_3x_threshold: threshold3x,
                daily_login_bonus_3x_multiplier: multiplier3x
            })
        });

        if (!response.ok) throw new Error('Failed to save settings');

        const result = await response.json();
        if (result.success) {
            await loadDailyLoginSettings();
            await showActionDialogInfo(
                `✅ บันทึกการตั้งค่าสำเร็จ\n` +
                `แต้มต่อการเข้าสู่ระบบรายวัน: ${dailyLoginBonus} แต้ม\n` +
                `ตัวคูณ ×${multiplier3x} เมื่อ streak ≥ ${threshold3x} วัน`,
                'บันทึกสำเร็จ'
            );
        }
    } catch (error) {
        console.error('Failed to save daily login settings:', error);
        await showActionDialogInfo('❌ ไม่สามารถบันทึกการตั้งค่า', 'เกิดข้อผิดพลาด');
    }
}

async function loadStreakMilestoneSettings() {
    try {
        const result = await fetchAuthJson(`${API_BASE_URL}/api/admin/reward-settings`);
        const settings = result?.data || result;
        const streakMilestoneDays = settings.streak_milestone_days || 30;
        const streakMilestoneBonus = settings.streak_milestone_bonus || 2;
        
        document.getElementById('streak-milestone-days').value = streakMilestoneDays;
        document.getElementById('streak-milestone-bonus').value = streakMilestoneBonus;
        
        const summaryEl = document.getElementById('streak-milestone-current');
        if (summaryEl) {
            summaryEl.textContent = `ค่าปัจจุบันจากระบบ: ล็อคอิน ${streakMilestoneDays} วัน ได้โบนัส ${streakMilestoneBonus} แต้ม`;
        }
    } catch (error) {
        console.error('Failed to load streak milestone settings:', error);
        const summaryEl = document.getElementById('streak-milestone-current');
        if (summaryEl) {
            summaryEl.textContent = 'ค่าปัจจุบันจากระบบ: โหลดไม่สำเร็จ';
        }
    }
}

async function saveStreakMilestoneSettings() {
    try {
        const streakMilestoneDays = Number(document.getElementById('streak-milestone-days').value);
        const streakMilestoneBonus = Number(document.getElementById('streak-milestone-bonus').value);

        if (!Number.isFinite(streakMilestoneDays) || streakMilestoneDays <= 0) {
            await showActionDialogInfo('❌ วันล็อคอินต้องมากกว่า 0', 'ตรวจสอบข้อมูล');
            return;
        }
        if (!Number.isFinite(streakMilestoneBonus) || streakMilestoneBonus <= 0) {
            await showActionDialogInfo('❌ แต้มโบนัสต้องมากกว่า 0', 'ตรวจสอบข้อมูล');
            return;
        }

        const confirmed = await openActionDialog({
            title: 'ยืนยันการบันทึก Streak Milestone Settings',
            message: 
                `ล็อคอินติดต่อกัน: ${streakMilestoneDays} วัน\n` +
                `แต้มโบนัสที่ได้: ${streakMilestoneBonus} แต้ม`,
            confirmText: 'บันทึกการตั้งค่า',
            cancelText: 'ยกเลิก',
            confirmClass: 'btn btn-check',
            showCancel: true
        });
        if (!confirmed) {
            return;
        }

        const response = await fetch(`${API_BASE_URL}/api/admin/reward-settings`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getStoredToken()}`
            },
            body: JSON.stringify({
                streak_milestone_days: streakMilestoneDays,
                streak_milestone_bonus: streakMilestoneBonus
            })
        });

        if (!response.ok) throw new Error('Failed to save settings');
        
        const result = await response.json();
        if (result.success) {
            await loadStreakMilestoneSettings();
            await showActionDialogInfo(
                `✅ บันทึกการตั้งค่าสำเร็จ\n` +
                `ล็อคอินติดต่อกัน: ${streakMilestoneDays} วัน - แต้มโบนัส: ${streakMilestoneBonus} แต้ม`,
                'บันทึกสำเร็จ'
            );
        }
    } catch (error) {
        console.error('Failed to save streak milestone settings:', error);
        await showActionDialogInfo('❌ ไม่สามารถบันทึกการตั้งค่า', 'เกิดข้อผิดพลาด');
    }
}

function renderActivityRewardSettingsSummary(settings) {
    const summaryEl = document.getElementById('activity-reward-current');
    if (!summaryEl) return;

    if (!settings) {
        summaryEl.textContent = 'ค่าปัจจุบันจากระบบ: โหลดไม่สำเร็จ';
        return;
    }

    summaryEl.textContent =
        `โปรไฟล์ครบ +${settings.profile_completion_points}, ` +
        `โพสต์พร้อมรูป ${settings.post_activity_required_posts} โพสต์ = +${settings.post_activity_points}, ` +
        `คอมเมนต์ +${settings.comment_activity_points} (สูงสุด ${settings.comment_activity_daily_limit_count}/วัน), ` +
        `แชร์กิจกรรม +${settings.share_activity_points}`;
}

async function loadActivityRewardSettings() {
    try {
        const result = await fetchAuthJson(`${API_BASE_URL}/api/admin/reward-settings`);
        const settingsRaw = result?.data || result;

        const settings = {
            profile_completion_points: Number(settingsRaw.profile_completion_points ?? 50),
            post_activity_points: Number(settingsRaw.post_activity_points ?? 10),
            post_activity_required_posts: Number(settingsRaw.post_activity_required_posts ?? 2),
            comment_activity_points: Number(settingsRaw.comment_activity_points ?? 2),
            comment_activity_daily_limit_count: Number(settingsRaw.comment_activity_daily_limit_count ?? 5),
            share_activity_points: Number(settingsRaw.share_activity_points ?? 10),
        };

        document.getElementById('profile-completion-points').value = settings.profile_completion_points;
        document.getElementById('post-activity-points').value = settings.post_activity_points;
        document.getElementById('post-activity-required-posts').value = settings.post_activity_required_posts;
        document.getElementById('comment-activity-points').value = settings.comment_activity_points;
        document.getElementById('comment-activity-daily-limit-count').value = settings.comment_activity_daily_limit_count;
        document.getElementById('share-activity-points').value = settings.share_activity_points;

        renderActivityRewardSettingsSummary(settings);
    } catch (error) {
        console.error('Failed to load activity reward settings:', error);
        renderActivityRewardSettingsSummary(null);
    }
}

async function saveActivityRewardSettings() {
    try {
        const profileCompletionPoints = Number(document.getElementById('profile-completion-points').value);
        const postActivityRequiredPosts = Number(document.getElementById('post-activity-required-posts').value);
        const postActivityPoints = Number(document.getElementById('post-activity-points').value);
        const commentActivityPoints = Number(document.getElementById('comment-activity-points').value);
        const commentActivityDailyLimitCount = Number(document.getElementById('comment-activity-daily-limit-count').value);
        const shareActivityPoints = Number(document.getElementById('share-activity-points').value);

        if (!Number.isFinite(profileCompletionPoints) || profileCompletionPoints < 0) {
            await showActionDialogInfo('❌ แต้มกรอกโปรไฟล์ครบต้องเป็น 0 หรือมากกว่า', 'ตรวจสอบข้อมูล');
            return;
        }
        if (!Number.isFinite(postActivityRequiredPosts) || postActivityRequiredPosts <= 0) {
            await showActionDialogInfo('❌ จำนวนโพสต์พร้อมรูปขั้นต่ำต้องมากกว่า 0', 'ตรวจสอบข้อมูล');
            return;
        }
        if (!Number.isFinite(postActivityPoints) || postActivityPoints < 0) {
            await showActionDialogInfo('❌ แต้มโพสต์ต้องเป็น 0 หรือมากกว่า', 'ตรวจสอบข้อมูล');
            return;
        }
        if (!Number.isFinite(commentActivityPoints) || commentActivityPoints < 0) {
            await showActionDialogInfo('❌ แต้มคอมเมนต์ต้องเป็น 0 หรือมากกว่า', 'ตรวจสอบข้อมูล');
            return;
        }
        if (!Number.isFinite(commentActivityDailyLimitCount) || commentActivityDailyLimitCount <= 0) {
            await showActionDialogInfo('❌ คอมเมนต์สูงสุด/วันต้องมากกว่า 0', 'ตรวจสอบข้อมูล');
            return;
        }
        if (!Number.isFinite(shareActivityPoints) || shareActivityPoints < 0) {
            await showActionDialogInfo('❌ แต้มแชร์ต้องเป็น 0 หรือมากกว่า', 'ตรวจสอบข้อมูล');
            return;
        }

        const confirmed = await openActionDialog({
            title: 'ยืนยันการบันทึก Activity Reward Settings',
            message:
                `โปรไฟล์ครบ: +${profileCompletionPoints}\n` +
                `โพสต์พร้อมรูปขั้นต่ำ: ${postActivityRequiredPosts} โพสต์/วัน\n` +
                `แต้มโพสต์: +${postActivityPoints}\n` +
                `แต้มคอมเมนต์: +${commentActivityPoints} ต่อคอมเมนต์\n` +
                `คอมเมนต์สูงสุดที่ได้แต้ม: ${commentActivityDailyLimitCount}/วัน\n` +
                `แต้มแชร์กิจกรรม: +${shareActivityPoints} (1 ครั้งต่อกิจกรรม)`,
            confirmText: 'บันทึกการตั้งค่า',
            cancelText: 'ยกเลิก',
            confirmClass: 'btn btn-check',
            showCancel: true
        });
        if (!confirmed) return;

        const response = await fetch(`${API_BASE_URL}/api/admin/reward-settings`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getStoredToken()}`
            },
            body: JSON.stringify({
                profile_completion_points: profileCompletionPoints,
                post_activity_required_posts: postActivityRequiredPosts,
                post_activity_points: postActivityPoints,
                comment_activity_points: commentActivityPoints,
                comment_activity_daily_limit_count: commentActivityDailyLimitCount,
                share_activity_points: shareActivityPoints,
            })
        });

        if (!response.ok) throw new Error('Failed to save activity settings');

        const result = await response.json();
        if (result.success) {
            await loadActivityRewardSettings();
            await showActionDialogInfo('✅ บันทึกการตั้งค่าแต้มกิจกรรมสำเร็จ', 'บันทึกสำเร็จ');
        }
    } catch (error) {
        console.error('Failed to save activity reward settings:', error);
        await showActionDialogInfo('❌ ไม่สามารถบันทึกการตั้งค่าแต้มกิจกรรม', 'เกิดข้อผิดพลาด');
    }
}

async function loadBonusEvents() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/bonus-events`, {
            headers: { 'Authorization': `Bearer ${getStoredToken()}` }
        });
        if (!response.ok) throw new Error('Failed to load events');
        
        const result = await response.json();
        if (!result.success || !result.data) return;

        const eventsList = document.getElementById('bonus-events-list');
        eventsList.innerHTML = result.data.map(event => `
            <div style="border:1px solid #ddd; padding:0.8rem; margin-bottom:0.8rem; border-radius:4px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                    <strong>${escapeHtml(event.event_name)}</strong>
                    <button class="btn btn-del" onclick="deleteBonusEvent(${event.event_id})" style="font-size:0.85rem;"><i class="fas fa-trash"></i> ลบ</button>
                </div>
                <small style="color:#666;">
                    <i class="fas fa-calendar"></i> ${event.start_date} ถึง ${event.end_date} | 
                    <i class="fas fa-coins"></i> ${event.points_awarded} แต้ม | 
                    ${event.is_active ? '✅ เปิด' : '❌ ปิด'}
                </small>
            </div>
        `).join('');
    } catch (error) {
        console.error('Failed to load bonus events:', error);
    }
}

function showBonusEventForm() {
    const today = new Date().toISOString().split('T')[0];
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    const endDate = futureDate.toISOString().split('T')[0];

    const html = `
        <div style="padding:1rem; border:1px solid #ddd; border-radius:4px; background:#f9f9f9;">
            <h3>สร้างอีเว้นแจกแต้มใหม่</h3>
            <div style="display:grid; gap:1rem;">
                <div>
                    <label>ชื่ออีเว้น:</label>
                    <input type="text" id="form-event-name" placeholder="เช่น Login Bonus Mon-Fri" style="width:100%; padding:0.5rem; border:1px solid #ddd; border-radius:4px; margin-top:0.3rem;">
                </div>
                <div>
                    <label>ประเภท:</label>
                    <select id="form-event-type" style="width:100%; padding:0.5rem; border:1px solid #ddd; border-radius:4px; margin-top:0.3rem;">
                        <option value="login_bonus">Login Bonus</option>
                        <option value="usage_bonus">Usage Bonus</option>
                        <option value="special_event">Special Event</option>
                    </select>
                </div>
                <div>
                    <label>จำนวนแต้ม:</label>
                    <input type="number" id="form-points" placeholder="10" style="width:100%; padding:0.5rem; border:1px solid #ddd; border-radius:4px; margin-top:0.3rem;">
                </div>
                <div>
                    <label>วันเริ่ม:</label>
                    <input type="date" id="form-start-date" value="${today}" style="width:100%; padding:0.5rem; border:1px solid #ddd; border-radius:4px; margin-top:0.3rem;">
                </div>
                <div>
                    <label>วันสิ้นสุด:</label>
                    <input type="date" id="form-end-date" value="${endDate}" style="width:100%; padding:0.5rem; border:1px solid #ddd; border-radius:4px; margin-top:0.3rem;">
                </div>
                <div>
                    <label>ประเภทรางวัล:</label>
                    <select id="form-bonus-type" style="width:100%; padding:0.5rem; border:1px solid #ddd; border-radius:4px; margin-top:0.3rem;">
                        <option value="one_time">ครั้งเดียว</option>
                        <option value="recurring_daily">ทุกวัน</option>
                    </select>
                </div>
                <div style="display:flex; gap:0.5rem;">
                    <button class="btn btn-check" onclick="createBonusEvent()" style="flex:1;">✅ สร้าง</button>
                    <button class="btn btn-del" onclick="loadBonusEvents()" style="flex:1;">❌ ยกเลิก</button>
                </div>
            </div>
        </div>
    `;

    document.getElementById('bonus-events-list').innerHTML = html;
}

async function createBonusEvent() {
    try {
        const eventName = document.getElementById('form-event-name').value.trim();
        const eventType = document.getElementById('form-event-type').value;
        const points = Number(document.getElementById('form-points').value);
        const startDate = document.getElementById('form-start-date').value;
        const endDate = document.getElementById('form-end-date').value;
        const bonusType = document.getElementById('form-bonus-type').value;

        if (!eventName || isNaN(points) || !startDate || !endDate) {
            alert('❌ กรุณากรอกข้อมูลให้ครบถ้วน');
            return;
        }

        const response = await fetch(`${API_BASE_URL}/api/admin/bonus-events`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getStoredToken()}`
            },
            body: JSON.stringify({
                event_name: eventName,
                event_type: eventType,
                points_awarded: points,
                start_date: startDate,
                end_date: endDate,
                bonus_type: bonusType,
                is_active: true
            })
        });

        if (!response.ok) throw new Error('Failed to create event');
        
        const result = await response.json();
        if (result.success) {
            alert('✅ สร้างอีเว้นสำเร็จ!');
            await loadBonusEvents();
        }
    } catch (error) {
        console.error('Failed to create bonus event:', error);
        alert('❌ ไม่สามารถสร้างอีเว้น');
    }
}

async function deleteBonusEvent(eventId) {
    if (!confirm('ยืนยันการลบอีเว้นนี้หรือไม่?')) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/bonus-events/${eventId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getStoredToken()}` }
        });

        if (!response.ok) throw new Error('Failed to delete event');
        
        const result = await response.json();
        if (result.success) {
            alert('✅ ลบอีเว้นสำเร็จ!');
            await loadBonusEvents();
        }
    } catch (error) {
        console.error('Failed to delete bonus event:', error);
        alert('❌ ไม่สามารถลบอีเว้น');
    }
}

function navTo(page, targetElement) {
    document.querySelectorAll('.nav-item').forEach((el) => el.classList.remove('active'));
    if (targetElement) {
        targetElement.classList.add('active');
    }

    document.querySelectorAll('.page-content').forEach((el) => el.classList.remove('active'));

    const target = document.getElementById('page-' + page);
    if (target) {
        target.classList.add('active');

        if (page === 'points') {
            pointsShowTab('leaderboard');
        }

        if (page === 'reward-catalog') {
            campaignsShowTab('codes');
        }

        if (page === 'partners') {
            loadPartnersList();
        }

        if (page === 'redemptions') {
            redemptionShowTab('summary');
            initRedemptionFilters();
            loadRedemptions();
        }

        if (page === 'scan-qr') {
            loadQRStats();
        }

        if (page === 'companies') {
            loadAllElderAccounts();
        }

        if (page === 'articles') {
            loadArticlesAdmin('pending');
        }

        if (page === 'banners') {
            loadBannersAdmin();
        }

        if (page === 'comments') {
            loadReportedComments();
        }

        if (page === 'groups') {
            loadGroupsAdmin();
        }
    } else {
        document.getElementById('page-fallback').classList.add('active');
        document.getElementById('fallback-name').innerText = page;
    }
}

function findNavItemByPage(page) {
    return document.querySelector(`.nav-item[onclick*="navTo('${page}'"]`);
}

function pointsShowTab(tab) {
    ['leaderboard', 'settings'].forEach((t) => {
        const panel = document.getElementById('points-panel-' + t);
        const btn = document.getElementById('points-tab-' + t);
        if (panel) panel.style.display = (t === tab) ? 'block' : 'none';
        if (btn) btn.classList.toggle('active', t === tab);
    });
    if (tab === 'settings') {
        loadRewardSettings();
        loadDailyLoginSettings();
        loadStreakMilestoneSettings();
        loadActivityRewardSettings();
        loadBonusEvents();
    }
}

function campaignsShowTab(tab) {
    ['codes', 'verifier'].forEach((t) => {
        const panel = document.getElementById('campaign-panel-' + t);
        const btn = document.getElementById('campaign-tab-' + t);
        if (panel) panel.style.display = (t === tab) ? 'block' : 'none';
        if (btn) btn.classList.toggle('active', t === tab);
    });
    if (tab === 'codes') {
        const csvTemplateBtn = document.getElementById('promo-csv-template-btn');
        const csvUploadBtn = document.getElementById('promo-csv-upload-btn');
        if (csvTemplateBtn) csvTemplateBtn.onclick = downloadCsvTemplate;
        if (csvUploadBtn) csvUploadBtn.onclick = uploadPromoCodesToCampaign;
        return loadRewardsForUpload();
    }
    if (tab === 'verifier') {
        return initPromoVerifier();
    }
    return Promise.resolve();
}

function navToCampaignsTab(tab) {
    const navItem = findNavItemByPage('reward-catalog');
    navTo('reward-catalog', navItem);
    return campaignsShowTab(tab);
}

function redemptionShowTab(tab) {
    ['summary', 'users', 'analytics'].forEach((t) => {
        const panel = document.getElementById('redemption-panel-' + t);
        const btn = document.getElementById('redemption-tab-' + t);
        if (panel) panel.style.display = (t === tab) ? 'block' : 'none';
        if (btn) btn.classList.toggle('active', t === tab);
    });
}

let elderAccountsLoaded = false;

// The dashboard-summary payload only carries the latest 20 users for the home page preview.
// Elder Accounts needs the full list so search/scroll actually reaches everyone, not just the newest 20.
async function loadAllElderAccounts() {
    if (elderAccountsLoaded) return;
    setEmptyRow('company-table', 5, 'กำลังโหลดผู้ใช้งานทั้งหมด...');
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/users`, {
            headers: getAuthHeaders()
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        companySourceRows = Array.isArray(data.users) ? data.users : [];
        elderAccountsLoaded = true;
        applyCompanyFilters();
    } catch (error) {
        console.error('Failed to load elder accounts:', error);
        setEmptyRow('company-table', 5, 'โหลดรายชื่อผู้ใช้งานไม่สำเร็จ กรุณารีเฟรชหน้า');
    }
}

async function loadQRStats() {
    const totalEl = document.getElementById('stat-total-qr');
    const availableEl = document.getElementById('stat-available-qr');
    const usedEl = document.getElementById('stat-used-qr');
    if (!totalEl || !availableEl || !usedEl) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/promo-codes/stats`, {
            headers: getAuthHeaders()
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const stats = data.data || {};
        totalEl.textContent = formatNumber(Number(stats.total || 0));
        availableEl.textContent = formatNumber(Number(stats.available || 0));
        usedEl.textContent = formatNumber(Number(stats.used || 0));
    } catch (error) {
        console.error('Failed to load QR stats:', error);
        totalEl.textContent = '-';
        availableEl.textContent = '-';
        usedEl.textContent = '-';
    }
}

function getPostStatusDisplay(row = {}) {
    const normalizedStatus = String(row.status || '').toLowerCase();
    const reportCount = Number(row.reportCount || row.pendingReportCount || 0);

    if (normalizedStatus === 'deleted') {
        return { text: 'ถูกลบ', badgeClass: 'bg-urgent' };
    }

    if (normalizedStatus === 'hidden') {
        return { text: 'ถูกซ่อน', badgeClass: 'bg-pending' };
    }

    if (normalizedStatus === 'reported' || reportCount > 0) {
        return { text: `ถูกรายงาน (${formatNumber(reportCount)})`, badgeClass: 'bg-pending' };
    }

    return { text: 'ปกติ', badgeClass: 'bg-success' };
}

function escapeHtml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Some legacy content was saved with literal "\r\n"/"\n" characters instead of real line breaks.
// Escapes the text for safe HTML, then renders both real and literal line breaks as <br>.
function escapeHtmlMultiline(text) {
    return escapeHtml(text).replace(/\\r\\n|\\n|\r\n|\n/g, '<br>');
}

function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('th-TH', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatTimeAgo(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';

    const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return `${seconds} วินาทีที่แล้ว`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} นาทีที่แล้ว`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} วันที่แล้ว`;

    return formatDate(value);
}

function getContentRowByPostId(postId) {
    const normalizedPostId = Number(postId);
    if (!Number.isFinite(normalizedPostId) || normalizedPostId <= 0) return null;

    return contentMonitorSourceRows.find((row) => Number(row.postId || 0) === normalizedPostId) || null;
}

function updateModerationFilterButtons() {
    document.querySelectorAll('[data-content-filter]').forEach((button) => {
        button.classList.toggle('active', button.dataset.contentFilter === currentContentFilter);
    });

    document.querySelectorAll('[data-report-filter]').forEach((button) => {
        button.classList.toggle('active', button.dataset.reportFilter === currentReportFilter);
    });
}

function bindModerationFilters() {
    if (moderationFiltersBound) return;
    moderationFiltersBound = true;

    document.querySelectorAll('[data-content-filter]').forEach((button) => {
        button.addEventListener('click', () => {
            currentContentFilter = button.dataset.contentFilter || 'all';
            updateModerationFilterButtons();
            renderContentMonitor(contentMonitorSourceRows);
        });
    });

    document.querySelectorAll('[data-report-filter]').forEach((button) => {
        button.addEventListener('click', () => {
            currentReportFilter = button.dataset.reportFilter || 'pending';
            updateModerationFilterButtons();
            renderReports(reportQueueSourceRows);
        });
    });
}

async function runPostModerationAction(postId, action, source = 'moderation') {
    const normalizedPostId = Number(postId);
    if (!Number.isFinite(normalizedPostId) || normalizedPostId <= 0) return;

    const actionMap = {
        delete: {
            title: 'ยืนยันการลบโพสต์',
            message: 'ต้องการลบโพสต์นี้หรือไม่?',
            confirmText: 'ลบโพสต์',
            confirmClass: 'btn btn-del',
            successMessage: 'ลบโพสต์เรียบร้อยแล้ว'
        },
        hide: {
            title: 'ยืนยันการซ่อนโพสต์',
            message: 'ต้องการซ่อนโพสต์นี้จากผู้ใช้อื่นหรือไม่?',
            confirmText: 'ซ่อนโพสต์',
            confirmClass: 'btn btn-check',
            successMessage: 'ซ่อนโพสต์เรียบร้อยแล้ว'
        },
        warn: {
            title: 'ยืนยันการส่งคำเตือน',
            message: 'ต้องการส่งคำเตือนให้ผู้ใช้ของโพสต์นี้หรือไม่?',
            confirmText: 'ส่งคำเตือน',
            confirmClass: 'btn btn-check',
            successMessage: 'ส่งคำเตือนเรียบร้อยแล้ว'
        },
        dismiss: {
            title: 'ยืนยันการปฏิเสธรายงาน',
            message: 'ต้องการปฏิเสธรายงานและคืนสถานะรายการนี้หรือไม่?',
            confirmText: 'ปฏิเสธรายงาน',
            confirmClass: 'btn btn-soft',
            successMessage: 'ปฏิเสธรายงานเรียบร้อยแล้ว'
        }
    };

    const config = actionMap[action];
    if (!config) return;

    const confirmed = await openActionDialog({
        title: config.title,
        message: config.message,
        confirmText: config.confirmText,
        cancelText: 'ยกเลิก',
        confirmClass: config.confirmClass,
        showCancel: true
    });
    if (!confirmed) return;

    await fetchAuthJson(`${API_BASE_URL}/api/admin/posts/${normalizedPostId}/moderate`, {
        method: 'POST',
        body: JSON.stringify({
            action,
            reason: source === 'report_queue' ? 'ดำเนินการจาก Report Queue' : 'ดำเนินการจาก Content Monitor'
        })
    });

    await showActionDialogInfo(config.successMessage, 'สำเร็จ');
    await loadDashboardSummary();
}

function setEmptyRow(tbodyId, colSpan, text) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="${colSpan}" class="empty-row">${escapeHtml(text)}</td></tr>`;
}

function formatNumber(value) {
    return Number(value || 0).toLocaleString('th-TH');
}

async function fetchAuthJson(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
            ...(options.headers || {})
        }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = data?.error || `HTTP ${response.status}`;
        throw new Error(message);
    }

    return data;
}

function updateStatus(isConnected) {
    const statusEl = document.getElementById('db-status');
    if (!statusEl) return;

    if (isConnected) {
        statusEl.textContent = '● Online';
        statusEl.style.color = 'var(--s-green)';
        return;
    }

    statusEl.textContent = '● Offline';
    statusEl.style.color = 'var(--d-red)';
}

function updateStats(summary) {
    document.getElementById('stat-users-total').textContent = formatNumber(summary.usersTotal);
    document.getElementById('stat-users-today').textContent = formatNumber(summary.usersToday);
    document.getElementById('stat-posts-total').textContent = formatNumber(summary.postsTotal);
    document.getElementById('stat-posts-today').textContent = formatNumber(summary.postsToday);
    document.getElementById('stat-likes-total').textContent = formatNumber(summary.likesTotal);
    document.getElementById('stat-comments-total').textContent = formatNumber(summary.commentsTotal);
}

function updateHomeSecurity(security, summary) {
    const otpReq = document.getElementById('home-otp-request');
    const otpFail = document.getElementById('home-otp-failed');
    const otpSuccessRate = document.getElementById('home-otp-success-rate');
    const alertsCount = document.getElementById('home-alerts-count');
    if (otpReq) otpReq.textContent = formatNumber(security.otpRequestToday);
    if (otpFail) otpFail.textContent = formatNumber(security.otpFailedToday);
    if (otpSuccessRate) otpSuccessRate.textContent = `${formatNumber(security.otpSuccessRate || 0)}%`;
    if (alertsCount) alertsCount.textContent = formatNumber((Array.isArray(security.alerts) ? security.alerts.length : 0));
}

function getSecurityEventCategory(eventType) {
    const value = String(eventType || '').toLowerCase();
    if (value.includes('login')) return 'login';
    if (value.includes('otp')) return 'otp';
    return 'security';
}

function getSecurityRangeCutoff(range) {
    const now = new Date();
    if (range === 'today') {
        now.setHours(0, 0, 0, 0);
        return now;
    }

    if (range === '7d') {
        now.setDate(now.getDate() - 7);
        return now;
    }

    now.setDate(now.getDate() - 30);
    return now;
}

function getSecurityEventBadgeClass(eventType) {
    const value = String(eventType || '').toLowerCase();
    if (value.includes('failed')) return 'bg-urgent';
    if (value.includes('blocked')) return 'bg-urgent';
    if (value.includes('success')) return 'bg-success';
    if (value.includes('request')) return 'bg-pending';
    if (value.includes('unblocked')) return 'badge-neutral';
    return 'badge-neutral';
}

function filterSecurityLogs(logs) {
    const cutoff = getSecurityRangeCutoff(currentSecurityState.range);
    return (logs || []).filter((log) => {
        const createdAt = new Date(log.createdAt || 0);
        if (Number.isNaN(createdAt.getTime()) || createdAt < cutoff) {
            return false;
        }

        const category = getSecurityEventCategory(log.eventType || log.eventLabel || log.event);
        if (currentSecurityState.category !== 'all' && category !== currentSecurityState.category) {
            return false;
        }

        return true;
    });
}

function updateSecurityFilterButtons() {
    document.querySelectorAll('[data-security-range]').forEach((button) => {
        button.classList.toggle('active', button.dataset.securityRange === currentSecurityState.range);
    });

    document.querySelectorAll('[data-security-category]').forEach((button) => {
        button.classList.toggle('active', button.dataset.securityCategory === currentSecurityState.category);
    });
}

function bindSecurityFilters() {
    if (securityFiltersBound) return;
    securityFiltersBound = true;

    document.querySelectorAll('[data-security-range]').forEach((button) => {
        button.addEventListener('click', () => {
            currentSecurityState.range = button.dataset.securityRange || 'today';
            renderSecurity(currentSecurityState);
        });
    });

    document.querySelectorAll('[data-security-category]').forEach((button) => {
        button.addEventListener('click', () => {
            currentSecurityState.category = button.dataset.securityCategory || 'all';
            renderSecurity(currentSecurityState);
        });
    });
}

function renderSecurityAlerts(alerts) {
    const container = document.getElementById('security-alerts');
    if (!container) return;

    if (!alerts || alerts.length === 0) {
        container.innerHTML = '<div class="security-alert empty">ยังไม่มี security alert</div>';
        return;
    }

    container.innerHTML = alerts.map((alertItem) => `
        <div class="security-alert ${escapeHtml(alertItem.severity || 'info')}">
            <div class="security-alert-head">
                <strong>${escapeHtml(alertItem.title || 'Alert')}</strong>
                <span>${escapeHtml((alertItem.severity || 'info').toUpperCase())}</span>
            </div>
            <div class="security-alert-body">${escapeHtml(alertItem.message || '')}</div>
        </div>
    `).join('');
}

function renderSecurityLogsTable(logs) {
    const tbody = document.getElementById('security-table');
    if (!tbody) return;

    if (!logs || logs.length === 0) {
        setEmptyRow('security-table', 5, 'ไม่พบ security logs');
        return;
    }

    tbody.innerHTML = logs.map((log) => `
        <tr>
            <td><span class="badge ${getSecurityEventBadgeClass(log.eventType)}">${escapeHtml(log.eventLabel || log.eventType || 'security_event')}</span></td>
            <td>
                <div class="security-user-cell">
                    <strong>${escapeHtml(log.actor || '-')}</strong>
                    <span>${escapeHtml(log.actorPhone || '-')}</span>
                </div>
            </td>
            <td class="security-detail-cell">
                <div>${escapeHtml(log.detail || '-')}</div>
                ${log.target && log.target !== '-' ? `<small class="sec-muted">Target: ${escapeHtml(log.target)}${log.targetPhone && log.targetPhone !== '-' ? ` (${escapeHtml(log.targetPhone)})` : ''}</small>` : ''}
            </td>
            <td class="security-meta-cell">
                <div>${escapeHtml(log.ipAddress || '-')}</div>
                ${log.device && log.device !== '-' ? `<small class="sec-muted">${escapeHtml(log.device)}</small>` : ''}
            </td>
            <td class="security-time-cell">${formatDate(log.createdAt)}</td>
        </tr>
    `).join('');
}

function renderTrendingPosts(rows) {
    const tbody = document.getElementById('trending-table');
    if (!tbody) return;

    if (!rows || rows.length === 0) {
        setEmptyRow('trending-table', 5, 'ยังไม่มีโพสต์ในระบบ');
        return;
    }

    console.log('Trending posts rows (BEFORE sort):', rows); // DEBUG

    // Sort by likes DESC (primary) then comments DESC (secondary)
    const sortedRows = [...rows].sort((a, b) => {
        if (b.likes !== a.likes) {
            return b.likes - a.likes;
        }
        return b.comments - a.comments;
    });

    console.log('Trending posts rows (AFTER sort):', sortedRows); // DEBUG

    tbody.innerHTML = sortedRows.slice(0, 8).map((row) => {
        const phoneNumber = row.authorPhone || row.phone_number || '-';
        const groupName = row.groupName || 'ทั่วไป';
        const groupBadgeClass = row.groupId ? 'badge-primary' : 'badge-neutral';
        
        console.log(`Post: ${row.content?.substring(0, 30)} | Likes: ${row.likes} | Phone: ${phoneNumber} | Group: ${groupName}`); // DEBUG
        
        return `
        <tr>
            <td class="truncate" title="${escapeHtml(row.content)}">${escapeHtml(row.content)}</td>
            <td>${escapeHtml(phoneNumber)}</td>
            <td><span class="badge ${groupBadgeClass}">${escapeHtml(groupName)}</span></td>
            <td><i class="fas fa-thumbs-up"></i> ${formatNumber(row.likes)} <i class="fas fa-comments"></i> ${formatNumber(row.comments)}</td>
            <td><button class="btn btn-check" data-trending-view-post="${row.postId}" type="button">ดูรายละเอียด</button></td>
        </tr>
    `;
    }).join('');
}

function renderActivityFeed(rows) {
    const feed = document.getElementById('activity-feed');
    if (!feed) return;

    if (!rows || rows.length === 0) {
        feed.innerHTML = '<div class="act-time">ยังไม่มีกิจกรรมล่าสุด</div>';
        return;
    }

    feed.innerHTML = rows.slice(0, 6).map((row) => `
        <div class="activity-item">
            <div class="act-icon"><i class="fas fa-newspaper"></i></div>
            <div class="act-text">${escapeHtml(row.author)} <b>โพสต์ใหม่</b><br><span class="act-time">${formatDate(row.createdAt)}</span></div>
        </div>
    `).join('');
}

function renderContentMonitor(rows) {
    const tbody = document.getElementById('content-monitor-table');
    if (!tbody) return;

    contentMonitorSourceRows = Array.isArray(rows) ? rows : [];
    bindModerationFilters();
    updateModerationFilterButtons();

    const now = Date.now();
    const filteredRows = contentMonitorSourceRows.filter((row) => {
        const reportCount = Number(row.reportCount || row.pendingReportCount || 0);
        const engagement = Number(row.likes || 0) + Number(row.comments || 0);
        const createdAtMs = new Date(row.createdAt || 0).getTime();
        const isRecent = Number.isFinite(createdAtMs) && (now - createdAtMs) <= 24 * 60 * 60 * 1000;
        const searchText = `${row.author || ''} ${row.authorPhone || ''} ${row.content || ''}`.toLowerCase();

        if (currentContentSearchQuery) {
            const normalizedQuery = currentContentSearchQuery.toLowerCase();
            if (!searchText.includes(normalizedQuery)) {
                return false;
            }
        }

        if (currentContentFilter === 'reported') {
            return reportCount > 0 || String(row.status || '').toLowerCase() === 'reported';
        }

        if (currentContentFilter === 'new') {
            return isRecent;
        }

        if (currentContentFilter === 'engagement') {
            return engagement >= 10;
        }

        return true;
    });

    if (filteredRows.length === 0) {
        setEmptyRow('content-monitor-table', 8, currentContentSearchQuery ? 'ไม่พบโพสต์ที่ตรงกับคำค้นหา' : 'ไม่พบโพสต์ตามเงื่อนไขที่เลือก');
        return;
    }

    tbody.innerHTML = filteredRows.map((row) => {
        const statusDisplay = getPostStatusDisplay(row);
        const normalizedPostId = Number(row.postId || 0);
        const reportCount = Number(row.reportCount || row.pendingReportCount || 0);
        const reportBadgeClass = reportCount > 0 ? 'bg-urgent' : 'bg-success';

        return `
        <tr>
            <td>
                <button class="user-link-btn" type="button" data-open-user-post="${normalizedPostId}">${escapeHtml(row.author)}</button>
            </td>
            <td class="truncate" title="${escapeHtml(row.content)}">${escapeHtml(row.content)}</td>
            <td><span class="badge ${statusDisplay.badgeClass}">${escapeHtml(statusDisplay.text)}</span></td>
            <td><i class="fas fa-thumbs-up"></i> ${formatNumber(row.likes)} / <i class="fas fa-comments"></i> ${formatNumber(row.comments)}</td>
            <td><span class="badge ${reportBadgeClass}"><i class="fas fa-flag"></i> ${formatNumber(reportCount)}</span></td>
            <td>${formatDate(row.createdAt)}</td>
            <td>
                <div class="quick-actions-wrap">
                    <button class="btn btn-del" data-post-action="delete" data-post-id="${normalizedPostId}" type="button"><i class="fas fa-trash"></i> ลบ</button>
                    <button class="btn btn-soft" data-post-action="hide" data-post-id="${normalizedPostId}" type="button"><i class="fas fa-eye"></i> ซ่อน</button>
                </div>
            </td>
            <td>
                <button class="btn btn-check" data-view-post="${normalizedPostId}" type="button">ดูรายละเอียด</button>
            </td>
        </tr>
    `;
    }).join('');
}

function closePostDetailModal() {
    const modal = document.getElementById('post-detail-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    currentPostDetail = null;
}

function closeUserDetailModal() {
    const modal = document.getElementById('user-detail-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    currentUserDetail = null;
}

function closeQRDetailModal() {
    const modal = document.getElementById('qr-detail-modal');
    if (!modal) return;
    modal.classList.add('hidden');
}

function normalizeUserRow(row, source = '') {
    const name = row?.full_name || row?.name || row?.username || row?.author || 'ผู้ใช้งาน';
    const phone = row?.phone_number || row?.phone || row?.regNo || row?.authorPhone || '';
    const aboutMe = row?.about_me ?? row?.aboutMe ?? row?.about ?? row?.description ?? '';
    const isBlocked = Boolean(row?.is_blocked || row?.isBlocked || row?.blocked || String(row?.status || '').toLowerCase() === 'blocked');

    return {
        name,
        full_name: name,
        user_id: row?.user_id || null,
        phone,
        phone_number: phone,
        profile_picture: row?.profile_picture || null,
        profile_picture_url: row?.profile_picture_url || null,
        aboutMe,
        about_me: aboutMe,
        created_at: row?.created_at || row?.createdAt || null,
        last_login_at: row?.last_login_at || row?.lastLoginAt || null,
        source,
        statusLabel: isBlocked ? 'ถูกบล็อค' : 'ใช้งานปกติ',
        isBlocked,
        is_blocked: isBlocked
    };
}

function buildUserDetailFromDashboard(seed) {
    const pointsRows = dashboardPayload?.sections?.points || [];
    const postRows = dashboardPayload?.sections?.contentMonitor || [];
    const securityLogs = dashboardPayload?.sections?.security?.logs || [];

    const point = pointsRows.find((row) =>
        (seed.phone && row.phone === seed.phone) ||
        row.name === seed.name
    );

    const recentPosts = postRows
        .filter((row) =>
            (seed.phone && row.authorPhone === seed.phone) ||
            row.author === seed.name
        )
        .slice(0, 6);

    const blockHistory = securityLogs
        .filter((log) => {
            const eventText = String(log.event || '').toLowerCase();
            const userText = String(log.user || '');
            const isBlockEvent = eventText.includes('block') || eventText.includes('บล็อค') || eventText.includes('ระงับ');
            if (!isBlockEvent) return false;
            if (seed.phone && userText.includes(seed.phone)) return true;
            return userText.includes(seed.name);
        })
        .slice(0, 8);

    return {
        profile: {
            user_id: seed.user_id || null,
            full_name: seed.full_name || seed.name || 'ผู้ใช้งาน',
            phone_number: seed.phone_number || seed.phone || '-',
            profile_picture: seed.profile_picture || null,
            profile_picture_url: seed.profile_picture_url || null,
            role: seed.role || 'elder',
            is_verified: Boolean(seed.is_verified),
            created_at: seed.created_at || null,
            gender: seed.gender || null,
            birth_date: seed.birth_date || null,
            hometown: seed.hometown || null,
            current_location: seed.current_location || null,
            pronouns: seed.pronouns || null,
            about_me: seed.about_me ?? seed.aboutMe ?? '',
            family_info: seed.family_info || null,
            is_blocked: Boolean(seed.is_blocked || seed.isBlocked),
            blocked_reason: seed.blocked_reason || null,
            warning_note: seed.warning_note || null,
            blocked_at: seed.blocked_at || null,
            total_points: point?.totalPoints ?? 0,
            streak: point?.streak ?? 0,
            last_login_at: seed.last_login_at || null,
            last_checkin_date: seed.last_checkin_date || null,
            source: seed.source || 'dashboard'
        },
        recentPosts,
        blockHistory
    };
}

function renderUserDetail(payload) {
    const body = document.getElementById('user-detail-body');
    if (!body) return;

    const profile = payload?.profile || {};
    const posts = payload?.recentPosts || [];
    const history = payload?.blockHistory || [];

    const getAboutText = (value) => {
        const raw = value == null ? '' : String(value).trim();
        if (!raw) return 'ยังไม่ได้เพิ่มข้อมูล';
        if (raw === '-' || raw.toLowerCase() === 'null' || raw.toLowerCase() === 'undefined') {
            return 'ยังไม่ได้เพิ่มข้อมูล';
        }
        // Guard against accidental filename fallback in about section.
        if (/^profile_.*\.pdf$/i.test(raw)) return 'ยังไม่ได้เพิ่มข้อมูล';
        return raw;
    };

    // Helper functions
    const getRoleBadge = (role) => {
        const roleMap = {
            'admin': { label: 'admin', color: 'bg-urgent', icon: '<i class="fas fa-crown"></i>' },
            'elder': { label: 'elder', color: 'bg-success', icon: '<i class="fas fa-person"></i>' },
            'caregiver': { label: 'caregiver', color: 'bg-pending', icon: '<i class="fas fa-stethoscope"></i>' }
        };
        const roleInfo = roleMap[role] || { label: role, color: 'bg-info', icon: '<i class="fas fa-user"></i>' };
        return `<span class="badge ${roleInfo.color}">${roleInfo.icon} ${roleInfo.label}</span>`;
    };

    const getVerificationBadge = (isVerified) => {
        return isVerified 
            ? '<span class="badge bg-success">✅ verified</span>'
            : '<span class="badge bg-pending">❌ not verified</span>';
    };

    const resolveMediaUrl = (rawUrl) => {
        if (!rawUrl || !String(rawUrl).trim()) return '';

        const url = String(rawUrl).trim();
        if (/^https?:\/\//i.test(url)) return url;

        const normalized = url.replace(/^\/+/, '');
        if (normalized.startsWith('uploads/')) {
            return `${API_BASE_URL}/${normalized}`;
        }

        return `${API_BASE_URL}/uploads/${normalized}`;
    };

    const resolveProfilePictureUrl = (picture) => resolveMediaUrl(picture);

    const getProfilePictureHtml = (picture, pictureUrlFromApi) => {
        const pictureUrl = pictureUrlFromApi || resolveProfilePictureUrl(picture);
        if (pictureUrl) {
            return `<img src="${escapeHtml(pictureUrl)}" onerror="this.onerror=null;this.style.display='none';this.nextElementSibling.style.display='flex';" style="width:80px; height:80px; border-radius:50%; object-fit:cover; border:2px solid #e0e0e0;">
                    <div style="display:none; width:80px; height:80px; border-radius:50%; background:#e0e0e0; align-items:center; justify-content:center; font-size:2rem; border:2px solid #ccc;">👤</div>`;
        }
        return `<div style="width:80px; height:80px; border-radius:50%; background:#e0e0e0; display:flex; align-items:center; justify-content:center; font-size:2rem; border:2px solid #ccc;">👤</div>`;
    };

    const formatBirthDate = (date) => {
        if (!date) return '-';
        const d = new Date(date);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`;
    };

    const postsHtml = posts.length
        ? posts.map((post) => `
            <tr style="cursor:pointer; transition:0.2s;" onclick="openPostDetailFromList('${escapeHtml(post.post_id || '')}', '${escapeHtml(JSON.stringify(post).replace(/'/g, '&#39;'))}')" onmouseover="this.style.backgroundColor='#f5f7ff'" onmouseout="this.style.backgroundColor=''">
                <td class="truncate" title="${escapeHtml(post.content)}" style="color:#3658c1;text-decoration:underline;">${escapeHtml(post.content || '-')}</td>
                <td>${formatDate(post.created_at || post.createdAt)}</td>
                <td><i class="fas fa-thumbs-up"></i> ${formatNumber(post.likes)} / <i class="fas fa-comments"></i> ${formatNumber(post.comments)}</td>
            </tr>
        `).join('')
        : '<tr><td colspan="3" class="empty-row">ยังไม่มีโพสต์ล่าสุด</td></tr>';

    const historyHtml = history.length
        ? history.map((log) => `
            <tr>
                <td>${escapeHtml(log.event || '-')}</td>
                <td>${formatDate(log.created_at || log.createdAt)}</td>
                <td>${escapeHtml(log.user || '-')}</td>
            </tr>
        `).join('')
        : '<tr><td colspan="3" class="empty-row">ยังไม่มีประวัติการบล็อค</td></tr>';

    body.innerHTML = `
        <div class="detail-grid user-detail-grid">
            
            <!-- 1. โปรไฟล์ผู้ใช้ -->
            <section class="detail-section">
                <h3>👤 โปรไฟล์ผู้ใช้</h3>
                <div style="display:flex; gap:1rem; align-items:flex-start; margin-bottom:1rem;">
                    <div>${getProfilePictureHtml(profile.profile_picture, profile.profile_picture_url)}</div>
                    <div style="flex:1;">
                        <div style="font-size:1.1rem; font-weight:600; margin-bottom:0.3rem;">${escapeHtml(profile.full_name || 'ผู้ใช้งาน')}</div>
                        <div style="display:flex; gap:0.5rem; margin-bottom:0.5rem; flex-wrap:wrap;">
                            ${getRoleBadge(profile.role)}
                            ${getVerificationBadge(profile.is_verified)}
                        </div>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.8rem; font-size:0.9rem;">
                    <div><strong>user_id:</strong> ${escapeHtml(profile.user_id || '-')}</div>
                    <div><strong>เบอร์โทร:</strong> ${escapeHtml(profile.phone_number || '-')}</div>
                    <div><strong>สร้างบัญชี:</strong> ${profile.created_at ? formatDate(profile.created_at) : '-'}</div>
                    <div><strong>ล่าสุด:</strong> ${profile.last_login_at ? formatDate(profile.last_login_at) : '-'}</div>
                </div>
            </section>

            <!-- 2. ข้อมูลส่วนตัว -->
            <section class="detail-section">
                <h3><i class="fas fa-id-card"></i> ข้อมูลส่วนตัว</h3>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.8rem; font-size:0.9rem;">
                    <div><strong>เพศ:</strong> ${escapeHtml(profile.gender || '-')}</div>
                    <div><strong>วันเกิด:</strong> ${formatBirthDate(profile.birth_date)}</div>
                    <div><strong>บ้านเกิด:</strong> ${escapeHtml(profile.hometown || '-')}</div>
                    <div><strong>ที่อยู่ปัจจุบัน:</strong> ${escapeHtml(profile.current_location || '-')}</div>
                    <div style="grid-column: 1/-1;"><strong>สรรพนาม:</strong> ${escapeHtml(profile.pronouns || '-')}</div>
                </div>
            </section>

            <!-- 3. เกี่ยวกับผู้ใช้ -->
            <section class="detail-section">
                <h3><i class="fas fa-lightbulb"></i> เกี่ยวกับผู้ใช้ (About)</h3>
                <div class="detail-content" style="background:#f8f9fa; padding:0.75rem; border-radius:4px; border-left:3px solid #1cc88a;">
                    ${escapeHtml(getAboutText(profile.about_me ?? profile.aboutMe))}
                </div>
            </section>

            <!-- 4. ข้อมูลครอบครัว -->
            <section class="detail-section">
                <h3><i class="fas fa-users"></i> ข้อมูลครอบครัว</h3>
                <div class="detail-content" style="background:#f8f9fa; padding:0.75rem; border-radius:4px; border-left:3px solid #36b9cc;">
                    ${escapeHtml(profile.family_info || 'ยังไม่มีข้อมูล')}
                </div>
            </section>

            <!-- 5. สถานะบัญชี -->
            <section class="detail-section">
                <h3><i class="fas fa-chart-bar"></i> สถานะบัญชี</h3>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.8rem; font-size:0.9rem;">
                    <div><strong>สถานะ:</strong> <span class="badge ${profile.is_blocked ? 'bg-urgent' : 'bg-success'}">${profile.is_blocked ? '<i class="fas fa-circle" style="color:#dc3545;"></i> ถูกบล็อค' : '<i class="fas fa-check-circle" style="color:#28a745;"></i> ใช้งานปกติ'}</span></div>
                    <div><strong>เหตุผล:</strong> ${escapeHtml(profile.blocked_reason || 'ไม่มี')}</div>
                    <div style="grid-column: 1/-1;"><strong>เตือน:</strong> ${escapeHtml(profile.warning_note || 'ไม่มี')}</div>
                    <div><strong>บล็อคเมื่อ:</strong> ${formatDate(profile.blocked_at) || 'ไม่ได้บล็อค'}</div>
                </div>
            </section>

            <!-- 6. Activity -->
            <section class="detail-section">
                <h3><i class="fas fa-chart-line"></i> Activity</h3>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.8rem; font-size:0.9rem;">
                    <div><strong>ใช้งานล่าสุด:</strong> ${formatDate(profile.last_login_at) || 'ไม่ได้ใช้'}</div>
                    <div><strong>Streak:</strong> ${formatNumber(profile.streak || 0)} วัน</div>
                    <div><strong>เช็คอินล่าสุด:</strong> ${formatDate(profile.last_checkin_date) || 'ไม่มี'}</div>
                    <div><strong>แต้ม:</strong> ${formatNumber(profile.total_points || 0)}</div>
                </div>
            </section>

        </div>

        <!-- โพสต์ล่าสุด (ด้านล่าง) -->
        <section class="detail-section" style="margin-top:1rem;">
            <h3><i class="fas fa-pen"></i> โพสต์ล่าสุด <small style="font-size:0.8rem; color:#999;">(คลิกเพื่อดูรายละเอียด)</small></h3>
            <table>
                <thead><tr><th>เนื้อหา</th><th>เวลา</th><th>Engagement</th></tr></thead>
                <tbody>${postsHtml}</tbody>
            </table>
        </section>

        <!-- ประวัติการบล็อค -->
        <section class="detail-section" style="margin-top:1rem;">
            <h3>🔐 ประวัติการบล็อค</h3>
            <table>
                <thead><tr><th>เหตุการณ์</th><th>เวลา</th><th>ผู้ดำเนินการ</th></tr></thead>
                <tbody>${historyHtml}</tbody>
            </table>
        </section>
    `;
}

async function openUserDetailModal(seedRow, source = '') {
    const modal = document.getElementById('user-detail-modal');
    const body = document.getElementById('user-detail-body');
    if (!modal || !body) return;

    modal.classList.remove('hidden');
    body.innerHTML = '<div class="empty-row">กำลังโหลดข้อมูล...</div>';

    const seed = normalizeUserRow(seedRow, source);

    try {
        let merged = buildUserDetailFromDashboard(seed);

        if (seed.phone) {
            try {
                const remote = await fetchAuthJson(`${API_BASE_URL}/api/admin/users/${encodeURIComponent(seed.phone)}/detail`);
                if (remote && remote.profile) {
                    // Merge API profile data (which is more complete) with local data
                    merged = {
                        profile: {
                            ...merged.profile,
                            ...(remote.profile || {})
                        },
                        recentPosts: (remote.recentPosts && remote.recentPosts.length > 0) ? remote.recentPosts : merged.recentPosts,
                        blockHistory: (remote.blockHistory && remote.blockHistory.length > 0) ? remote.blockHistory : merged.blockHistory
                    };
                }
            } catch (error) {
                // Keep local dashboard data as fallback when dedicated endpoint is unavailable.
                console.log('Using dashboard data (API unavailable):', error.message);
            }
        }

        // Ensure about text survives all merge/fallback paths.
        merged.profile.about_me = merged.profile.about_me ?? merged.profile.aboutMe ?? seed.about_me ?? seed.aboutMe ?? '';

        currentUserDetail = merged;
        renderUserDetail(merged);
    } catch (error) {
        body.innerHTML = `<div class="empty-row">โหลดข้อมูลผู้ใช้ไม่สำเร็จ: ${escapeHtml(error.message || '')}</div>`;
    }
}

function renderPostStatusBadge(moderation = {}) {
    const statusClass = moderation.statusBadgeClass || 'bg-success';
    const statusLabel = moderation.statusLabel || 'ปกติ';
    const statusDescription = moderation.statusDescription || '';

    return `<span class="badge ${statusClass}" title="${escapeHtml(statusDescription)}">${escapeHtml(statusLabel)}</span>`;
}

function renderReportContext(reportContext = {}) {
    const count = Number(reportContext.count || 0);
    const pendingCount = Number(reportContext.pendingCount || 0);
    const reviewedCount = Number(reportContext.reviewedCount || 0);
    const latestReportAt = reportContext.latestReportAt ? formatDate(reportContext.latestReportAt) : '-';
    const reasons = Array.isArray(reportContext.reasons) ? reportContext.reasons.filter(Boolean) : [];
    const reports = Array.isArray(reportContext.reports) ? reportContext.reports : [];

    const reasonsHtml = reasons.length > 0
        ? reasons.map((reason) => `<span class="badge badge-neutral">${escapeHtml(reason)}</span>`).join(' ')
        : '<span class="badge badge-neutral">ยังไม่มี report</span>';

    const reportItems = reports.length > 0
        ? reports.map((report) => `
            <div class="report-item">
                <div class="report-item-head">
                    <strong>${escapeHtml(report.reporterName || '-')}</strong>
                    <span>${escapeHtml(report.reporterPhone || '-')} • ${formatDate(report.createdAt)}</span>
                </div>
                <div class="report-item-body">
                    <span class="badge ${report.status === 'reviewed' ? 'bg-success' : 'bg-pending'}">${escapeHtml(report.reason || 'ไม่ระบุเหตุผล')}</span>
                    <p>${escapeHtml(report.detail || 'ไม่มีรายละเอียดเพิ่มเติม')}</p>
                </div>
            </div>
        `).join('')
        : '<div class="empty-row">ยังไม่มีรายงานสำหรับโพสต์นี้</div>';

    return `
        <section class="detail-section report-section">
            <h3>Report Context</h3>
            <div class="status-summary-grid">
                <div><strong>ถูกรายงาน:</strong> ${formatNumber(count)} ครั้ง</div>
                <div><strong>รอตรวจ:</strong> ${formatNumber(pendingCount)} รายการ</div>
                <div><strong>ตรวจแล้ว:</strong> ${formatNumber(reviewedCount)} รายการ</div>
                <div><strong>รายงานล่าสุด:</strong> ${escapeHtml(latestReportAt)}</div>
            </div>
            <div class="hint-row">${reasonsHtml}</div>
            <div class="report-list">${reportItems}</div>
        </section>
    `;
}

function renderAuditLogs(auditLogs = []) {
    if (!Array.isArray(auditLogs) || auditLogs.length === 0) {
        return '<div class="empty-row">ยังไม่มีประวัติการจัดการโพสต์</div>';
    }

    return auditLogs.map((log) => `
        <div class="audit-log-item">
            <div class="audit-log-head">
                <strong>${escapeHtml(log.actor || '-')}</strong>
                <span>${formatDate(log.createdAt)}</span>
            </div>
            <div class="audit-log-body">
                <span class="badge bg-pending">${escapeHtml(log.action || '-')}</span>
                <p>${escapeHtml(log.reason || log.note || 'ไม่มีรายละเอียด')}</p>
            </div>
        </div>
    `).join('');
}

function getPostDetailSeed(post) {
    return {
        name: post?.author || 'ผู้ใช้งาน',
        full_name: post?.author || 'ผู้ใช้งาน',
        phone: post?.authorPhone || '-',
        phone_number: post?.authorPhone || '-',
        user_id: post?.userId || null,
        profile_picture_url: post?.authorAvatarUrl || null,
        is_blocked: Boolean(post?.moderation?.isBlocked),
        blocked_reason: post?.moderation?.blockedReason || '',
        warning_note: post?.moderation?.warningNote || ''
    };
}

function openUserDetailByPostId(postId, source = 'Content Monitor') {
    const normalizedPostId = Number(postId);
    if (!Number.isFinite(normalizedPostId) || normalizedPostId <= 0) return;

    const contentRow = getContentRowByPostId(normalizedPostId);
    if (contentRow) {
        openUserDetailModal(contentRow, source);
        return;
    }

    const reportRow = reportQueueSourceRows.find((row) => Number(row.postId || 0) === normalizedPostId);
    if (reportRow) {
        openUserDetailModal(
            {
                author: reportRow.author,
                full_name: reportRow.author,
                phone_number: reportRow.authorPhone || '-',
                phone: reportRow.authorPhone || '-'
            },
            source
        );
    }
}

function openPostUserProfile() {
    const post = currentPostDetail?.post;
    if (!post) return;

    closePostDetailModal();
    openUserDetailModal(getPostDetailSeed(post), 'Content Monitor');
}

async function moderateCurrentPost(action) {
    const post = currentPostDetail?.post;
    if (!post) return;

    const reasonInput = document.getElementById('moderation-reason');
    const warningInput = document.getElementById('moderation-warning');
    const reason = (reasonInput?.value || '').trim() || 'คำหยาบ/สแปม/เนื้อหาไม่เหมาะสม';
    const warningNote = (warningInput?.value || '').trim() || 'พบเนื้อหาที่เข้าข่ายไม่เหมาะสม กรุณาปรับปรุงเนื้อหาและพฤติกรรม';

    const actionConfig = {
        delete: {
            title: 'ยืนยันการลบโพสต์',
            message: 'ต้องการลบโพสต์นี้แบบถาวรในมุมมองผู้ใช้ ใช่หรือไม่?',
            confirmText: 'ลบโพสต์',
            confirmClass: 'btn btn-del'
        },
        hide: {
            title: 'ยืนยันการซ่อนโพสต์',
            message: 'ต้องการซ่อนโพสต์นี้จากผู้ใช้อื่นหรือไม่?',
            confirmText: 'ซ่อนโพสต์',
            confirmClass: 'btn btn-check'
        },
        warn: {
            title: 'ยืนยันการส่งคำเตือน',
            message: 'ต้องการบันทึกคำเตือนให้ผู้ใช้รายนี้หรือไม่?',
            confirmText: 'ส่งคำเตือน',
            confirmClass: 'btn btn-check'
        }
    };

    const config = actionConfig[action];
    if (!config) return;

    const confirmed = await openActionDialog({
        title: config.title,
        message: config.message,
        confirmText: config.confirmText,
        cancelText: 'ยกเลิก',
        confirmClass: config.confirmClass,
        showCancel: true
    });

    if (!confirmed) return;

    await fetchAuthJson(`${API_BASE_URL}/api/admin/posts/${post.postId}/moderate`, {
        method: 'POST',
        body: JSON.stringify({
            action,
            reason,
            warning_note: warningNote
        })
    });

    const successMessage = action === 'delete'
        ? 'ลบโพสต์เรียบร้อยแล้ว'
        : action === 'hide'
            ? 'ซ่อนโพสต์เรียบร้อยแล้ว'
            : 'บันทึกคำเตือนเรียบร้อยแล้ว';

    await showActionDialogInfo(successMessage, 'สำเร็จ');
    await refreshAndKeepModal(post.postId);
}

function getActionButtonsDisabled(post) {
    const status = String(post?.moderation?.status || '').toLowerCase();
    return {
        delete: status === 'deleted',
        hide: status === 'deleted' || status === 'hidden',
        warn: status === 'deleted'
    };
}

function openPostDetailFromList(postId, postJsonString) {
    const modal = document.getElementById('post-detail-modal');
    const body = document.getElementById('post-detail-body');
    if (!modal || !body) return;

    modal.classList.remove('hidden');
    body.innerHTML = '<div class="empty-row">กำลังโหลดข้อมูล...</div>';

    const normalizedPostId = Number(postId);
    if (Number.isFinite(normalizedPostId) && normalizedPostId > 0) {
        openPostDetailModal(normalizedPostId);
        return;
    }

    try {
        let post = {};
        if (postJsonString) {
            const decodedJson = String(postJsonString)
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>');
            post = JSON.parse(decodedJson);
        }

        const payload = {
            post: {
                postId: Number(post.post_id || post.postId || 0),
                author: post.author || post.full_name || 'ผู้ใช้',
                authorPhone: post.authorPhone || post.phone_number || '-',
                createdAt: post.created_at || post.createdAt || new Date().toISOString(),
                content: post.content || '-',
                likes: Number(post.likes || 0),
                comments: Number(post.comments || 0),
                shares: Number(post.shares || post.share_count || 0),
                moderation: {
                    isBlocked: false,
                    status: 'normal',
                    statusLabel: 'ปกติ',
                    statusBadgeClass: 'bg-success',
                    statusDescription: 'โพสต์ยังแสดงต่อสาธารณะ',
                    visibilityLabel: 'สาธารณะ',
                    reportCount: 0,
                    pendingReportCount: 0,
                    reviewedReportCount: 0
                },
                violationHints: []
            },
            comments: [],
            reportContext: {
                count: 0,
                pendingCount: 0,
                reviewedCount: 0,
                latestReportAt: null,
                reasons: [],
                reports: []
            },
            auditLogs: []
        };

        currentPostDetail = payload;
        renderPostDetail(payload);
    } catch (error) {
        body.innerHTML = `<div class="empty-row">โหลดข้อมูลโพสต์ไม่สำเร็จ</div>`;
    }
}

function renderViolationHints(hints) {
    if (!hints || hints.length === 0) {
        return '<span class="badge badge-neutral">ไม่พบคำเสี่ยงจากตัวกรองอัตโนมัติ</span>';
    }

    return hints
        .map((hint) => `<span class="badge bg-pending">${escapeHtml(hint)}</span>`)
        .join(' ');
}

function renderComments(comments) {
    if (!comments || comments.length === 0) {
        return '<div class="empty-row">ยังไม่มีคอมเมนต์</div>';
    }

    return comments.map((comment) => `
        <div class="comment-item">
            <div class="comment-head">
                <strong>${escapeHtml(comment.author)}</strong>
                <span>${escapeHtml(comment.authorPhone || '-')} • ${formatDate(comment.createdAt)}</span>
            </div>
            <div class="comment-content">${escapeHtml(comment.content)}</div>
            <div class="hint-row">${renderViolationHints(comment.violationHints || [])}</div>
        </div>
    `).join('');
}

function renderPostDetail(payload) {
    const body = document.getElementById('post-detail-body');
    if (!body) return;

    const post = payload?.post;
    const comments = payload?.comments || [];
    const reportContext = payload?.reportContext || {};
    const auditLogs = payload?.auditLogs || [];
    if (!post) {
        body.innerHTML = '<div class="empty-row">ไม่พบข้อมูลโพสต์</div>';
        return;
    }

    const moderation = post.moderation || {};
    const buttonsDisabled = getActionButtonsDisabled(post);
    const warningNote = post.moderation?.warningNote || '';
    const blockedReason = post.moderation?.blockedReason || '';
    const reportCount = Number(reportContext.count || moderation.reportCount || 0);
    const postVisibility = moderation.visibilityLabel || 'สาธารณะ';

    body.innerHTML = `
        <div class="detail-grid">
            <section class="detail-section">
                <h3>โพสต์ต้นทาง</h3>
                <div class="detail-meta">
                    <span><strong>ผู้โพสต์:</strong> ${escapeHtml(post.author)} (${escapeHtml(post.authorPhone)})</span>
                    <span><strong>เวลา:</strong> ${formatDate(post.createdAt)}</span>
                    <span><strong>Engagement:</strong> <i class="fas fa-thumbs-up"></i> ${formatNumber(post.likes)} • <i class="fas fa-comments"></i> ${formatNumber(post.comments)} • <i class="fas fa-share"></i> ${formatNumber(post.shares)}</span>
                    <span><strong>กลุ่ม:</strong> ${post.groupId ? `#${post.groupId}` : '— ฟีดชุมชนทั่วไป'}</span>
                    <span><strong>สถานะโพสต์:</strong> ${renderPostStatusBadge(moderation)}</span>
                    <span><strong>การมองเห็น:</strong> ${escapeHtml(postVisibility)}</span>
                    <span><strong>ถูกรายงาน:</strong> ${formatNumber(reportCount)} ครั้ง</span>
                </div>
                <div class="detail-content">${escapeHtml(post.content || '-')}</div>
                <div class="hint-row">${renderViolationHints(post.violationHints || [])}</div>
            </section>

            <section class="detail-section moderation-panel">
                <h3>Moderation Action</h3>
                <label for="moderation-reason">เหตุผล</label>
                <input id="moderation-reason" type="text" value="${escapeHtml(blockedReason || 'คำหยาบ/เสียดสี/บูลลี่')}" />
                <label for="moderation-warning">ข้อความตักเตือน</label>
                <textarea id="moderation-warning" rows="3" placeholder="ระบุข้อความตักเตือนที่ส่งถึงผู้ใช้">${escapeHtml(warningNote || 'พบเนื้อหาที่เข้าข่ายคำหยาบ เสียดสี หรือบูลลี่ กรุณาปรับปรุงพฤติกรรม')}</textarea>
                <div class="moderation-actions post-action-grid">
                    <button id="btn-delete-post" class="btn btn-del" type="button" ${buttonsDisabled.delete ? 'disabled' : ''}><i class="fas fa-trash"></i> ลบโพสต์</button>
                    <button id="btn-hide-post" class="btn btn-soft" type="button" ${buttonsDisabled.hide ? 'disabled' : ''}><i class="fas fa-eye"></i> ซ่อนโพสต์</button>
                    <button id="btn-warn-user" class="btn btn-check" type="button" ${buttonsDisabled.warn ? 'disabled' : ''}><i class="fas fa-exclamation-triangle"></i> ส่งคำเตือน</button>
                    <button id="btn-view-user" class="btn btn-ghost" type="button"><i class="fas fa-user"></i> ดูโปรไฟล์ผู้ใช้</button>
                    <button id="btn-move-group" class="btn btn-ghost" type="button" ${buttonsDisabled.delete ? 'disabled' : ''}><i class="fas fa-arrows-alt"></i> ย้ายกลุ่ม</button>
                </div>
                <small>การลบและซ่อนโพสต์จะอัปเดตสถานะบนระบบทันที ส่วนคำเตือนจะบันทึกไว้ในประวัติผู้ใช้</small>
            </section>
        </div>

        ${renderReportContext(reportContext)}

        <section class="detail-section comments-section">
            <h3>คอมเมนต์ทั้งหมด (${formatNumber(comments.length)})</h3>
            <div class="comments-list">${renderComments(comments)}</div>
        </section>

        <section class="detail-section audit-section">
            <h3>Audit Log</h3>
            <div class="audit-log-list">${renderAuditLogs(auditLogs)}</div>
        </section>
    `;
}

async function refreshAndKeepModal(postId) {
    const payload = await fetchAuthJson(`${API_BASE_URL}/api/admin/posts/${postId}/detail`);
    currentPostDetail = payload;
    renderPostDetail(payload);
    bindPostDetailActions();
}

function bindPostDetailActions() {
    const post = currentPostDetail?.post;
    if (!post) return;

    const deleteBtn = document.getElementById('btn-delete-post');
    const hideBtn = document.getElementById('btn-hide-post');
    const warnBtn = document.getElementById('btn-warn-user');
    const viewUserBtn = document.getElementById('btn-view-user');

    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            deleteBtn.disabled = true;
            try {
                await moderateCurrentPost('delete');
            } catch (error) {
                await showActionDialogInfo(error.message || 'ลบโพสต์ไม่สำเร็จ', 'เกิดข้อผิดพลาด');
            } finally {
                deleteBtn.disabled = false;
            }
        });
    }

    if (hideBtn) {
        hideBtn.addEventListener('click', async () => {
            hideBtn.disabled = true;
            try {
                await moderateCurrentPost('hide');
            } catch (error) {
                await showActionDialogInfo(error.message || 'ซ่อนโพสต์ไม่สำเร็จ', 'เกิดข้อผิดพลาด');
            } finally {
                hideBtn.disabled = false;
            }
        });
    }

    if (warnBtn) {
        warnBtn.addEventListener('click', async () => {
            warnBtn.disabled = true;
            try {
                await moderateCurrentPost('warn');
            } catch (error) {
                await showActionDialogInfo(error.message || 'ส่งคำเตือนไม่สำเร็จ', 'เกิดข้อผิดพลาด');
            } finally {
                warnBtn.disabled = false;
            }
        });
    }

    if (viewUserBtn) {
        viewUserBtn.addEventListener('click', () => {
            openPostUserProfile();
        });
    }

    const moveGroupBtn = document.getElementById('btn-move-group');
    if (moveGroupBtn) {
        moveGroupBtn.addEventListener('click', async () => {
            moveGroupBtn.disabled = true;
            try {
                await openMoveGroupModal();
            } finally {
                moveGroupBtn.disabled = false;
            }
        });
    }
}

function closeMoveGroupModal() {
    const modal = document.getElementById('move-group-modal');
    if (modal) modal.classList.add('hidden');
}

async function openMoveGroupModal() {
    const post = currentPostDetail?.post;
    if (!post) return;

    const modal = document.getElementById('move-group-modal');
    const sel = document.getElementById('move-group-select');
    if (!modal || !sel) return;

    sel.innerHTML = '<option value="">⏳ กำลังโหลด...</option>';
    modal.classList.remove('hidden');

    let groups = [];
    try {
        groups = await fetchAuthJson(`${API_BASE_URL}/api/groups`);
    } catch (_) {
        await showActionDialogInfo('ไม่สามารถโหลดรายการกลุ่มได้', 'เกิดข้อผิดพลาด');
        closeMoveGroupModal();
        return;
    }

    const currentGroupId = post.groupId ?? post.group_id ?? null;
    sel.innerHTML =
        `<option value="">— ไม่อยู่ในกลุ่ม (ฟีดชุมชนทั่วไป) —</option>` +
        (Array.isArray(groups) ? groups : []).map(g =>
            `<option value="${g.group_id}" ${Number(g.group_id) === Number(currentGroupId) ? 'selected' : ''}>${escapeHtml(g.name)}</option>`
        ).join('');

    return new Promise((resolve) => {
        const confirmBtn = document.getElementById('move-group-confirm');
        const cancelBtn = document.getElementById('move-group-cancel');
        const closeBtn = document.getElementById('move-group-close');

        function cleanup() {
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
            closeBtn.removeEventListener('click', onCancel);
            closeMoveGroupModal();
            resolve();
        }

        async function onConfirm() {
            const selectedGroupId = sel.value === '' ? null : Number(sel.value);
            confirmBtn.disabled = true;
            try {
                const result = await fetchAuthJson(
                    `${API_BASE_URL}/api/admin/posts/${post.postId}/move-group`,
                    {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ group_id: selectedGroupId })
                    }
                );
                cleanup();
                const targetName = selectedGroupId
                    ? (groups.find(g => Number(g.group_id) === selectedGroupId)?.name || `กลุ่ม #${selectedGroupId}`)
                    : 'ฟีดชุมชนทั่วไป';
                await showActionDialogInfo(`✅ ย้ายโพสต์ไป "${targetName}" สำเร็จ`, 'ย้ายกลุ่ม');
                await refreshAndKeepModal(post.postId);
            } catch (err) {
                confirmBtn.disabled = false;
                await showActionDialogInfo(err.message || 'ย้ายกลุ่มไม่สำเร็จ', 'เกิดข้อผิดพลาด');
            }
        }

        function onCancel() { cleanup(); }

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
        closeBtn.addEventListener('click', onCancel);
    });
}

async function openPostDetailModal(postId) {
    const modal = document.getElementById('post-detail-modal');
    const body = document.getElementById('post-detail-body');
    if (!modal || !body) return;

    modal.classList.remove('hidden');
    body.innerHTML = '<div class="empty-row">กำลังโหลดข้อมูล...</div>';

    try {
        const payload = await fetchAuthJson(`${API_BASE_URL}/api/admin/posts/${postId}/detail`);
        currentPostDetail = payload;
        renderPostDetail(payload);
        bindPostDetailActions();
    } catch (error) {
        body.innerHTML = `<div class="empty-row">โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(error.message || '')}</div>`;
    }
}

function renderReports(rows) {
    const tbody = document.getElementById('report-table');
    if (!tbody) return;

    reportQueueSourceRows = Array.isArray(rows) ? rows : [];
    bindModerationFilters();
    updateModerationFilterButtons();

    const grouped = new Map();
    for (const row of reportQueueSourceRows) {
        const postId = Number(row.postId || 0);
        if (!Number.isFinite(postId) || postId <= 0) continue;

        if (!grouped.has(postId)) {
            grouped.set(postId, {
                postId,
                author: row.author || '-',
                authorPhone: row.authorPhone || '-',
                content: row.content || '',
                reports: [],
                statusStats: { pending: 0, reviewed: 0, dismissed: 0 }
            });
        }

        const entry = grouped.get(postId);
        entry.reports.push(row);

        const status = String(row.status || 'pending').toLowerCase();
        if (status === 'reviewed') {
            entry.statusStats.reviewed += 1;
        } else if (status === 'dismissed') {
            entry.statusStats.dismissed += 1;
        } else {
            entry.statusStats.pending += 1;
        }
    }

    const groupedRows = Array.from(grouped.values())
        .map((entry) => {
            const latest = entry.reports
                .slice()
                .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0] || null;

            const reasonCounter = {};
            for (const report of entry.reports) {
                const reason = String(report.reason || report.detail || 'ไม่ระบุเหตุผล').trim() || 'ไม่ระบุเหตุผล';
                reasonCounter[reason] = (reasonCounter[reason] || 0) + 1;
            }

            return {
                ...entry,
                reportCount: entry.reports.length,
                latestReportAt: latest?.createdAt || null,
                reasonCounter,
                hasPending: entry.statusStats.pending > 0,
                hasReviewed: entry.statusStats.reviewed > 0,
                hasDismissed: entry.statusStats.dismissed > 0
            };
        })
        .sort((a, b) => new Date(b.latestReportAt || 0).getTime() - new Date(a.latestReportAt || 0).getTime());

    const filteredRows = groupedRows.filter((row) => {
        if (currentReportFilter === 'pending') return row.hasPending;
        if (currentReportFilter === 'reviewed') return row.hasReviewed;
        if (currentReportFilter === 'dismissed') return row.hasDismissed;
        return true;
    });

    const reportQueueCountEl = document.getElementById('report-queue-count');
    if (reportQueueCountEl) {
        reportQueueCountEl.textContent = formatNumber(groupedRows.filter((row) => row.hasPending).length);
    }

    if (filteredRows.length === 0) {
        setEmptyRow('report-table', 6, 'ยังไม่มีรายการรายงานโพสต์ตามเงื่อนไขที่เลือก');
        return;
    }

    tbody.innerHTML = filteredRows.map((row) => {
        const reasonLines = Object.entries(row.reasonCounter)
            .sort((a, b) => b[1] - a[1])
            .map(([reason, count]) => `<div class="reason-line">- ${escapeHtml(reason)} (${formatNumber(count)})</div>`)
            .join('');

        return `
        <tr>
            <td>
                <button class="user-link-btn" type="button" data-open-user-post="${row.postId}">${escapeHtml(row.author)}</button>
                <div class="user-subtext">${escapeHtml(row.authorPhone || '-')}</div>
            </td>
            <td class="truncate" title="${escapeHtml(row.content)}">${escapeHtml(row.content)}</td>
            <td>
                <div><strong>รายงาน: ${formatNumber(row.reportCount)} ครั้ง</strong></div>
                <div class="user-subtext">รอตรวจ ${formatNumber(row.statusStats.pending)} • ตรวจแล้ว ${formatNumber(row.statusStats.reviewed)} • ปฏิเสธ ${formatNumber(row.statusStats.dismissed)}</div>
            </td>
            <td><div class="reason-list">${reasonLines}</div></td>
            <td>
                <div>${formatTimeAgo(row.latestReportAt)}</div>
                <div class="user-subtext">${formatDate(row.latestReportAt)}</div>
            </td>
            <td>
                <div class="quick-actions-wrap">
                    <button class="btn btn-del" data-post-action="delete" data-post-id="${row.postId}" data-action-source="report_queue" type="button"><i class="fas fa-trash"></i> ลบโพสต์</button>
                    <button class="btn btn-soft" data-post-action="hide" data-post-id="${row.postId}" data-action-source="report_queue" type="button"><i class="fas fa-eye"></i> ซ่อนโพสต์</button>
                    <button class="btn btn-check" data-post-action="warn" data-post-id="${row.postId}" data-action-source="report_queue" type="button"><i class="fas fa-exclamation-triangle"></i> เตือนผู้ใช้</button>
                    <button class="btn btn-ghost" data-post-action="dismiss" data-post-id="${row.postId}" data-action-source="report_queue" type="button"><i class="fas fa-circle-xmark"></i> ปฏิเสธรายงาน</button>
                    <button class="btn btn-check" data-open-user-post="${row.postId}" type="button"><i class="fas fa-user"></i> ดู user</button>
                    <button class="btn btn-check" data-view-post="${row.postId}" type="button">ดูโพสต์</button>
                </div>
            </td>
        </tr>
    `;
    }).join('');
}

function getCompanyDisplayRows() {
    const rows = Array.isArray(companySourceRows) ? companySourceRows : [];
    const normalizedQuery = currentCompanySearchQuery.trim().toLowerCase();

    return rows
        .map((row, sourceIndex) => ({ row, sourceIndex }))
        .filter(({ row }) => {
            if (!normalizedQuery) return true;

            const fullName = row.name || row.full_name || row.username || '';
            const phone = row.phone || row.phone_number || row.regNo || row.tel || row.contact || row.mobile || '';
            const gender = row.gender || '';
            const location = row.current_location || '';
            const searchText = `${fullName} ${phone} ${gender} ${location}`.toLowerCase();
            return searchText.includes(normalizedQuery);
        });
}

function renderCompanies(entries) {
    const tbody = document.getElementById('company-table');
    if (!tbody) return;

    if (!entries || entries.length === 0) {
        const emptyMessage = currentCompanySearchQuery
            ? 'ไม่พบผู้ใช้งานที่ตรงกับคำค้นหา'
            : 'ยังไม่มีข้อมูลผู้สูงอายุในระบบ';
        setEmptyRow('company-table', 5, emptyMessage);
        return;
    }

    // Helper function to calculate age from birth_date
    const calculateAge = (birthDate) => {
        if (!birthDate) return null;
        const today = new Date();
        const birth = new Date(birthDate);
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }
        return age > 0 ? age : null;
    };

    // Helper function to generate brief info
    const getBriefInfo = (row) => {
        const parts = [];
        
        // Add gender
        if (row.gender) {
            parts.push(row.gender);
        }
        
        // Add age
        const age = calculateAge(row.birth_date);
        if (age) {
            parts.push(`${age} ปี`);
        }
        
        // Add location
        if (row.current_location) {
            parts.push(row.current_location);
        }
        
        return parts.length > 0 ? parts.join(', ') : '-';
    };

    tbody.innerHTML = entries.map(({ row, sourceIndex }) => {
        const index = Number.isInteger(sourceIndex) ? sourceIndex : 0;
        const fullName = row.name || row.full_name || row.username || `ผู้ใช้ #${index + 1}`;
        // Backend maps phone_number to regNo in companies section
        const phone = row.phone || row.phone_number || row.regNo || row.tel || row.contact || row.mobile || '-';
        const briefInfo = getBriefInfo(row);
        const blocked = Boolean(row.isBlocked || row.is_blocked || row.blocked || String(row.status || '').toLowerCase() === 'blocked');

        console.log(`[Company #${index}] name:${fullName}, phone:${phone}, brief:${briefInfo}`, row); // Debug log

        return `
            <tr data-company-index="${index}">
                <td>${escapeHtml(fullName)}</td>
                <td><strong>${escapeHtml(phone)}</strong></td>
                <td title="${escapeHtml(briefInfo)}" style="font-size:0.9rem; color:#555;">${escapeHtml(briefInfo)}</td>
                <td><span class="badge ${blocked ? 'bg-urgent' : 'bg-success'}">${blocked ? 'ถูกบล็อค' : 'ใช้งานปกติ'}</span></td>
                <td>
                    <div class="elder-action-group">
                        <button class="elder-action-btn elder-btn-view" data-company-action="view" type="button">
                            <i class="fas fa-eye"></i><span>ดูข้อมูล</span>
                        </button>
                        <button class="elder-action-btn elder-btn-manage" data-company-action="manage" type="button">
                            <i class="fas fa-sliders"></i><span>จัดการ</span>
                        </button>
                        <button class="elder-action-btn ${blocked ? 'elder-btn-unblock' : 'elder-btn-block'}" data-company-action="${blocked ? 'unblock' : 'block'}" type="button">
                            <i class="fas fa-${blocked ? 'lock-open' : 'ban'}"></i><span>${blocked ? 'ปลดบล็อค' : 'บล็อค'}</span>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function getRedemptionGroupKey(row) {
    const phone = String(row.phone_number || row.phone || '').trim();
    const userName = String(row.user_name || row.full_name || '').trim();
    const userId = String(row.user_id || row.redemption_user_id || '').trim();

    if (phone) return `phone:${phone}`;
    if (userId) return `user:${userId}`;
    if (userName) return `name:${userName.toLowerCase()}`;
    return `row:${String(row.redemption_id || row.id || Math.random())}`;
}

function buildRedemptionGroups(rows) {
    const groups = new Map();

    for (const row of Array.isArray(rows) ? rows : []) {
        const groupKey = getRedemptionGroupKey(row);
        if (!groups.has(groupKey)) {
            groups.set(groupKey, {
                groupKey,
                userName: row.user_name || row.full_name || '-',
                phoneNumber: row.phone_number || row.phone || '-',
                redemptions: [],
                totalPoints: 0,
                totalCount: 0,
                statusCounts: { pending: 0, used: 0, cancelled: 0, expired: 0, other: 0 },
                rewards: new Map(),
                latestAt: null,
                latestStatus: '-',
                latestReward: '-'
            });
        }

        const group = groups.get(groupKey);
        const points = Number(row.points_redeemed ?? row.points ?? 0) || 0;
        const rewardName = String(row.reward_name || 'ไม่ระบุแคมเปญ').trim() || 'ไม่ระบุแคมเปญ';
        const status = String(row.redemption_status || row.status || 'other').toLowerCase();
        const redeemedAt = row.redeemed_at || row.created_at || row.redeemedAt || row.createdAt || null;
        const redeemedTime = redeemedAt ? new Date(redeemedAt).getTime() : 0;

        group.redemptions.push(row);
        group.totalPoints += points;
        group.totalCount += 1;

        if (status === 'pending' || status === 'used' || status === 'cancelled' || status === 'expired') {
            group.statusCounts[status] += 1;
        } else {
            group.statusCounts.other += 1;
        }

        const rewardKey = rewardName.toLowerCase();
        if (!group.rewards.has(rewardKey)) {
            group.rewards.set(rewardKey, { name: rewardName, count: 0, points: 0 });
        }
        const rewardEntry = group.rewards.get(rewardKey);
        rewardEntry.count += 1;
        rewardEntry.points += points;

        if (!group.latestAt || redeemedTime > new Date(group.latestAt).getTime()) {
            group.latestAt = redeemedAt;
            group.latestStatus = row.redemption_status || row.status || '-';
            group.latestReward = rewardName;
        }
    }

    return Array.from(groups.values()).map((group) => ({
        ...group,
        rewards: Array.from(group.rewards.values())
            .sort((a, b) => b.count - a.count || b.points - a.points || a.name.localeCompare(b.name, 'th'))
    })).sort((a, b) => new Date(b.latestAt || 0).getTime() - new Date(a.latestAt || 0).getTime());
}

function renderRedemptionSummary(groups) {
    const summaryEl = document.getElementById('redemption-summary');
    if (!summaryEl) return;

    const totalUsers = groups.length;
    const totalAttempts = groups.reduce((sum, group) => sum + group.totalCount, 0);
    const totalPoints = groups.reduce((sum, group) => sum + group.totalPoints, 0);
    const uniqueRewards = new Set();
    groups.forEach((group) => {
        group.rewards.forEach((reward) => uniqueRewards.add(reward.name));
    });

    summaryEl.innerHTML = `
        <div class="redemption-kpi-grid">
            <div class="redemption-kpi-card kpi-primary"><div class="redemption-kpi-icon"><i class="fas fa-users"></i></div><div><div class="redemption-kpi-label">ผู้ใช้งานที่แลกรางวัล</div><div class="redemption-kpi-value">${formatNumber(totalUsers)}</div></div></div>
            <div class="redemption-kpi-card kpi-blue"><div class="redemption-kpi-icon"><i class="fas fa-arrow-right-arrow-left"></i></div><div><div class="redemption-kpi-label">จำนวนการแลกทั้งหมด</div><div class="redemption-kpi-value">${formatNumber(totalAttempts)}</div></div></div>
            <div class="redemption-kpi-card kpi-green"><div class="redemption-kpi-icon"><i class="fas fa-coins"></i></div><div><div class="redemption-kpi-label">แต้มที่ใช้รวม</div><div class="redemption-kpi-value">${formatNumber(totalPoints)}</div></div></div>
            <div class="redemption-kpi-card kpi-purple"><div class="redemption-kpi-icon"><i class="fas fa-tag"></i></div><div><div class="redemption-kpi-label">จำนวนแคมเปญ</div><div class="redemption-kpi-value">${formatNumber(uniqueRewards.size)}</div></div></div>
        </div>
    `;
}

function formatRedemptionStatusBadge(status) {
    const normalized = String(status || '').toLowerCase();
    const icon = normalized === 'used' ? 'fa-circle-check' : normalized === 'pending' || normalized === 'approval' ? 'fa-clock' : normalized === 'expired' || normalized === 'cancelled' ? 'fa-circle-xmark' : 'fa-circle-info';
    const label = normalized === 'used' ? 'ใช้แล้ว' : normalized === 'pending' ? 'รอดำเนินการ' : normalized === 'ready' ? 'พร้อมใช้งาน' : normalized === 'scanned' ? 'สแกนแล้ว' : normalized === 'approval' ? 'รออนุมัติ' : normalized === 'cancelled' ? 'ยกเลิก' : normalized === 'expired' ? 'หมดอายุ' : (status || '-');
    const badgeClass = normalized === 'used' || normalized === 'ready' || normalized === 'scanned' ? 'bg-success' : normalized === 'pending' || normalized === 'approval' ? 'bg-pending' : normalized === 'expired' || normalized === 'cancelled' ? 'bg-urgent' : 'bg-pending';
    return `<span class="badge ${badgeClass}" style="display:inline-flex; align-items:center; gap:0.35rem; border-radius:999px;"><i class="fas ${icon}" style="font-size:0.8em"></i>${escapeHtml(label)}</span>`;
}

function renderRedemptionGroupRewards(rewards) {
    if (!Array.isArray(rewards) || rewards.length === 0) return '<span class="user-subtext">-</span>';

    const visibleRewards = rewards.slice(0, 3).map((reward) => `
        <span style="display:inline-flex; align-items:center; gap:0.25rem; padding:0.28rem 0.55rem; border-radius:999px; background: rgba(74,108,247,0.08); color: var(--text-primary); font-size:0.82rem; margin: 0 0.35rem 0.35rem 0;">
            ${escapeHtml(reward.name)} <span style="opacity:0.7;">×${formatNumber(reward.count)}</span>
        </span>
    `).join('');

    if (rewards.length <= 3) return visibleRewards;

    return `${visibleRewards}<span style="display:inline-flex; align-items:center; padding:0.28rem 0.55rem; border-radius:999px; background: var(--bg-card-alt); color: var(--text-secondary); font-size:0.82rem; margin: 0 0.35rem 0.35rem 0;">+${formatNumber(rewards.length - 3)} แคมเปญ</span>`;
}

function getRedemptionCampaignName(row) {
    return String(row.reward_name || row.campaign_name || row.reward_title || '-').trim() || '-';
}

function getNormalizedRedemptionStatus(row) {
    const status = String(row.redemption_status || row.status || '').toLowerCase();
    if (status === 'used' || status === 'ready' || status === 'scanned' || status === 'pending' || status === 'expired' || status === 'cancelled' || status === 'approval') return status;
    return 'pending';
}

function getRedemptionAnalyticsDateKey(row) {
    const raw = row.redeemed_at || row.created_at || row.redeemedAt || row.createdAt;
    const date = raw ? new Date(raw) : null;
    if (!date || Number.isNaN(date.getTime())) {
        return { key: 'no-date', label: 'ไม่ระบุวันที่', time: 0 };
    }

    return {
        key: date.toISOString().slice(0, 10),
        label: date.toLocaleDateString('th-TH', { year: 'numeric', month: '2-digit', day: '2-digit' }),
        time: date.getTime()
    };
}

function getRedemptionAnalyticsSortOptions(view = currentRedemptionAnalyticsView) {
    return redemptionAnalyticsSortOptions[view] || redemptionAnalyticsSortOptions.campaign;
}

function updateRedemptionAnalyticsSortOptions(view = currentRedemptionAnalyticsView) {
    const select = document.getElementById('redemption-analytics-sort');
    if (!select) return;

    const currentValue = select.value || '';
    const options = getRedemptionAnalyticsSortOptions(view);
    select.innerHTML = options.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join('');
    select.value = options.some((option) => option.value === currentValue) ? currentValue : (options[0]?.value || '');
}

function syncRedemptionAnalyticsViewButtons() {
    const campaignBtn = document.getElementById('redemption-analytics-view-campaign');
    const dailyBtn = document.getElementById('redemption-analytics-view-daily');
    const labelHead = document.getElementById('redemption-analytics-label-head');
    const secondLabel = document.getElementById('redemption-analytics-second-label');

    if (campaignBtn) campaignBtn.classList.toggle('active', currentRedemptionAnalyticsView === 'campaign');
    if (dailyBtn) dailyBtn.classList.toggle('active', currentRedemptionAnalyticsView === 'daily');
    if (labelHead) labelHead.textContent = currentRedemptionAnalyticsView === 'daily' ? 'วันที่' : 'แคมเปญ';
    if (secondLabel) secondLabel.textContent = currentRedemptionAnalyticsView === 'daily' ? 'แคมเปญเด่น' : 'แคมเปญย่อย';
}

function setRedemptionAnalyticsView(view) {
    currentRedemptionAnalyticsView = view === 'daily' ? 'daily' : 'campaign';
    syncRedemptionAnalyticsViewButtons();
    updateRedemptionAnalyticsSortOptions(currentRedemptionAnalyticsView);
    renderRedemptionCharts(currentRedemptionVisibleRows);
}

function resetRedemptionAnalyticsFilters() {
    const search = document.getElementById('redemption-analytics-search');
    const status = document.getElementById('redemption-analytics-status-filter');
    if (search) search.value = '';
    if (status) status.value = '';
    updateRedemptionAnalyticsSortOptions(currentRedemptionAnalyticsView);
    renderRedemptionCharts(currentRedemptionVisibleRows);
}

function aggregateRedemptionAnalyticsRows(rows) {
    const grouped = new Map();

    (Array.isArray(rows) ? rows : []).forEach((row) => {
        const campaignName = getRedemptionCampaignName(row);
        const normalizedCampaign = campaignName === '-' ? 'ไม่ระบุแคมเปญ' : campaignName;
        const status = getNormalizedRedemptionStatus(row);
        const points = Number(row.points_redeemed ?? row.points ?? 0) || 0;
        const userKey = String(row.user_id || row.phone_number || row.phone || row.full_name || row.user_name || row.id || normalizedCampaign);
        const dateInfo = getRedemptionAnalyticsDateKey(row);
        const bucketKey = currentRedemptionAnalyticsView === 'daily' ? dateInfo.key : normalizedCampaign;
        const bucketLabel = currentRedemptionAnalyticsView === 'daily' ? dateInfo.label : normalizedCampaign;
        const redeemedAt = row.redeemed_at || row.created_at || row.redeemedAt || row.createdAt || null;

        const existing = grouped.get(bucketKey) || {
            bucketKey,
            bucketLabel,
            totalCount: 0,
            totalPoints: 0,
            uniqueUsers: new Set(),
            campaignCounts: new Map(),
            statusCounts: new Map(),
            latestAt: null,
            latestStatus: 'pending',
            latestCampaign: normalizedCampaign,
            latestDateKey: dateInfo.key,
            latestDateLabel: dateInfo.label
        };

        existing.totalCount += 1;
        existing.totalPoints += points;
        existing.uniqueUsers.add(userKey);
        existing.campaignCounts.set(normalizedCampaign, (existing.campaignCounts.get(normalizedCampaign) || 0) + 1);
        existing.statusCounts.set(status, (existing.statusCounts.get(status) || 0) + 1);

        const existingTime = existing.latestAt ? new Date(existing.latestAt).getTime() : 0;
        const candidateTime = redeemedAt ? new Date(redeemedAt).getTime() : 0;
        if (candidateTime >= existingTime) {
            existing.latestAt = redeemedAt;
            existing.latestStatus = status;
            existing.latestCampaign = normalizedCampaign;
            existing.latestDateKey = dateInfo.key;
            existing.latestDateLabel = dateInfo.label;
        }

        grouped.set(bucketKey, existing);
    });

    let records = Array.from(grouped.values()).map((entry) => {
        const campaignCounts = Array.from(entry.campaignCounts.entries()).sort((a, b) => b[1] - a[1]);
        const topCampaignSummary = campaignCounts.slice(0, 3).map(([name, count]) => `${name} ×${formatNumber(count)}`).join(', ');

        return {
            ...entry,
            uniqueUserCount: entry.uniqueUsers.size,
            topCampaignSummary: topCampaignSummary || '-',
            primarySortTime: entry.latestAt ? new Date(entry.latestAt).getTime() : 0
        };
    });

    const search = (document.getElementById('redemption-analytics-search')?.value || '').trim().toLowerCase();
    const statusFilter = (document.getElementById('redemption-analytics-status-filter')?.value || '').trim().toLowerCase();
    const sortBy = (document.getElementById('redemption-analytics-sort')?.value || '').trim();

    records = records.filter((record) => {
        const haystack = `${record.bucketLabel} ${record.topCampaignSummary} ${record.latestCampaign}`.toLowerCase();
        if (search && !haystack.includes(search)) return false;
        if (statusFilter && record.latestStatus !== statusFilter) return false;
        return true;
    });

    const sorters = {
        count_desc: (a, b) => b.totalCount - a.totalCount || b.primarySortTime - a.primarySortTime,
        points_desc: (a, b) => b.totalPoints - a.totalPoints || b.primarySortTime - a.primarySortTime,
        users_desc: (a, b) => b.uniqueUserCount - a.uniqueUserCount || b.primarySortTime - a.primarySortTime,
        latest_desc: (a, b) => b.primarySortTime - a.primarySortTime || a.bucketLabel.localeCompare(b.bucketLabel, 'th'),
        name_asc: (a, b) => a.bucketLabel.localeCompare(b.bucketLabel, 'th'),
        date_desc: (a, b) => b.primarySortTime - a.primarySortTime || a.bucketLabel.localeCompare(b.bucketLabel, 'th'),
        date_asc: (a, b) => a.primarySortTime - b.primarySortTime || a.bucketLabel.localeCompare(b.bucketLabel, 'th')
    };

    records.sort(sorters[sortBy] || sorters.count_desc);
    return records;
}

function populateRedemptionCampaignFilter(rows) {
    const select = document.getElementById('redemption-campaign-filter');
    if (!select) return;

    const currentValue = select.value;
    const campaigns = Array.from(new Set((Array.isArray(rows) ? rows : []).map(getRedemptionCampaignName).filter((value) => value && value !== '-')))
        .sort((a, b) => a.localeCompare(b, 'th'));

    select.innerHTML = ['<option value="">ทั้งหมด</option>'].concat(campaigns.map((campaign) => `<option value="${escapeHtml(campaign)}">${escapeHtml(campaign)}</option>`)).join('');
    if (currentValue) select.value = currentValue;
}

function applyRedemptionClientFilters(rows) {
    const search = (document.getElementById('redemption-search')?.value || '').trim().toLowerCase();
    const status = (document.getElementById('redemption-status-filter')?.value || '').trim().toLowerCase();
    const campaign = (document.getElementById('redemption-campaign-filter')?.value || '').trim().toLowerCase();
    const rewardType = (document.getElementById('redemption-reward-type-filter')?.value || '').trim().toLowerCase();
    const sortBy = (document.getElementById('redemption-sort')?.value || 'latest').trim();
    const pointMinRaw = (document.getElementById('redemption-point-min')?.value || '').trim();
    const pointMaxRaw = (document.getElementById('redemption-point-max')?.value || '').trim();
    const dateFrom = (document.getElementById('redemption-date-from')?.value || '').trim();
    const dateTo = (document.getElementById('redemption-date-to')?.value || '').trim();
    const pointMin = pointMinRaw ? Number(pointMinRaw) : null;
    const pointMax = pointMaxRaw ? Number(pointMaxRaw) : null;

    const filteredRows = (Array.isArray(rows) ? rows : []).filter((row) => {
        const phone = String(row.phone_number || row.phone || '').toLowerCase();
        const name = String(row.user_name || row.full_name || '').toLowerCase();
        const rewardName = getRedemptionCampaignName(row).toLowerCase();
        const qrCode = String(row.qr_code || row.code || '').toLowerCase();
        const rowStatus = getNormalizedRedemptionStatus(row);
        const points = Number(row.points_redeemed ?? row.points ?? 0) || 0;
        const redeemedAt = row.redeemed_at || row.created_at || row.redeemedAt || row.createdAt || null;
        const expiresAt = row.expires_at || null;

        if (search && !`${phone} ${name} ${rewardName} ${qrCode}`.includes(search)) return false;
        if (status && status !== 'all' && rowStatus !== status) return false;
        if (campaign && !rewardName.includes(campaign)) return false;
        if (rewardType && !rewardName.includes(rewardType)) return false;
        if (pointMin !== null && points < pointMin) return false;
        if (pointMax !== null && points > pointMax) return false;
        if (dateFrom && redeemedAt && new Date(redeemedAt).getTime() < new Date(dateFrom).getTime()) return false;
        if (dateTo && redeemedAt && new Date(redeemedAt).getTime() > new Date(`${dateTo}T23:59:59`).getTime()) return false;
        if (currentRedemptionQuickMode === 'expiring' && expiresAt) {
            const exp = new Date(expiresAt).getTime();
            if (!Number.isFinite(exp) || exp > Date.now() + 7 * 24 * 60 * 60 * 1000) return false;
        }
        return true;
    });

    const groups = buildRedemptionGroups(filteredRows);
    const sorters = {
        latest: (a, b) => new Date(b.latestAt || 0).getTime() - new Date(a.latestAt || 0).getTime(),
        count: (a, b) => b.totalCount - a.totalCount || new Date(b.latestAt || 0).getTime() - new Date(a.latestAt || 0).getTime(),
        points: (a, b) => b.totalPoints - a.totalPoints || new Date(b.latestAt || 0).getTime() - new Date(a.latestAt || 0).getTime(),
        campaigns: (a, b) => (b.rewards?.length || 0) - (a.rewards?.length || 0) || new Date(b.latestAt || 0).getTime() - new Date(a.latestAt || 0).getTime()
    };
    groups.sort(sorters[sortBy] || sorters.latest);
    return { filteredRows, groups };
}

function resetRedemptionFilters() {
    currentRedemptionQuickMode = '';
    ['redemption-search', 'redemption-status-filter', 'redemption-campaign-filter', 'redemption-reward-type-filter', 'redemption-point-min', 'redemption-point-max', 'redemption-date-from', 'redemption-date-to', 'redemption-sort'].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === 'redemption-sort') el.value = 'latest';
        else if (el.tagName === 'SELECT') el.value = '';
        else el.value = '';
    });
    loadRedemptions();
}

function formatTrendLabels(rows) {
    const buckets = new Map();
    for (const row of rows) {
        const raw = row.redeemed_at || row.created_at || row.redeemedAt || row.createdAt;
        const date = raw ? new Date(raw) : null;
        if (!date || Number.isNaN(date.getTime())) continue;
        const key = date.toLocaleDateString('th-TH', { month: 'short', day: 'numeric' });
        buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    return Array.from(buckets.entries()).slice(-10);
}

function renderRedemptionCharts(rows) {
    const tableBody = document.getElementById('redemption-analytics-table-body');
    const summaryEl = document.getElementById('redemption-analytics-summary');
    if (!tableBody && !summaryEl) return;

    if (rows) currentRedemptionVisibleRows = Array.isArray(rows) ? rows : [];
    syncRedemptionAnalyticsViewButtons();
    updateRedemptionAnalyticsSortOptions(currentRedemptionAnalyticsView);

    const records = aggregateRedemptionAnalyticsRows(currentRedemptionVisibleRows);
    const labelText = currentRedemptionAnalyticsView === 'daily' ? 'รายวัน' : 'รายแคมเปญ';

    if (summaryEl) {
        summaryEl.textContent = `${labelText} • ${formatNumber(records.length)} กลุ่ม • ${formatNumber(currentRedemptionVisibleRows.length)} รายการ`;
    }

    if (!tableBody) return;

    if (records.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="redemption-empty-cell">ไม่พบข้อมูลสำหรับแสดงในตาราง</td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = records.map((item, index) => `
        <tr>
            <td class="redemption-analytics-index">${formatNumber(index + 1)}</td>
            <td>
                <div class="redemption-analytics-campaign">${escapeHtml(item.bucketLabel)}</div>
                <div class="redemption-analytics-sub">${currentRedemptionAnalyticsView === 'daily' ? 'กลุ่มตามวัน' : 'กลุ่มตามแคมเปญ'}</div>
            </td>
            <td class="redemption-analytics-number redemption-analytics-center">${formatNumber(item.totalCount)}</td>
            <td class="redemption-analytics-number redemption-analytics-center">${formatNumber(item.uniqueUserCount)}</td>
            <td class="redemption-analytics-number redemption-analytics-right">${item.totalPoints >= 0 ? '+' : ''}${formatNumber(item.totalPoints)}</td>
            <td class="redemption-analytics-left">
                <div class="redemption-analytics-campaign">${escapeHtml(item.topCampaignSummary)}</div>
            </td>
            <td class="redemption-analytics-center">${escapeHtml(formatDate(item.latestAt))}</td>
        </tr>
    `).join('');
}

function renderRedemptionGroupDetails(group) {
    const sortedRedemptions = group.redemptions
        .slice()
        .sort((a, b) => new Date(b.redeemed_at || b.created_at || 0).getTime() - new Date(a.redeemed_at || a.created_at || 0).getTime());

    const rows = sortedRedemptions.map((row) => {
        const rewardName = escapeHtml(row.reward_name || '-');
        const points = Number(row.points_redeemed ?? row.points ?? 0) || 0;
        const redeemedAt = formatDate(row.redeemed_at || row.created_at || row.redeemedAt || row.createdAt);
        const qrCode = String(row.qr_code || row.code || '-');
        const channel = escapeHtml(row.channel || row.source || row.redeem_channel || '-');
        const statusBadge = formatRedemptionStatusBadge(row.redemption_status || row.status);
        const qrShort = escapeHtml(qrCode.length > 18 ? `${qrCode.slice(0, 18)}...` : qrCode);
        const redemptionKey = escapeHtml(row.redemption_id || row.id || '');

        return `
            <div class="redemption-detail-row-item">
                <div>${redeemedAt}</div>
                <div style="text-align:right;">${points >= 0 ? '+' : ''}${formatNumber(points)} แต้ม</div>
                <div>
                    <span title="${escapeHtml(qrCode)}" style="max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:inline-block;">${qrShort}</span>
                </div>
                <div>${rewardName}</div>
            </div>
        `;
    }).join('');

    const accordionRows = sortedRedemptions.map((row) => {
        const rewardName = escapeHtml(row.reward_name || '-');
        const points = Number(row.points_redeemed ?? row.points ?? 0) || 0;
        const redeemedAt = formatDate(row.redeemed_at || row.created_at || row.redeemedAt || row.createdAt);
        const statusBadge = formatRedemptionStatusBadge(row.redemption_status || row.status);
        const qrCode = escapeHtml(row.qr_code || row.code || '-');
        return `
            <div class="redemption-accordion-row">
                <div class="redemption-accordion-main">
                    <div>
                        <div class="redemption-accordion-title">${rewardName}</div>
                        <div class="redemption-accordion-sub">${redeemedAt}</div>
                    </div>
                    <div class="redemption-accordion-meta">
                        <span>${points >= 0 ? '+' : ''}${formatNumber(points)} แต้ม</span>
                        <span>${statusBadge}</span>
                    </div>
                </div>
                <div class="redemption-accordion-detail">
                    <span class="redemption-accordion-code" title="${qrCode}">${qrCode}</span>
                    <span>${escapeHtml(row.channel || row.source || row.redeem_channel || '-')}</span>
                </div>
            </div>
        `;
    }).join('');

    return `
        <tr id="redemption-detail-${escapeHtml(group.groupKey)}" class="redemption-detail-row" style="display:none;">
            <td colspan="6" style="padding: 0; border-top: 1px solid var(--border); background: var(--bg-card-alt);">
                <div class="redemption-detail-panel">
                    <div class="redemption-detail-panel-head">
                        <div>
                            <div class="redemption-detail-panel-title">รายละเอียดการแลกทั้งหมด</div>
                            <div class="redemption-detail-panel-sub">${escapeHtml(group.userName)} • ${escapeHtml(group.phoneNumber)}</div>
                        </div>
                        <div class="redemption-detail-panel-actions">
                            <button class="btn btn-ghost" type="button" onclick="exportRedemptionHistory('${escapeHtml(group.groupKey)}')">Export CSV</button>
                        </div>
                    </div>
                    <div class="redemption-detail-table">
                        <div class="redemption-detail-table-head">
                            <span>เวลา</span>
                            <span>แต้ม</span>
                            <span>code</span>
                            <span>ชื่อรางวัล</span>
                        </div>
                        ${rows}
                    </div>
                    <div class="redemption-accordion-list">
                        ${accordionRows}
                    </div>
                </div>
            </td>
        </tr>
    `;
}

function toggleRedemptionGroupDetails(groupKey) {
    const detailRow = document.getElementById(`redemption-detail-${groupKey}`);
    const cardDetail = document.getElementById(`card-detail-${groupKey}`);
    if (detailRow) {
        const isHidden = detailRow.style.display === 'none' || !detailRow.style.display;
        detailRow.style.display = isHidden ? 'table-row' : 'none';
    }
    if (cardDetail) {
        const isHidden = cardDetail.style.display === 'none' || !cardDetail.style.display;
        cardDetail.style.display = isHidden ? 'block' : 'none';
    }
}

async function loadRedemptions(page = 1) {
    try {
        const search = (document.getElementById('redemption-search')?.value || '').trim();
        const status = (document.getElementById('redemption-status-filter')?.value || '').trim();
        const dateFrom = (document.getElementById('redemption-date-from')?.value || '').trim();
        const dateTo = (document.getElementById('redemption-date-to')?.value || '').trim();
        const limit = 100;

        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (status) params.append('status', status);
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);

        const summaryEl = document.getElementById('redemption-summary');
        if (summaryEl) summaryEl.innerHTML = '';

        setEmptyRow('redemptions-table', 6, 'กำลังรวบรวมข้อมูลการแลก...');

        const allRows = [];
        let currentPage = Math.max(1, Number(page) || 1);
        let totalPages = currentPage;

        while (currentPage <= totalPages) {
            const pageParams = new URLSearchParams(params.toString());
            pageParams.set('page', String(currentPage));
            pageParams.set('limit', String(limit));

            const url = `${API_BASE_URL}/api/redemptions?${pageParams.toString()}`;
            const response = await fetch(url, { headers: { ...getAuthHeaders() } });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                console.error('Failed to load redemptions:', data);
                if (summaryEl) summaryEl.innerHTML = '';
                setEmptyRow('redemptions-table', 7, 'ไม่สามารถโหลดข้อมูลได้');
                return;
            }

            const rows = Array.isArray(data?.data) ? data.data : [];
            allRows.push(...rows);

            const pagination = data?.pagination || { pages: 1 };
            totalPages = Math.max(totalPages, Number(pagination.pages || 1));

            if (rows.length < limit && currentPage >= totalPages) {
                break;
            }

            currentPage += 1;
        }

        currentRedemptionRows = allRows;
        populateRedemptionCampaignFilter(allRows);
        const filtered = applyRedemptionClientFilters(allRows);
        currentRedemptionGroups = filtered.groups;
        currentRedemptionVisibleRows = filtered.filteredRows;
        renderRedemptions(filtered.groups, filtered.filteredRows);
        renderRedemptionCharts(filtered.filteredRows);
    } catch (err) {
        console.error('Error loading redemptions:', err);
        const summaryEl = document.getElementById('redemption-summary');
        if (summaryEl) summaryEl.innerHTML = '';
        setEmptyRow('redemptions-table', 7, 'เกิดข้อผิดพลาดขณะโหลดข้อมูล');
    }
}

function renderRedemptions(groups, rawRows = []) {
    const tbody = document.getElementById('redemptions-table');
    if (!tbody) return;

    renderRedemptionSummary(groups);

    if (!groups || groups.length === 0) {
        const summaryEl = document.getElementById('redemption-summary');
        if (summaryEl) summaryEl.innerHTML = '';
        setEmptyRow('redemptions-table', 7, 'ไม่พบรายการแลกรางวัล');
        return;
    }

    tbody.innerHTML = groups.map((group) => {
        const latestDate = formatDate(group.latestAt);
        const rewardSummary = renderRedemptionGroupRewards(group.rewards);
        const latestStatusBadge = formatRedemptionStatusBadge(group.latestStatus);
        const groupId = escapeHtml(group.groupKey);

        return `
            <tr style="background: var(--bg-card); border-top: 1px solid var(--border);">
                <td style="padding: 1rem; text-align: left;">
                    <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(group.userName)}</div>
                    <div class="user-subtext">${escapeHtml(group.phoneNumber)}</div>
                </td>
                <td style="padding: 1rem; text-align: center;"><strong>${formatNumber(group.totalCount)} ครั้ง</strong></td>
                <td style="padding: 1rem; text-align: right;"><strong>${group.totalPoints >= 0 ? '+' : ''}${formatNumber(group.totalPoints)} แต้ม</strong></td>
                <td style="padding: 1rem; text-align: left;">${rewardSummary}</td>
                <td style="padding: 1rem; text-align: center;">
                    <div>${latestDate}</div>
                    <div class="user-subtext">${escapeHtml(group.latestReward || '-')}</div>
                </td>
                <td style="padding: 1rem; text-align: center;">
                    <div style="display:flex; gap:0.5rem; justify-content:center; flex-wrap:wrap;">
                        <button class="btn btn-check" type="button" onclick="toggleRedemptionGroupDetails('${groupId}')">Details</button>
                    </div>
                </td>
            </tr>
            ${renderRedemptionGroupDetails(group)}
        `;
    }).join('');
    // render card view as well
    try { renderRedemptionCards(groups); } catch (e) { console.error('renderRedemptionCards failed', e); }
}

function renderRedemptionCards(groups) {
    const container = document.getElementById('redemptions-cards');
    if (!container) return;
    container.innerHTML = '';

    groups.forEach((group) => {
        const chips = (group.rewards || []).slice(0,4).map(r => `<span class="redemption-chip">${escapeHtml(r.name)} ×${formatNumber(r.count)}</span>`).join('');
        const cardHtml = `
            <div class="redemption-card">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap;">
                    <div style="min-width:0;">
                        <div style="font-weight:700; font-size:1rem; color:var(--text-primary);">${escapeHtml(group.userName)}</div>
                        <div style="color:var(--text-secondary); font-size:0.95rem;">${escapeHtml(group.phoneNumber)}</div>
                    </div>
                    <div style="display:flex; gap:0.75rem; align-items:center;">
                        <div style="text-align:center;"><div style="font-weight:700">${formatNumber(group.totalCount)}</div><div style="font-size:0.85rem; color:var(--text-secondary);">ครั้ง</div></div>
                        <div style="text-align:center;"><div style="font-weight:700">${group.totalPoints >= 0 ? '+' : ''}${formatNumber(group.totalPoints)}</div><div style="font-size:0.85rem; color:var(--text-secondary);">แต้มรวม</div></div>
                        <div style="display:flex; gap:0.4rem; flex-wrap:wrap; justify-content:flex-end;">
                            <button class="btn btn-ghost" onclick="toggleRedemptionGroupDetails('${escapeHtml(group.groupKey)}')">Details</button>
                            <button class="btn btn-ghost icon-btn" title="Copy phone" onclick="copyRedemptionText('${escapeHtml(group.phoneNumber)}')"><i class="fas fa-copy"></i></button>
                            <button class="btn btn-ghost icon-btn" title="Export CSV" onclick="exportRedemptionHistory('${escapeHtml(group.groupKey)}')"><i class="fas fa-file-csv"></i></button>
                        </div>
                    </div>
                </div>
                <div style="margin-top:0.75rem; display:flex; gap:0.5rem; flex-wrap:wrap;">${chips}</div>
                <div id="card-detail-${escapeHtml(group.groupKey)}" style="display:none; margin-top:0.75rem;"></div>
            </div>
        `;

        const wrapper = document.createElement('div');
        wrapper.innerHTML = cardHtml;
        const detailContainer = wrapper.querySelector(`[id="card-detail-${escapeHtml(group.groupKey)}"]`);
        if (detailContainer) {
            // show 5 latest transactions inside
            const recent = (group.redemptions || []).slice().sort((a,b)=> new Date(b.redeemed_at||b.created_at||0).getTime() - new Date(a.redeemed_at||a.created_at||0).getTime()).slice(0,5);
            const rows = recent.map(r => `
                <div style="display:grid; grid-template-columns: 1.2fr 0.7fr 1fr 0.9fr; gap:0.75rem; padding:0.55rem 0; border-top:1px solid var(--border); font-size:0.92rem; align-items:center;">
                    <div>${formatDate(r.redeemed_at||r.created_at||r.redeemedAt||r.createdAt)}</div>
                    <div style="text-align:right;">${Number(r.points_redeemed||r.points||0) >=0 ? '+' : ''}${formatNumber(Number(r.points_redeemed||r.points||0))}</div>
                    <div style="text-align:right;">${formatRedemptionStatusBadge(r.redemption_status||r.status)}</div>
                    <div style="text-align:right; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(r.qr_code||r.code||'-')}</div>
                </div>
            `).join('');

            detailContainer.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; margin-bottom:0.5rem;">
                    <div style="font-weight:600;">รายการล่าสุด</div>
                    <button class="btn btn-ghost" onclick="exportRedemptionHistory('${escapeHtml(group.groupKey)}')">ดูทั้งหมด / Export</button>
                </div>
                <div>${rows}</div>
                ${(group.redemptions||[]).length > 5 ? `<div style="margin-top:0.6rem;"><button class="btn btn-ghost" onclick="openUserFullHistory('${escapeHtml(group.groupKey)}')">ดูทั้งหมด</button></div>` : ''}
            `;
        }

        container.appendChild(wrapper);
    });
}

function setQuickRange(range) {
    const from = document.getElementById('redemption-date-from');
    const to = document.getElementById('redemption-date-to');
    const today = new Date();
    if (range === 'today') {
        currentRedemptionQuickMode = '';
        const iso = today.toISOString().slice(0,10);
        if (from) from.value = iso; if (to) to.value = iso;
    } else if (range === '7d') {
        currentRedemptionQuickMode = '';
        const fromDate = new Date(today.getTime() - 7*24*60*60*1000).toISOString().slice(0,10);
        if (from) from.value = fromDate; if (to) to.value = today.toISOString().slice(0,10);
    } else if (range === 'month') {
        currentRedemptionQuickMode = '';
        const first = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0,10);
        if (from) from.value = first; if (to) to.value = today.toISOString().slice(0,10);
    } else if (range === 'expiring') {
        currentRedemptionQuickMode = 'expiring';
        // set a near-future filter - 7 days
        const fromDate = today.toISOString().slice(0,10);
        const toDate = new Date(today.getTime() + 7*24*60*60*1000).toISOString().slice(0,10);
        if (from) from.value = fromDate; if (to) to.value = toDate;
    }
    loadRedemptions();
}

function setQuickFilter(status) {
    currentRedemptionQuickMode = '';
    const sel = document.getElementById('redemption-status-filter');
    if (sel) sel.value = status;
    loadRedemptions();
}

function openUserFullHistory(groupKey) {
    // Find group by key from last loaded rows; for simplicity open detail row in table view
    toggleRedemptionGroupDetails(groupKey);
}

async function openRedemptionDetail(redemptionId) {
    if (!redemptionId) return;
    try {
        const normalizedId = String(redemptionId).trim();
        const allRows = Array.isArray(currentRedemptionRows) ? currentRedemptionRows : [];
        const row = allRows.find((entry) => String(entry.redemption_id || entry.id || '') === normalizedId);
        if (!row) {
            await showActionDialogInfo('ไม่พบรายละเอียดการแลกรางวัลรายการนี้');
            return;
        }

        const detailHtml = `
            <div style="display:grid; gap:0.75rem;">
                <div><strong>แคมเปญ:</strong> ${escapeHtml(getRedemptionCampaignName(row))}</div>
                <div><strong>เบอร์โทร:</strong> ${escapeHtml(row.phone_number || row.phone || '-')}</div>
                <div><strong>แต้ม:</strong> ${formatNumber(Number(row.points_redeemed ?? row.points ?? 0) || 0)}</div>
                <div><strong>สถานะ:</strong> ${formatRedemptionStatusBadge(row.redemption_status || row.status)}</div>
                <div><strong>เวลา:</strong> ${escapeHtml(formatDate(row.redeemed_at || row.created_at || row.redeemedAt || row.createdAt))}</div>
                <div><strong>QR Code:</strong> ${escapeHtml(row.qr_code || row.code || '-')}</div>
                <div><strong>ช่องทาง:</strong> ${escapeHtml(row.channel || row.source || row.redeem_channel || '-')}</div>
            </div>
        `;
        await openActionDialog({ title: 'รายละเอียดการแลกรางวัล', message: detailHtml, confirmText: 'ปิด', showCancel: false, confirmClass: 'btn btn-check' });
    } catch (err) {
        console.error('Failed to open redemption detail:', err);
        await showActionDialogInfo('ไม่สามารถดึงรายละเอียดการแลกรางวัลได้');
    }
}

function copyRedemptionText(text) {
    const value = String(text || '').trim();
    if (!value) return;
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(value).catch(() => {});
    }
}

function exportRedemptionHistory(groupKey) {
    const group = (currentRedemptionGroups || []).find((entry) => String(entry.groupKey) === String(groupKey));
    if (!group) return;

    const header = ['ชื่อ', 'เบอร์โทร', 'แคมเปญ', 'แต้ม', 'สถานะ', 'เวลา', 'QR Code'];
    const lines = [header.join(',')];
    group.redemptions.forEach((row) => {
        lines.push([
            group.userName,
            group.phoneNumber,
            getRedemptionCampaignName(row),
            Number(row.points_redeemed ?? row.points ?? 0) || 0,
            getNormalizedRedemptionStatus(row),
            row.redeemed_at || row.created_at || row.redeemedAt || row.createdAt || '',
            row.qr_code || row.code || ''
        ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','));
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `redemption-history-${group.phoneNumber || 'user'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

/* --- New UI helpers: QR modal and Redemption Drawer --- */
function openQRModal(qrCode) {
    if (!qrCode) return;
    const modal = document.createElement('div');
    modal.className = 'ui-modal-overlay';
    modal.innerHTML = `
        <div class="ui-modal">
            <div class="ui-modal-header">
                <div style="font-weight:700">QR Code</div>
                <button class="btn btn-ghost" onclick="document.body.removeChild(this.closest('.ui-modal-overlay'))">Close</button>
            </div>
            <div class="ui-modal-body" style="text-align:center; padding:1.25rem;">
                <div id="qr-modal-canvas" style="display:inline-block; padding:1rem; border-radius:12px; background:#fff;"></div>
                <div style="margin-top:0.6rem; font-family:monospace; font-size:0.85rem; color:var(--text-secondary); word-break:break-all;">${escapeHtml(qrCode)}</div>
                <div style="margin-top:0.85rem; display:flex; gap:0.5rem; justify-content:center;">
                    <button class="btn btn-ghost" onclick="copyRedemptionText('${escapeHtml(qrCode)}')"><i class="fas fa-copy"></i> Copy</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    // Generate QR image using QRCode.js (loaded in index.html)
    try {
        new QRCode(document.getElementById('qr-modal-canvas'), {
            text: qrCode,
            width: 220,
            height: 220,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });
    } catch (e) {
        document.getElementById('qr-modal-canvas').innerHTML =
            `<div style="font-family:monospace;font-size:1.1rem;padding:1rem;">${escapeHtml(qrCode)}</div>`;
    }
}

function openRedemptionDrawer(redemptionId) {
    if (!redemptionId) return;
    const id = String(redemptionId).trim();
    const allRows = Array.isArray(currentRedemptionRows) ? currentRedemptionRows : [];
    const row = allRows.find((r) => String(r.redemption_id || r.id || '') === id);
    if (!row) {
        showActionDialogInfo('ไม่พบรายการการแลกรางวัล');
        return;
    }

    // Close any existing detail drawer (shared with promo verifier)
    document.getElementById('pv-detail-overlay')?.remove();
    document.getElementById('pv-detail-drawer-el')?.remove();

    const qrVal = escapeHtml(row.qr_code || row.code || '');
    const status = row.redemption_status || row.status || '';
    const rewardName = row.reward_name || getRedemptionCampaignName(row) || '-';
    const points = Number(row.points_redeemed ?? row.points ?? 0) || 0;
    const expiresAt = row.expires_at || row.expiry_date || null;

    // Build synthetic timeline events
    const timelineEvents = [];
    if (row.redeemed_at || row.created_at) {
        timelineEvents.push({ event_type: 'created', event_title: 'แลกรางวัล', event_timestamp: row.redeemed_at || row.created_at });
    }
    if (row.used_at) {
        timelineEvents.push({ event_type: 'used', event_title: 'ใช้งานแล้ว', event_timestamp: row.used_at });
    }
    const statusLow = String(status).toLowerCase();
    if (statusLow === 'cancelled' || statusLow === 'canceled') {
        timelineEvents.push({ event_type: 'cancelled', event_title: 'ยกเลิก', event_timestamp: row.updated_at || '' });
    } else if (statusLow === 'refunded') {
        timelineEvents.push({ event_type: 'refunded', event_title: 'คืนแต้ม', event_timestamp: row.updated_at || '' });
    } else if (statusLow === 'expired') {
        timelineEvents.push({ event_type: 'expired', event_title: 'หมดอายุ', event_timestamp: expiresAt || '' });
    }

    const overlay = document.createElement('div');
    overlay.id = 'pv-detail-overlay';
    overlay.className = 'pv-detail-overlay';
    overlay.addEventListener('click', (e) => { if (e.target === overlay) pvCloseDetailDrawer(); });

    const drawer = document.createElement('div');
    drawer.id = 'pv-detail-drawer-el';
    drawer.className = 'pv-detail-drawer';

    drawer.innerHTML = `
        <!-- HERO -->
        <div class="pv-drawer-hero">
            <button class="pv-drawer-close" onclick="pvCloseDetailDrawer()" title="ปิด"><i class="fas fa-times"></i></button>
            <div class="pv-drawer-hero-code">${qrVal || '-'}</div>
            <div class="pv-drawer-hero-badges">
                ${typeof pvStatusBadge === 'function' ? pvStatusBadge(status) : ''}
            </div>
            <div class="pv-drawer-hero-sub">
                <span>${escapeHtml(rewardName)}</span>
                <span class="pv-hero-sep">·</span>
                <span>${formatNumber(points)} แต้ม</span>
                ${expiresAt ? `<span class="pv-hero-sep">·</span><span>หมดอายุ ${typeof pvFmtDate === 'function' ? pvFmtDate(expiresAt) : escapeHtml(expiresAt)}</span>` : ''}
            </div>
            <div class="pv-drawer-hero-btns">
                <button class="pv-hero-btn" onclick="pvCopyCode('${qrVal}')">
                    <i class="fas fa-copy"></i> Copy Code
                </button>
                ${qrVal ? `<button class="pv-hero-btn blue" onclick="pvShowQRModal('${qrVal}', '${id}')">
                    <i class="fas fa-qrcode"></i> เปิด QR
                </button>` : ''}
            </div>
        </div>

        <!-- TABS -->
        <div class="pv-drawer-tabs" id="pvdt-tabs-rdm-${id}">
            <button class="pv-tab-btn active" data-pvtab="info" onclick="pvSwitchDrawerTab('rdm-${id}','info',this)">
                <i class="fas fa-circle-info"></i> ข้อมูล
            </button>
            <button class="pv-tab-btn" data-pvtab="timeline" onclick="pvSwitchDrawerTab('rdm-${id}','timeline',this)">
                <i class="fas fa-timeline"></i> Timeline
            </button>
            <button class="pv-tab-btn" data-pvtab="audit" onclick="pvSwitchDrawerTab('rdm-${id}','audit',this)">
                <i class="fas fa-list-check"></i> Audit
            </button>
            <button class="pv-tab-btn" data-pvtab="actions" onclick="pvSwitchDrawerTab('rdm-${id}','actions',this)">
                <i class="fas fa-gear"></i> จัดการ
            </button>
        </div>

        <!-- BODY -->
        <div class="pv-drawer-body">

            <!-- TAB: INFO -->
            <div class="pv-tab-panel active" data-pvpanel="info">
                <div class="pv-info-group">
                    <div class="pv-info-group-title"><i class="fas fa-ticket"></i> ข้อมูลการแลกรางวัล</div>
                    ${typeof pvInfoRow === 'function' ? [
                        pvInfoRow('Redemption ID', `<code class="pv-code-mono">${escapeHtml(id)}</code>`),
                        pvInfoRow('QR / Code', `<code class="pv-code-mono">${qrVal || '-'}</code>`),
                        pvInfoRow('สถานะ', typeof pvStatusBadge === 'function' ? pvStatusBadge(status) : escapeHtml(status)),
                        pvInfoRow('รางวัล', escapeHtml(rewardName)),
                        pvInfoRow('แต้มที่ใช้', `${formatNumber(points)} แต้ม`),
                        pvInfoRow('ประเภทรางวัล', escapeHtml(row.reward_type || row.type || '-')),
                        pvInfoRow('วันที่แลก', typeof pvFmt === 'function' ? pvFmt(row.redeemed_at || row.created_at) : escapeHtml(row.redeemed_at || row.created_at || '-')),
                        pvInfoRow('วันที่ใช้งาน', row.used_at ? (typeof pvFmt === 'function' ? pvFmt(row.used_at) : escapeHtml(row.used_at)) : '-'),
                        pvInfoRow('วันหมดอายุ', expiresAt ? (typeof pvFmtDate === 'function' ? pvFmtDate(expiresAt) : escapeHtml(expiresAt)) : 'ไม่มีกำหนด'),
                        row.usage_instructions ? pvInfoRow('วิธีใช้งาน', escapeHtml(row.usage_instructions)) : '',
                    ].join('') : ''}
                </div>

                <div class="pv-info-group">
                    <div class="pv-info-group-title"><i class="fas fa-user"></i> ข้อมูลผู้ใช้</div>
                    ${(row.user_id || row.userId || row.user_name || row.full_name || row.phone_number || row.phone) ? `
                        ${typeof pvInfoRow === 'function' ? [
                            pvInfoRow('ชื่อ', escapeHtml(row.user_name || row.full_name || '-')),
                            pvInfoRow('เบอร์โทร', escapeHtml(row.phone_number || row.phone || '-')),
                            pvInfoRow('User ID', escapeHtml(String(row.user_id || row.userId || '-'))),
                            row.member_tier || row.tier ? pvInfoRow('Member Tier', escapeHtml(row.member_tier || row.tier)) : '',
                            row.total_points != null ? pvInfoRow('แต้มสะสม', `${formatNumber(row.total_points)} แต้ม`) : '',
                            row.total_redeems != null ? pvInfoRow('จำนวนแลกทั้งหมด', `${formatNumber(row.total_redeems)} ครั้ง`) : '',
                        ].join('') : ''}
                    ` : `
                        <div class="pv-drawer-empty">
                            <i class="fas fa-user-slash"></i>
                            <p>ยังไม่มีข้อมูลผู้ใช้</p>
                        </div>
                    `}
                </div>
            </div>

            <!-- TAB: TIMELINE -->
            <div class="pv-tab-panel" data-pvpanel="timeline">
                ${typeof pvRenderTimeline === 'function' ? pvRenderTimeline(timelineEvents) : ''}
            </div>

            <!-- TAB: AUDIT -->
            <div class="pv-tab-panel" data-pvpanel="audit">
                ${typeof pvRenderAuditTimeline === 'function' ? pvRenderAuditTimeline([]) : '<div class="pv-drawer-empty"><i class="fas fa-list-check"></i><p>ยังไม่มีรายการ Audit Log</p></div>'}
            </div>

            <!-- TAB: ACTIONS -->
            <div class="pv-tab-panel" data-pvpanel="actions">
                <div class="pv-actions-list">
                    <button class="pv-action-item" type="button" onclick="performAdminAction('${id}','approve')">
                        <div class="pv-ai-icon green"><i class="fas fa-circle-check"></i></div>
                        <div class="pv-ai-body">
                            <div class="pv-ai-title">อนุมัติการแลก</div>
                            <div class="pv-ai-desc">อนุมัติรายการแลกรางวัลนี้</div>
                        </div>
                        <i class="fas fa-chevron-right pv-ai-arrow"></i>
                    </button>
                    <button class="pv-action-item" type="button" onclick="performAdminAction('${id}','redeem')">
                        <div class="pv-ai-icon blue"><i class="fas fa-check"></i></div>
                        <div class="pv-ai-body">
                            <div class="pv-ai-title">ทำเครื่องหมายว่าใช้งานแล้ว</div>
                            <div class="pv-ai-desc">บันทึกว่าใช้งาน QR/โค้ดนี้แล้ว</div>
                        </div>
                        <i class="fas fa-chevron-right pv-ai-arrow"></i>
                    </button>
                    <button class="pv-action-item" type="button" onclick="performAdminAction('${id}','resend')">
                        <div class="pv-ai-icon gray"><i class="fas fa-paper-plane"></i></div>
                        <div class="pv-ai-body">
                            <div class="pv-ai-title">ส่ง QR ใหม่</div>
                            <div class="pv-ai-desc">ส่ง QR Code ให้ผู้ใช้อีกครั้ง</div>
                        </div>
                        <i class="fas fa-chevron-right pv-ai-arrow"></i>
                    </button>
                    <div class="pv-danger-zone">
                        <div class="pv-danger-zone-label"><i class="fas fa-triangle-exclamation"></i> Danger Zone</div>
                        <button class="pv-action-item danger" type="button" onclick="performAdminAction('${id}','refund')">
                            <div class="pv-ai-icon orange"><i class="fas fa-rotate-left"></i></div>
                            <div class="pv-ai-body">
                                <div class="pv-ai-title">คืนแต้ม</div>
                                <div class="pv-ai-desc">คืน ${formatNumber(points)} แต้มให้ผู้ใช้</div>
                            </div>
                            <i class="fas fa-chevron-right pv-ai-arrow"></i>
                        </button>
                        <button class="pv-action-item danger" type="button" onclick="performAdminAction('${id}','cancel')">
                            <div class="pv-ai-icon red"><i class="fas fa-ban"></i></div>
                            <div class="pv-ai-body">
                                <div class="pv-ai-title">ยกเลิก</div>
                                <div class="pv-ai-desc">ยกเลิกรายการแลกรางวัลนี้</div>
                            </div>
                            <i class="fas fa-chevron-right pv-ai-arrow"></i>
                        </button>
                    </div>
                </div>
            </div>

        </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);
}

function performAdminAction(id, action) {
    openActionDialog({ title: 'Confirm', message: `Confirm ${action} for ${id}?`, confirmText: 'Confirm', showCancel: true }).then((ok) => {
        if (!ok) return;
        showActionDialogInfo(`Action ${action} executed (stub)`);
    });
}

function initRedemptionFilters() {
    const ids = ['redemption-search', 'redemption-status-filter', 'redemption-campaign-filter', 'redemption-reward-type-filter', 'redemption-point-min', 'redemption-point-max', 'redemption-date-from', 'redemption-date-to', 'redemption-sort'];
    ids.forEach((id) => {
        const el = document.getElementById(id);
        if (!el || el.dataset.redemptionBound === '1') return;
        const handler = () => loadRedemptions();
        el.addEventListener('change', handler);
        el.addEventListener('input', handler);
        el.dataset.redemptionBound = '1';
    });

    const analyticsIds = ['redemption-analytics-search', 'redemption-analytics-status-filter', 'redemption-analytics-sort'];
    analyticsIds.forEach((id) => {
        const el = document.getElementById(id);
        if (!el || el.dataset.redemptionAnalyticsBound === '1') return;
        const handler = () => renderRedemptionCharts(currentRedemptionVisibleRows);
        el.addEventListener('change', handler);
        el.addEventListener('input', handler);
        el.dataset.redemptionAnalyticsBound = '1';
    });

    syncRedemptionAnalyticsViewButtons();
    updateRedemptionAnalyticsSortOptions(currentRedemptionAnalyticsView);
}

    function applyCompanyFilters() {
        renderCompanies(getCompanyDisplayRows());
    }

function getCompanyRowByIndex(index) {
    const rows = Array.isArray(companySourceRows) && companySourceRows.length > 0
        ? companySourceRows
        : dashboardPayload?.sections?.companies;
    if (!Array.isArray(rows)) return null;
    if (!Number.isInteger(index) || index < 0 || index >= rows.length) return null;
    return rows[index];
}

async function handleCompanyAction(action, row) {
    if (!row) return;

    const fullName = row.name || row.full_name || row.username || 'ผู้ใช้งาน';
    // Backend maps phone_number to regNo in companies section
    const phone = row.phone || row.phone_number || row.regNo || '';

    if (action === 'view') {
        await openUserDetailModal(row, 'Elder Accounts');
        return;
    }

    if (action === 'manage') {
        await openUserDetailModal(row, 'Elder Accounts');
        return;
    }

    if (!phone) {
        console.error('[handleCompanyAction] Phone not found:', row);
        await showActionDialogInfo('ไม่พบเบอร์โทรของผู้ใช้รายนี้ จึงบล็อค/ปลดบล็อคไม่ได้', 'ดำเนินการไม่สำเร็จ');
        return;
    }

    if (action === 'block') {
        const confirmed = await openActionDialog({
            title: 'ยืนยันการบล็อคบัญชี',
            message: `ต้องการบล็อคบัญชี ${fullName} (${phone}) ใช่หรือไม่?`,
            confirmText: 'ยืนยันการบล็อค',
            cancelText: 'ยกเลิก',
            confirmClass: 'btn btn-del',
            showCancel: true
        });
        if (!confirmed) return;

        console.log(`[handleCompanyAction] Blocking user: ${fullName} (${phone})`);
        const result = await fetchAuthJson(`${API_BASE_URL}/api/admin/users/block`, {
            method: 'POST',
            body: JSON.stringify({
                phone_number: phone,
                reason: 'บล็อคจากหน้า Elder Account Center',
                warning_note: 'บัญชีถูกระงับชั่วคราวโดยผู้ดูแลระบบ'
            })
        });
        console.log('[handleCompanyAction] Block result:', result);
        await showActionDialogInfo(`บล็อคบัญชี ${fullName} (${phone}) สำเร็จแล้ว`, 'สำเร็จ');
        await loadDashboardSummary();
        return;
    }

    if (action === 'unblock') {
        const confirmed = await openActionDialog({
            title: 'ยืนยันการปลดบล็อคบัญชี',
            message: `ต้องการปลดบล็อคบัญชี ${fullName} (${phone}) ใช่หรือไม่?`,
            confirmText: 'ยืนยันการปลดบล็อค',
            cancelText: 'ยกเลิก',
            confirmClass: 'btn btn-check',
            showCancel: true
        });
        if (!confirmed) return;

        console.log(`[handleCompanyAction] Unblocking user: ${fullName} (${phone})`);
        const result = await fetchAuthJson(`${API_BASE_URL}/api/admin/users/unblock`, {
            method: 'POST',
            body: JSON.stringify({
                phone_number: phone
            })
        });
        console.log('[handleCompanyAction] Unblock result:', result);
        await showActionDialogInfo(`ปลดบล็อคบัญชี ${fullName} (${phone}) สำเร็จแล้ว`, 'สำเร็จ');
        await loadDashboardSummary();
    }
}

function getAdTargetLabel(targetPage) {
    const map = {
        home_feed: 'หน้า Home Feed',
        community: 'หน้า Community',
        reward: 'หน้า Reward'
    };
    return map[targetPage] || targetPage || '-';
}

// ═══════════════════════════════════════════════════════════════
// PARTNER ADS MANAGEMENT
// ═══════════════════════════════════════════════════════════════

// ── Partner Ads tab ──

const AD_FORMAT_LABELS = {
    popup:        'Popup',
    notification: 'Notification',
    article:      'Article',
};

const AD_FORMAT_COLORS = {
    popup:        '#e67e22',
    notification: '#8e44ad',
    article:      '#27ae60',
};

function togglePartnerAdDelayField() {
    const fmt = document.getElementById('p-ad-format')?.value;
    const row = document.getElementById('p-ad-delay-row');
    if (row) row.style.display = fmt === 'popup' ? 'block' : 'none';
}

function resetPartnerAdForm() {
    document.getElementById('p-ad-edit-id').value = '';
    document.getElementById('p-ad-format').value  = 'popup';
    document.getElementById('p-ad-title').value   = '';
    document.getElementById('p-ad-body').value    = '';
    document.getElementById('p-ad-cta').value     = 'ดูเพิ่มเติม';
    document.getElementById('p-ad-delay').value   = '0';
    document.getElementById('p-ad-start').value   = '';
    document.getElementById('p-ad-end').value     = '';
    document.getElementById('p-ad-image').value   = '';
    const msg = document.getElementById('p-ad-form-msg');
    if (msg) msg.textContent = '';
    togglePartnerAdDelayField();
    updateAdPreview();
}

async function submitPartnerAdForm() {
    const partnerId = window._selectedPartnerId;
    const msg = document.getElementById('p-ad-form-msg');
    if (!partnerId) { msg.style.color = '#e74c3c'; msg.textContent = 'ยังไม่ได้เลือกพาร์ทเนอร์'; return; }
    const title = document.getElementById('p-ad-title').value.trim();
    if (!title) { msg.style.color = '#e74c3c'; msg.textContent = 'กรุณากรอกหัวข้อโฆษณา'; return; }

    const editId = document.getElementById('p-ad-edit-id').value;
    const fd = new FormData();
    fd.append('partner_id',            partnerId);
    fd.append('ad_format',             document.getElementById('p-ad-format').value);
    fd.append('title',                 title);
    fd.append('body',                  document.getElementById('p-ad-body').value.trim());
    fd.append('cta_text',              document.getElementById('p-ad-cta').value.trim() || 'ดูเพิ่มเติม');
    fd.append('display_delay_seconds', document.getElementById('p-ad-delay').value || '0');
    fd.append('start_date',            document.getElementById('p-ad-start').value || '');
    fd.append('end_date',              document.getElementById('p-ad-end').value   || '');
    const imgFile = document.getElementById('p-ad-image').files[0];
    if (imgFile) fd.append('image', imgFile);

    msg.style.color = '#888';
    msg.textContent = 'กำลังบันทึก...';
    try {
        const url    = editId ? `${API_BASE_URL}/api/ads/${editId}` : `${API_BASE_URL}/api/ads`;
        const method = editId ? 'PUT' : 'POST';
        const res    = await fetch(url, { method, headers: getAuthHeaders(), body: fd });
        if (!res.ok) { const err = await res.json(); throw new Error(err.error || res.statusText); }
        msg.style.color = '#27ae60';
        msg.textContent = editId ? 'อัปเดตแล้ว ✓' : 'สร้างโฆษณาแล้ว ✓';
        resetPartnerAdForm();
        loadPartnerAds(partnerId);
    } catch (e) {
        msg.style.color = '#e74c3c';
        msg.textContent = 'เกิดข้อผิดพลาด: ' + e.message;
    }
}

async function loadPartnerAds(partnerId) {
    const el = document.getElementById('partner-ads-list');
    if (!el || !partnerId) return;
    el.innerHTML = '<div style="color:#aaa;font-size:12px"><i class="fas fa-spinner fa-spin"></i> โหลด...</div>';
    try {
        const res  = await fetch(`${API_BASE_URL}/api/ads/admin/all`, { headers: getAuthHeaders() });
        const all  = await res.json();
        const list = all.filter(a => String(a.partner_id) === String(partnerId));
        setTabCount('ads', list.length);
        if (!list.length) {
            el.innerHTML = '<div style="color:#aaa;font-size:13px;text-align:center;padding:20px">ยังไม่มีโฆษณา</div>';
            return;
        }
        el.innerHTML = list.map(ad => {
            const fmtColor  = AD_FORMAT_COLORS[ad.ad_format] || '#888';
            const fmtLabel  = AD_FORMAT_LABELS[ad.ad_format] || ad.ad_format;
            const delayNote = ad.ad_format === 'popup' && ad.display_delay_seconds > 0
                ? `<span style="font-size:10px;color:#888"> · delay ${ad.display_delay_seconds}s</span>` : '';
            const pushBtn   = ad.ad_format === 'notification'
                ? `<button class="btn" style="font-size:10px;padding:3px 8px;background:#8e44ad;color:#fff;white-space:nowrap"
                       onclick="sendPartnerAdPush(${ad.id}, this)"><i class="fas fa-paper-plane"></i> Push</button>` : '';
            const statusColor = ad.is_active ? '#10b981' : '#6b7280';
            const statusLabel = ad.is_active ? 'Active'  : 'Inactive';
            return `
            <div style="background:var(--bg-2,#f9f9f9);border:1px solid var(--border,#e5e7eb);border-radius:8px;padding:10px 12px">
                <div style="display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap">
                    <span style="background:${fmtColor};color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;flex-shrink:0">${escapeHtml(fmtLabel)}</span>
                    <div style="flex:1;min-width:0">
                        <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(ad.title)}${delayNote}</div>
                        ${ad.body ? `<div style="font-size:11px;color:var(--text-muted);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.4">${escapeHtmlMultiline(ad.body)}</div>` : ''}
                    </div>
                    <span style="font-size:10px;font-weight:600;color:${statusColor};background:${statusColor}18;padding:1px 6px;border-radius:10px;white-space:nowrap;flex-shrink:0">${statusLabel}</span>
                </div>
                <div style="display:flex;align-items:center;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid var(--border,#e5e7eb);flex-wrap:wrap">
                    <span style="font-size:11px;color:#555"><i class="fas fa-eye" style="color:#6366f1"></i> ${ad.view_count || 0}</span>
                    <span style="font-size:11px;color:#555"><i class="fas fa-hand-pointer" style="color:#10b981"></i> ${ad.click_count || 0}</span>
                    <span style="font-size:11px;color:#555"><i class="fas fa-times-circle" style="color:#e74c3c"></i> ${ad.dismiss_count || 0}</span>
                    <div style="flex:1"></div>
                    <button class="btn btn-check" style="font-size:10px;padding:3px 8px" onclick="editPartnerAdById(${ad.id})"><i class="fas fa-edit"></i></button>
                    <button class="btn" style="font-size:10px;padding:3px 8px" onclick="togglePartnerAdStatus(${ad.id}, ${ad.is_active ? 1 : 0})">${ad.is_active ? 'ปิด' : 'เปิด'}</button>
                    <button class="btn btn-del" style="font-size:10px;padding:3px 8px" onclick="deletePartnerAdById(${ad.id})"><i class="fas fa-trash"></i></button>
                    ${pushBtn}
                </div>
            </div>`;
        }).join('');
    } catch (e) {
        el.innerHTML = `<div style="color:#e74c3c;font-size:12px">โหลดไม่ได้: ${e.message}</div>`;
    }
}

let _partnerAdsCache = [];

async function editPartnerAdById(id) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/ads/admin/all`, { headers: getAuthHeaders() });
        _partnerAdsCache = await res.json();
        const ad = _partnerAdsCache.find(a => a.id === id);
        if (!ad) return;
        document.getElementById('p-ad-edit-id').value = id;
        document.getElementById('p-ad-format').value  = ad.ad_format || 'popup';
        document.getElementById('p-ad-title').value   = ad.title     || '';
        document.getElementById('p-ad-body').value    = ad.body      || '';
        document.getElementById('p-ad-cta').value     = ad.cta_text  || 'ดูเพิ่มเติม';
        document.getElementById('p-ad-delay').value   = ad.display_delay_seconds || 0;
        document.getElementById('p-ad-start').value   = ad.start_date ? ad.start_date.substring(0, 10) : '';
        document.getElementById('p-ad-end').value     = ad.end_date   ? ad.end_date.substring(0, 10)   : '';
        togglePartnerAdDelayField();
        document.getElementById('p-ad-title').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        updateAdPreview();
    } catch (e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
}

async function togglePartnerAdStatus(id, currentActive) {
    const partnerId = window._selectedPartnerId;
    try {
        await fetch(`${API_BASE_URL}/api/ads/${id}`, {
            method:  'PUT',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body:    JSON.stringify({ is_active: currentActive ? 0 : 1 }),
        });
        loadPartnerAds(partnerId);
    } catch (e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
}

async function deletePartnerAdById(id) {
    if (!confirm('ยืนยันลบโฆษณานี้?')) return;
    const partnerId = window._selectedPartnerId;
    try {
        await fetch(`${API_BASE_URL}/api/ads/${id}`, {
            method: 'DELETE', headers: getAuthHeaders(),
        });
        loadPartnerAds(partnerId);
    } catch (e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
}

async function sendPartnerAdPush(adId, btn) {
    if (!confirm('ส่ง Push Notification ไปยังผู้ใช้ทุกคนที่ติดตั้งแอปแล้วหรือไม่?')) return;
    const orig = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    try {
        const res  = await fetch(`${API_BASE_URL}/api/ads/push`, {
            method:  'POST',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body:    JSON.stringify({ ad_id: adId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || res.statusText);
        alert(`ส่ง Push สำเร็จ ✓\nส่งถึง ${data.sent} / ${data.total_devices} อุปกรณ์`);
    } catch (e) {
        alert('เกิดข้อผิดพลาด: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = orig; }
    }
}

function renderPoints(rows) {
    const tbody = document.getElementById('points-table');
    if (!tbody) return;

    if (!rows || rows.length === 0) {
        setEmptyRow('points-table', 7, 'ยังไม่มีข้อมูลแต้ม');
        return;
    }

    // Store full data for filtering/sorting
    window.pointsFullData = rows;
    updatePointsTable(rows);

    // Bind search, filter, sort handlers
    bindPointsFilters();
}

function updatePointsTable(rows) {
    const tbody = document.getElementById('points-table');
    if (!tbody) return;

    tbody.innerHTML = rows.map((row, index) => {
        const rank = index + 1;
        const rankBadge = rank === 1 ? '<i class="fas fa-crown" style="color: gold;"></i>' : rank === 2 ? '<i class="fas fa-medal" style="color: silver;"></i>' : rank === 3 ? '<i class="fas fa-medal" style="color: #cd7f32;"></i>' : `#${rank}`;
        const statusBadge = row.isBlocked
            ? '<span class="badge bg-urgent"><i class="fas fa-ban" style="margin-right:4px;font-size:0.7rem;"></i>Blocked</span>'
            : '<span class="badge bg-success"><i class="fas fa-check-circle" style="margin-right:4px;font-size:0.7rem;"></i>Active</span>';
        
        return `
            <tr style="${rank <= 3 ? 'background: rgba(255,215,0,0.1); font-weight: bold;' : ''}">
                <td style="font-size:1.2rem;">${rankBadge}</td>
                <td>${escapeHtml(row.name)}</td>
                <td>${escapeHtml(row.phone)}</td>
                <td><b>${formatNumber(row.totalPoints)}</b></td>
                <td>${formatNumber(row.streak)} วัน</td>
                <td>${statusBadge}</td>
                <td>
                    <div style="display:flex;align-items:center;justify-content:center;gap:5px;">
                        <button class="pts-action-btn pts-btn-edit" onclick="editUserPoints(${row.userId})" title="แก้ไขแต้ม">
                            <i class="fas fa-pen"></i><span>แก้ไข</span>
                        </button>
                        <button class="pts-action-btn pts-btn-hist" onclick="viewPointsHistory(${row.userId})" title="ดูประวัติแต้ม">
                            <i class="fas fa-clock-rotate-left"></i><span>ประวัติ</span>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function initCustomDropdown() {
    const trigger = document.getElementById('points-sort-trigger');
    const menu = document.querySelector('#points-sort-dropdown .custom-dropdown-menu');
    const items = document.querySelectorAll('#points-sort-dropdown .custom-dropdown-item');
    const sortInput = document.getElementById('points-sort');
    const sortLabel = document.getElementById('points-sort-label');
    const iconMap = {
        'points': 'fa-chart-line',
        'streak': 'fa-fire',
        'name': 'fa-font'
    };
    const labelMap = {
        'points': 'แต้มสูงสุด',
        'streak': 'Streak สูงสุด',
        'name': 'ชื่อ (A-Z)'
    };

    if (!trigger || !menu) return;

    // Toggle dropdown on trigger click
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = menu.style.display !== 'none';
        menu.style.display = isOpen ? 'none' : 'block';
    });

    // Handle item selection
    items.forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const value = item.dataset.value;
            sortInput.value = value;
            sortLabel.textContent = labelMap[value];
            
            // Update trigger icon
            const icon = trigger.querySelector('i');
            if (icon) {
                icon.className = `fas ${iconMap[value]}`;
            }
            
            menu.style.display = 'none';
            
            // Trigger filter update
            const filterSelect = document.getElementById('points-filter');
            if (filterSelect) {
                filterSelect.dispatchEvent(new Event('change'));
            }
        });
    });

    // Close dropdown on click outside
    document.addEventListener('click', (e) => {
        if (!document.getElementById('points-sort-dropdown').contains(e.target)) {
            menu.style.display = 'none';
        }
    });
}

function bindPointsFilters() {
    const searchInput = document.getElementById('points-search');
    const filterSelect = document.getElementById('points-filter');
    const sortInput = document.getElementById('points-sort');

    const applyFilters = () => {
        let filtered = window.pointsFullData || [];
        
        // Search filter
        if (searchInput?.value) {
            const query = searchInput.value.toLowerCase();
            filtered = filtered.filter(row => 
                row.name.toLowerCase().includes(query) || 
                row.phone.toLowerCase().includes(query)
            );
        }
        
        // Status filter
        if (filterSelect?.value) {
            filtered = filtered.filter(row => 
                filterSelect.value === 'active' ? !row.isBlocked : row.isBlocked
            );
        }
        
        // Sorting
        if (sortInput?.value === 'streak') {
            filtered.sort((a, b) => b.streak - a.streak);
        } else if (sortInput?.value === 'name') {
            filtered.sort((a, b) => a.name.localeCompare(b.name, 'th'));
        }
        // Default: points (already sorted from backend)
        
        updatePointsTable(filtered);
    };

    searchInput?.addEventListener('input', applyFilters);
    filterSelect?.addEventListener('change', applyFilters);
    
    // Initialize custom dropdown
    initCustomDropdown();
}

function editUserPoints(userId) {
    const user = window.pointsFullData?.find(u => u.userId === userId);
    if (!user) return;
    
    const newPoints = prompt(
        `แก้ไขแต้มของ ${user.name}\nเบอร์โทร: ${user.phone}\n\nแต้มปัจจุบัน: ${user.totalPoints}`,
        user.totalPoints
    );
    
    if (newPoints !== null && newPoints !== '') {
        const pointsValue = parseInt(newPoints, 10);
        if (!isNaN(pointsValue) && pointsValue >= 0) {
            updateUserPoints(userId, pointsValue);
        } else {
            alert('กรุณากรอกจำนวนแต้มที่ถูกต้อง');
        }
    }
}

async function updateUserPoints(userId, newPoints) {
    try {
        // Call backend API to update points
        const response = await fetch(`${API_BASE_URL}/api/admin/update-user-points`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getStoredToken()}`
            },
            body: JSON.stringify({ userId, totalPoints: newPoints })
        });
        
        const responseData = await response.json();
        
        if (response.ok) {
            alert(`อัปเดตแต้มสำเร็จ\nเก่า: ${responseData.data.oldPoints} \u2192 ใหม่: ${responseData.data.newPoints}`);
            // Reload dashboard to see updated data with correct status
            await loadDashboardSummary();
        } else {
            alert('ไม่สามารถอัปเดตแต้มได้: ' + (responseData.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error updating points:', error);
        alert('เกิดข้อผิดพลาด: ' + error.message);
    }
}

function viewPointsHistory(userId) {
    const user = window.pointsFullData?.find(u => u.userId === userId);
    if (!user) return;
    
    // Show modal
    const modal = document.getElementById('points-history-modal');
    if (modal) modal.classList.remove('hidden');
    
    // Load points history data
    loadPointsHistory(userId, user.name);
}

async function loadPointsHistory(userId, userName) {
    const historyList = document.getElementById('points-history-list');
    if (!historyList) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/user/${userId}/points-history`, {
            headers: {
                ...getAuthHeaders()
            }
        });
        
        if (!response.ok) throw new Error('Failed to load history');
        
        const data = await response.json();
        const history = data.data || [];
        
        if (history.length === 0) {
            historyList.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                    <i class="fas fa-inbox" style="font-size: 2rem;"></i>
                    <p style="margin-top: 1rem;">ไม่มีประวัติแต้ม</p>
                </div>
            `;
            return;
        }
        
        historyList.innerHTML = `
            <div style="margin-bottom: 1rem;">
                <div style="padding: 0.75rem; background: rgba(74,108,247,0.1); border-left: 3px solid var(--blue); border-radius: 4px; margin-bottom: 1rem;">
                    <strong>${escapeHtml(userName)}</strong> - ประวัติการเปลี่ยนแต้ม
                </div>
            </div>
            ${history.map((item) => {
                const isAdd = item.type === 'add';
                const sign = isAdd ? '+' : '-';
                const color = isAdd ? 'var(--green)' : 'var(--red)';
                const borderColor = isAdd ? 'var(--green)' : 'var(--red)';
                const icon = isAdd ? 'fa-plus' : 'fa-minus';
                const label = item.sourceType === 'admin' ? 'ผู้ดูแล' : escapeHtml(item.sourceType);
                return `
                <div style="padding: 0.75rem 0.75rem 0.75rem 1rem; border-left: 2px solid ${borderColor}; margin-bottom: 0.75rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                        <strong style="color: var(--text-primary);">
                            <i class="fas ${icon}" style="color: ${color};"></i>
                            ${label}
                        </strong>
                        <span style="color: ${color}; font-weight: bold;">
                            ${sign}${Math.abs(item.points).toLocaleString()}
                        </span>
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary);">
                        <i class="fas fa-calendar-alt"></i> ${new Date(item.created_at).toLocaleDateString('th-TH')}
                        <span style="margin-left: 1rem;"><i class="fas fa-clock"></i> ${new Date(item.created_at).toLocaleTimeString('th-TH')}</span>
                    </div>
                </div>`;
            }).join('')}
        `;
    } catch (error) {
        console.error('Error loading points history:', error);
        historyList.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--red);">
                <i class="fas fa-exclamation-triangle" style="font-size: 1.5rem;"></i>
                <p style="margin-top: 1rem;">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>
            </div>
        `;
    }
}

function closePointsHistoryModal() {
    const modal = document.getElementById('points-history-modal');
    if (modal) modal.classList.add('hidden');
}


function renderSecurity(security) {
    const otpRequestToday = document.getElementById('otp-request-today');
    const otpFailedToday = document.getElementById('otp-failed-today');
    const loginSuccessToday = document.getElementById('login-success-today');
    const loginFailedToday = document.getElementById('login-failed-today');
    const otpSuccessRate = document.getElementById('otp-success-rate');

    currentSecurityState = {
        ...currentSecurityState,
        logs: Array.isArray(security.logs) ? security.logs : [],
        alerts: Array.isArray(security.alerts) ? security.alerts : [],
        metrics: {
            otpRequestToday: Number(security.otpRequestToday || 0),
            otpFailedToday: Number(security.otpFailedToday || 0),
            loginSuccessToday: Number(security.loginSuccessToday || 0),
            loginFailedToday: Number(security.loginFailedToday || 0),
            otpSuccessRate: Number(security.otpSuccessRate || 0)
        }
    };

    if (otpRequestToday) otpRequestToday.textContent = formatNumber(currentSecurityState.metrics.otpRequestToday);
    if (otpFailedToday) otpFailedToday.textContent = formatNumber(currentSecurityState.metrics.otpFailedToday);
    if (loginSuccessToday) loginSuccessToday.textContent = formatNumber(currentSecurityState.metrics.loginSuccessToday);
    if (loginFailedToday) loginFailedToday.textContent = formatNumber(currentSecurityState.metrics.loginFailedToday);
    if (otpSuccessRate) otpSuccessRate.textContent = `${formatNumber(currentSecurityState.metrics.otpSuccessRate)}%`;

    bindSecurityFilters();
    updateSecurityFilterButtons();
    renderSecurityAlerts(currentSecurityState.alerts);

    const tbody = document.getElementById('security-table');
    if (!tbody) return;

    const filteredLogs = filterSecurityLogs(currentSecurityState.logs);
    renderSecurityLogsTable(filteredLogs);
}

function initChart(labels, usersSeries) {
    const ctx = document.getElementById('activityChart').getContext('2d');
    
    const userMetricLabel = getUserMetricLabel(currentActivityView);
    const xAxisTitle = getXAxisTitle(currentActivityView);
    const yAxisTitle = getYAxisTitle();

    activityChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: userMetricLabel,
                    data: usersSeries,
                    borderColor: '#1cc88a',
                    tension: 0.3,
                    fill: true,
                    backgroundColor: 'rgba(28, 200, 138, 0.08)'
                }
            ]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: true, position: 'bottom' } },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: xAxisTitle
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        precision: 0,
                        callback: (value) => Number.isInteger(value) ? value : ''
                    },
                    title: {
                        display: true,
                        text: yAxisTitle
                    }
                }
            }
        }
    });
}

function updateChart(activity) {
    let defaultLabels = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];
    let expectedLength = 7;
    if (currentActivityView === 'today') {
        defaultLabels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
        expectedLength = 24;
    } else if (currentActivityView === 'month') {
        expectedLength = (activity.labels && activity.labels.length) ? activity.labels.length : 31;
        defaultLabels = Array.from({ length: expectedLength }, (_, i) => String(i + 1));
    }

    // Use activity labels if available, otherwise use defaults
    let labels = activity.labels || defaultLabels;
    
    // For week view, prioritize activity labels if they match expected length
    if (currentActivityView === 'week' && activity.labels && activity.labels.length === 7) {
        labels = activity.labels;
    }
    
    // For daily view, always ensure 24 hours
    if (currentActivityView === 'today') {
        labels = activity.labels || defaultLabels;
        if (!Array.isArray(labels) || labels.length !== 24) {
            labels = defaultLabels;
        }
    }
    
    const sourceSeries = activity.usersSeries || activity.activeUsersSeries || [];
    const usersSeries = Array.from({ length: expectedLength }, (_, i) => Number(sourceSeries[i] || 0));

    if (!activityChart) {
        initChart(labels, usersSeries);
        return;
    }

    activityChart.data.labels = labels;
    activityChart.data.datasets[0].data = usersSeries;
    if (activityChart.options?.scales?.x?.title) {
        activityChart.options.scales.x.title.display = true;
        activityChart.options.scales.x.title.text = getXAxisTitle(currentActivityView);
    }
    if (activityChart.options?.scales?.y?.title) {
        activityChart.options.scales.y.title.display = true;
        activityChart.options.scales.y.title.text = getYAxisTitle();
    }
    activityChart.update();
}

function switchActivityView(view) {
    // Update active button
    const todayBtn = document.getElementById('today-btn');
    const weekBtn = document.getElementById('week-btn');
    const monthBtn = document.getElementById('month-btn');
    const todaySelector = document.getElementById('today-date-selector');
    const weekSelector = document.getElementById('week-start-selector');
    const monthSelector = document.getElementById('month-selector');
    
    if (view === 'today') {
        if (todayBtn) todayBtn.classList.add('active');
        if (weekBtn) weekBtn.classList.remove('active');
        if (monthBtn) monthBtn.classList.remove('active');
        if (todaySelector) todaySelector.style.display = 'block';
        if (weekSelector) weekSelector.style.display = 'none';
        if (monthSelector) monthSelector.style.display = 'none';
        currentActivityView = 'today';
        // Set today selector to current date if not set
        if (!selectedDateForToday) {
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            selectedDateForToday = `${year}-${month}-${day}`;
            if (todaySelector) todaySelector.value = selectedDateForToday;
        }
        if (fullDashboardActivity && fullDashboardActivity.today) {
            updateChart(fullDashboardActivity.today);
        }
    } else if (view === 'week') {
        if (todayBtn) todayBtn.classList.remove('active');
        if (weekBtn) weekBtn.classList.add('active');
        if (monthBtn) monthBtn.classList.remove('active');
        if (todaySelector) todaySelector.style.display = 'none';
        if (weekSelector) weekSelector.style.display = 'block';
        if (monthSelector) monthSelector.style.display = 'none';
        currentActivityView = 'week';
        // Set week selector to current week's Monday if not set
        if (!selectedWeekStart) {
            const today = new Date();
            const day = today.getDay();
            const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
            const monday = new Date(today.setDate(diff));
            const year = monday.getFullYear();
            const month = String(monday.getMonth() + 1).padStart(2, '0');
            const dateStr = String(monday.getDate()).padStart(2, '0');
            selectedWeekStart = `${year}-${month}-${dateStr}`;
            if (weekSelector) weekSelector.value = selectedWeekStart;
        }
        if (fullDashboardActivity && fullDashboardActivity.week) {
            updateChart(fullDashboardActivity.week);
        }
    } else if (view === 'month') {
        if (todayBtn) todayBtn.classList.remove('active');
        if (weekBtn) weekBtn.classList.remove('active');
        if (monthBtn) monthBtn.classList.add('active');
        if (todaySelector) todaySelector.style.display = 'none';
        if (weekSelector) weekSelector.style.display = 'none';
        if (monthSelector) monthSelector.style.display = 'block';
        // Set month selector to current month if not set
        if (!selectedMonthForActivity) {
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            selectedMonthForActivity = `${year}-${month}`;
            if (monthSelector) monthSelector.value = selectedMonthForActivity;
        }
        currentActivityView = 'month';
        if (fullDashboardActivity && fullDashboardActivity.month) {
            updateChart(fullDashboardActivity.month);
        }
    }
    
    // Update chart dataset labels
    if (activityChart && activityChart.data.datasets.length > 0) {
        const userMetricLabel = getUserMetricLabel(currentActivityView);
        activityChart.data.datasets[0].label = userMetricLabel;
        if (activityChart.options?.scales?.x?.title) {
            activityChart.options.scales.x.title.text = getXAxisTitle(currentActivityView);
        }
        if (activityChart.options?.scales?.y?.title) {
            activityChart.options.scales.y.title.text = getYAxisTitle();
        }
        activityChart.update();
    }
}

async function switchActivityMonth(monthValue) {
    selectedMonthForActivity = monthValue;
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/dashboard-summary?mauMonth=${encodeURIComponent(monthValue)}`, {
            headers: getAuthHeaders()
        });
        const data = await res.json();
        if (!fullDashboardActivity) fullDashboardActivity = {};
        fullDashboardActivity.month = {
            labels: (data.activityMonthly && data.activityMonthly.labels) || [],
            usersSeries: (data.activityMonthly && data.activityMonthly.usersSeries) || []
        };
    } catch (e) {
        console.error('Failed to fetch activity for month:', e);
        if (!fullDashboardActivity) fullDashboardActivity = {};
        if (!fullDashboardActivity.month) fullDashboardActivity.month = { labels: [], usersSeries: [] };
    }
    updateChart(fullDashboardActivity.month);
}

async function switchActivityDate(dateValue) {
    selectedDateForToday = dateValue;
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/dashboard-summary?dauDate=${encodeURIComponent(dateValue)}`, {
            headers: getAuthHeaders()
        });
        const data = await res.json();
        if (!fullDashboardActivity) fullDashboardActivity = {};
        fullDashboardActivity.today = {
            labels: (data.activity && data.activity.labels) || Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`),
            usersSeries: (data.activity && data.activity.usersSeries) || Array(24).fill(0)
        };
    } catch (e) {
        console.error('Failed to fetch activity for date:', e);
        if (!fullDashboardActivity) fullDashboardActivity = {};
        if (!fullDashboardActivity.today) fullDashboardActivity.today = { labels: [], usersSeries: [] };
    }
    updateChart(fullDashboardActivity.today);
}

async function switchActivityWeek(weekStartValue) {
    selectedWeekStart = weekStartValue;
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/dashboard-summary?wauStart=${encodeURIComponent(weekStartValue)}`, {
            headers: getAuthHeaders()
        });
        const data = await res.json();
        if (!fullDashboardActivity) fullDashboardActivity = {};
        fullDashboardActivity.week = {
            labels: (data.activityWeekly && data.activityWeekly.labels) || ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'],
            usersSeries: (data.activityWeekly && data.activityWeekly.usersSeries) || Array(7).fill(0)
        };
    } catch (e) {
        console.error('Failed to fetch activity for week:', e);
        if (!fullDashboardActivity) fullDashboardActivity = {};
        if (!fullDashboardActivity.week) fullDashboardActivity.week = { labels: ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'], usersSeries: [] };
    }
    updateChart(fullDashboardActivity.week);
}

function renderAds(_rows) {
    // ads section not included in dashboard payload — no-op
}

async function loadDashboardSummary() {
    try {
        let response = await fetch(`${API_BASE_URL}/api/admin/dashboard-data`, {
            headers: {
                ...getAuthHeaders()
            }
        });

        if (response.status === 404) {
            response = await fetch(`${API_BASE_URL}/api/admin/dashboard-summary`, {
                headers: {
                    ...getAuthHeaders()
                }
            });
        }

        if (response.status === 401 || response.status === 403) {
            clearAuthSession();
            showLogin('Session หมดอายุหรือไม่มีสิทธิ์ admin');
            return;
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        dashboardPayload = data;

        // Store real activity data from API response
        fullDashboardActivity = {
            today: {
                labels: (data.activity && data.activity.labels) || Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`),
                usersSeries: (data.activity && data.activity.usersSeries) || Array(24).fill(0)
            },
            week: {
                labels: (data.activityWeekly && data.activityWeekly.labels) || ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'],
                usersSeries: (data.activityWeekly && data.activityWeekly.usersSeries) || Array(7).fill(0)
            },
            month: {
                labels: (data.activityMonthly && data.activityMonthly.labels) || [],
                usersSeries: (data.activityMonthly && data.activityMonthly.usersSeries) || []
            }
        };

        updateStats(data.summary || {});
        if (currentActivityView === 'month') {
            updateChart(fullDashboardActivity.month || {});
        } else if (currentActivityView === 'week') {
            updateChart(fullDashboardActivity.week || {});
        } else {
            updateChart(fullDashboardActivity.today || {});
        }
        updateHomeSecurity(data.sections?.security || {}, data.summary || {});

        console.log('🎯 Dashboard data received:', data);
        console.log('📨 Trending posts from API:', data.sections?.trendingPosts);
        renderTrendingPosts(data.sections?.trendingPosts || []);
        renderActivityFeed(data.sections?.contentMonitor || []);
        renderContentMonitor(data.sections?.contentMonitor || []);
        renderReports(data.sections?.reports || []);
        companySourceRows = Array.isArray(data.sections?.companies) ? data.sections.companies : [];
        applyCompanyFilters();
        renderAds(data.sections?.ads || []);
        renderPoints(data.sections?.points || []);
        renderSecurity(data.sections?.security || {});

        updateStatus(true);
    } catch (error) {
        console.error('Failed to load dashboard summary:', error);
        updateStatus(false);
        const loginError = document.getElementById('login-error');
        if (loginError && loginError.textContent.trim() === '') {
            loginError.textContent = 'โหลดข้อมูล dashboard ไม่สำเร็จ กรุณาตรวจสอบ API base URL และ backend';
        }
        updateChart({});

        setEmptyRow('trending-table', 5, 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ');
        setEmptyRow('content-monitor-table', 7, 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ');
        setEmptyRow('report-table', 6, 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ');
        setEmptyRow('company-table', 5, 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ');
        setEmptyRow('points-table', 4, 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ');
        setEmptyRow('security-table', 3, 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ');
    }
}

window.navTo = navTo;
window.switchActivityView = switchActivityView;
window.loadPartnerAds = loadPartnerAds;
window.loadPartnerBanners = loadPartnerBanners;
window.submitPartnerBannerForm = submitPartnerBannerForm;
window.resetPartnerBannerForm = resetPartnerBannerForm;
window.editPartnerBanner = editPartnerBanner;
window.togglePartnerBannerActive = togglePartnerBannerActive;
window.deletePartnerBanner = deletePartnerBanner;
window.editAnnouncement = editAnnouncement;
window.resetAnnouncementForm = resetAnnouncementForm;
window.submitAnnouncementForm = submitAnnouncementForm;
window.editService = editService;
window.resetServiceForm = resetServiceForm;
window.submitServiceForm = submitServiceForm;
window.editJob = editJob;
window.resetJobForm = resetJobForm;
window.submitJobForm = submitJobForm;
window.toggleJobActive = toggleJobActive;
window.editProject = editProject;
window.resetProjectForm = resetProjectForm;
window.submitProjectForm = submitProjectForm;
window.togglePartnerAdDelayField = togglePartnerAdDelayField;
window.resetPartnerAdForm = resetPartnerAdForm;
window.submitPartnerAdForm = submitPartnerAdForm;
window.editPartnerAdById = editPartnerAdById;
window.togglePartnerAdStatus = togglePartnerAdStatus;
window.deletePartnerAdById = deletePartnerAdById;
window.sendPartnerAdPush = sendPartnerAdPush;

document.addEventListener('DOMContentLoaded', async () => {
    const loginForm = document.getElementById('admin-login-form');
    const logoutBtn = document.getElementById('logout-btn');
    const requestOtpBtn = document.getElementById('request-otp-btn');
    const adminPhoneInput = document.getElementById('admin-phone');
    if (adminPhoneInput) {
        adminPhoneInput.addEventListener('input', () => {
            adminPhoneInput.value = adminPhoneInput.value.replace(/\D/g, '').slice(0, 10);
        });
    }
    const adminOtpInput = document.getElementById('admin-otp');
    if (adminOtpInput) {
        adminOtpInput.addEventListener('input', () => {
            adminOtpInput.value = adminOtpInput.value.replace(/\D/g, '').slice(0, 6);
        });
    }
    const adsTable = document.getElementById('ads-table');
    const statsGrid = document.querySelector('.stats-grid');
    const companyTable = document.getElementById('company-table');
    const companySearch = document.getElementById('company-search');
    const companySearchBtn = document.getElementById('company-search-btn');
    const companySearchClearBtn = document.getElementById('company-search-clear-btn');
    const contentMonitorTable = document.getElementById('content-monitor-table');
    const contentMonitorSearch = document.getElementById('content-monitor-search');
    const reportTable = document.getElementById('report-table');
    const trendingTable = document.getElementById('trending-table');
    const postDetailModal = document.getElementById('post-detail-modal');
    const postDetailClose = document.getElementById('post-detail-close');
    const userDetailModal = document.getElementById('user-detail-modal');
    const userDetailClose = document.getElementById('user-detail-close');
    const actionDialogModal = document.getElementById('action-dialog-modal');
    const actionDialogClose = document.getElementById('action-dialog-close');
    const actionDialogCancel = document.getElementById('action-dialog-cancel');
    const actionDialogConfirm = document.getElementById('action-dialog-confirm');
    if (loginForm) loginForm.addEventListener('submit', handleAdminLogin);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if (requestOtpBtn) requestOtpBtn.addEventListener('click', handleRequestAdminOtp);
    if (postDetailClose) postDetailClose.addEventListener('click', closePostDetailModal);
    if (userDetailClose) userDetailClose.addEventListener('click', closeUserDetailModal);
    if (actionDialogClose) actionDialogClose.addEventListener('click', () => closeActionDialog(false));
    if (actionDialogCancel) actionDialogCancel.addEventListener('click', () => closeActionDialog(false));
    if (actionDialogConfirm) actionDialogConfirm.addEventListener('click', () => closeActionDialog(true));
    // QR Detail Modal handlers
    const qrDetailModal = document.getElementById('qr-detail-modal');
    const qrDetailClose = document.getElementById('qr-detail-close');
    if (qrDetailClose) qrDetailClose.addEventListener('click', closeQRDetailModal);
    if (qrDetailModal) {
        qrDetailModal.addEventListener('click', (event) => {
            if (event.target === qrDetailModal) closeQRDetailModal();
        });
    }

    if (statsGrid) {
        statsGrid.addEventListener('click', (event) => {
            const card = event.target.closest('.stat-card.clickable[data-nav-page]');
            if (!card) return;
            const page = card.getAttribute('data-nav-page');
            if (!page) return;
            const navItem = findNavItemByPage(page);
            navTo(page, navItem);
        });
    }

    if (adsTable) {
        adsTable.addEventListener('click', (event) => {
            const button = event.target.closest('[data-ad-action]');
            if (!button) return;
            const row = button.closest('tr[data-ad-id]');
            if (!row) return;
            const action = button.getAttribute('data-ad-action');
            const adId = row.getAttribute('data-ad-id');
            handleAdTableAction(action, adId);
        });
    }

    if (companyTable) {
        companyTable.addEventListener('click', async (event) => {
            const button = event.target.closest('[data-company-action]');
            if (!button) return;

            const rowElement = button.closest('tr[data-company-index]');
            if (!rowElement) return;

            const index = Number(rowElement.getAttribute('data-company-index'));
            const row = getCompanyRowByIndex(index);
            const action = button.getAttribute('data-company-action');

            button.disabled = true;
            try {
                await handleCompanyAction(action, row);
            } catch (error) {
                await showActionDialogInfo(error.message || 'ไม่สามารถจัดการบัญชีผู้ใช้งานได้', 'เกิดข้อผิดพลาด');
            } finally {
                button.disabled = false;
            }
        });
    }

    if (companySearch) {
        companySearch.addEventListener('input', () => {
            currentCompanySearchQuery = (companySearch.value || '').trim();
            applyCompanyFilters();
        });
    }

    if (companySearchBtn) {
        companySearchBtn.addEventListener('click', () => {
            currentCompanySearchQuery = (companySearch?.value || '').trim();
            applyCompanyFilters();
        });
    }

    if (companySearchClearBtn) {
        companySearchClearBtn.addEventListener('click', () => {
            if (companySearch) companySearch.value = '';
            currentCompanySearchQuery = '';
            applyCompanyFilters();
            companySearch?.focus();
        });
    }

    if (postDetailModal) {
        postDetailModal.addEventListener('click', (event) => {
            if (event.target === postDetailModal) closePostDetailModal();
        });
    }

    if (userDetailModal) {
        userDetailModal.addEventListener('click', (event) => {
            if (event.target === userDetailModal) closeUserDetailModal();
        });
    }

    if (actionDialogModal) {
        actionDialogModal.addEventListener('click', (event) => {
            if (event.target === actionDialogModal) closeActionDialog(false);
        });
    }

    if (contentMonitorTable) {
        contentMonitorTable.addEventListener('click', async (event) => {
            const button = event.target.closest('[data-view-post]');
            if (button) {
                const postId = Number(button.getAttribute('data-view-post'));
                if (Number.isFinite(postId) && postId > 0) {
                    openPostDetailModal(postId);
                }
                return;
            }

            const actionBtn = event.target.closest('[data-post-action]');
            if (actionBtn) {
                const action = actionBtn.getAttribute('data-post-action');
                const postId = Number(actionBtn.getAttribute('data-post-id'));
                if (!Number.isFinite(postId) || postId <= 0 || !action) return;

                if (action === 'focus-report') {
                    currentReportFilter = 'pending';
                    updateModerationFilterButtons();
                    const navItem = findNavItemByPage('reports');
                    navTo('reports', navItem);
                    return;
                }

                actionBtn.disabled = true;
                try {
                    await runPostModerationAction(postId, action, 'content_monitor');
                } catch (error) {
                    await showActionDialogInfo(error.message || 'ดำเนินการไม่สำเร็จ', 'เกิดข้อผิดพลาด');
                } finally {
                    actionBtn.disabled = false;
                }
                return;
            }

            const userBtn = event.target.closest('[data-open-user-post]');
            if (userBtn) {
                const postId = Number(userBtn.getAttribute('data-open-user-post'));
                if (Number.isFinite(postId) && postId > 0) {
                    openUserDetailByPostId(postId, 'Content Monitor');
                }
                return;
            }
        });
    }

    if (contentMonitorSearch) {
        contentMonitorSearch.addEventListener('input', () => {
            currentContentSearchQuery = (contentMonitorSearch.value || '').trim();
            renderContentMonitor(contentMonitorSourceRows);
        });
    }

    if (reportTable) {
        reportTable.addEventListener('click', async (event) => {
            const detailBtn = event.target.closest('[data-view-post]');
            if (detailBtn) {
                const postId = Number(detailBtn.getAttribute('data-view-post'));
                if (Number.isFinite(postId) && postId > 0) {
                    openPostDetailModal(postId);
                }
                return;
            }

            const actionBtn = event.target.closest('[data-post-action]');
            if (actionBtn) {
                const action = actionBtn.getAttribute('data-post-action');
                const postId = Number(actionBtn.getAttribute('data-post-id'));
                const source = actionBtn.getAttribute('data-action-source') || 'report_queue';
                if (!Number.isFinite(postId) || postId <= 0 || !action) return;

                actionBtn.disabled = true;
                try {
                    await runPostModerationAction(postId, action, source);
                } catch (error) {
                    await showActionDialogInfo(error.message || 'ดำเนินการไม่สำเร็จ', 'เกิดข้อผิดพลาด');
                } finally {
                    actionBtn.disabled = false;
                }
                return;
            }

            const userBtn = event.target.closest('[data-open-user-post]');
            if (userBtn) {
                const postId = Number(userBtn.getAttribute('data-open-user-post'));
                if (Number.isFinite(postId) && postId > 0) {
                    openUserDetailByPostId(postId, 'Report Queue');
                }
            }
        });
    }

    if (trendingTable) {
        trendingTable.addEventListener('click', (event) => {
            const button = event.target.closest('[data-trending-view-post]');
            if (!button) return;
            const postId = Number(button.getAttribute('data-trending-view-post'));
            if (Number.isFinite(postId) && postId > 0) {
                openPostDetailModal(postId);
            }
        });
    }

    const moveGroupModal = document.getElementById('move-group-modal');
    if (moveGroupModal) {
        moveGroupModal.addEventListener('click', (event) => {
            if (event.target === moveGroupModal) closeMoveGroupModal();
        });
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closePostDetailModal();
            closeUserDetailModal();
            closeActionDialog(false);
            closeMoveGroupModal();
        }
    });

    // Bind reward form close button if exists
    const rewardFormContainer = document.getElementById('reward-form-container');
    if (rewardFormContainer) {
        // Form will be loaded when navigating to reward-catalog page
    }

    // Initialize chart with better mock data
    initChart(
        Array.from({ length: 24 }, (_, i) => `${i}:00`),
        Array.from({ length: 24 }, () => Math.floor(Math.random() * 300) + 50)
    );
    await bootstrapAuth();
});

/**
 * Reward Management Functions
 */

async function showCreateRewardForm() {
    const form = document.getElementById('reward-create-form');
    if (form) {
        form.style.display = 'block';
        // Scroll into view
        form.scrollIntoView({ behavior: 'smooth' });
        await loadRewardCategories();
        updateRewardPreview();
    }
}

function closeCreateRewardForm() {
    const form = document.getElementById('reward-create-form');
    if (form) {
        form.style.display = 'none';
        form.dataset.isEditing = 'false';
        delete form.dataset.rewardId;
        delete form.dataset.imageUrl;
        
        // Reset form title
        const formTitle = document.querySelector('#reward-create-form h4');
        if (formTitle) {
            formTitle.textContent = 'สร้างรางวัลใหม่';
        }
        
        // Reset form - safely handle each field
        const nameField = document.getElementById('reward-name');
        if (nameField) nameField.value = '';
        
        const pointsField = document.getElementById('reward-points');
        if (pointsField) pointsField.value = '';
        
        const categoryField = document.getElementById('reward-category');
        if (categoryField) categoryField.value = '';

        const categoryCustomField = document.getElementById('reward-category-custom');
        if (categoryCustomField) categoryCustomField.value = '';

        const categoryModeBtn = document.getElementById('reward-category-mode-btn');
        if (categoryModeBtn) categoryModeBtn.textContent = 'พิมพ์ใหม่';

        if (categoryField) categoryField.disabled = false;
        if (categoryCustomField) categoryCustomField.style.display = 'none';
        
        const imageField = document.getElementById('reward-image');
        if (imageField) imageField.value = '';
        
        const descriptionField = document.getElementById('reward-description');
        if (descriptionField) descriptionField.value = '';
        
        const stockField = document.getElementById('reward-stock');
        if (stockField) stockField.value = '';
        
        const campaignStartField = document.getElementById('reward-campaign-start');
        if (campaignStartField) campaignStartField.value = '';
        
        const campaignEndField = document.getElementById('reward-campaign-end');
        if (campaignEndField) campaignEndField.value = '';
        
        const userLimitField = document.getElementById('reward-user-limit');
        if (userLimitField) userLimitField.value = '-1';
        
        const activeField = document.getElementById('reward-active');
        if (activeField) activeField.checked = true;
        
        // Hide preview
        const preview = document.getElementById('reward-image-preview');
        if (preview) preview.style.display = 'none';
        updateRewardPreview();
    }
}

function toggleRewardCategoryMode(forceCustom = null) {
    const categorySelect = document.getElementById('reward-category');
    const categoryCustomField = document.getElementById('reward-category-custom');
    const categoryModeBtn = document.getElementById('reward-category-mode-btn');

    if (!categorySelect || !categoryCustomField) return;

    const shouldUseCustom = forceCustom === null
        ? categoryCustomField.style.display === 'none'
        : Boolean(forceCustom);

    if (shouldUseCustom) {
        const selectedValue = categorySelect.value.trim();
        if (selectedValue && selectedValue !== '__custom__' && !categoryCustomField.value) {
            categoryCustomField.value = selectedValue;
        }
        categoryCustomField.style.display = 'block';
        categoryCustomField.focus();
        categorySelect.disabled = true;
        if (categoryModeBtn) categoryModeBtn.textContent = 'ใช้รายการเดิม';
    } else {
        categorySelect.disabled = false;
        categoryCustomField.style.display = 'none';
        if (categoryModeBtn) categoryModeBtn.textContent = 'พิมพ์ใหม่';
    }
}

function getRewardCategoryValue() {
    const categorySelect = document.getElementById('reward-category');
    const categoryCustomField = document.getElementById('reward-category-custom');

    const customValue = categoryCustomField?.value?.trim() || '';
    if (categoryCustomField && categoryCustomField.style.display !== 'none') {
        return customValue;
    }

    const selectValue = categorySelect?.value?.trim() || '';
    return selectValue === '__custom__' ? customValue : selectValue;
}

async function loadRewardCategories(preselectedCategory = '') {
    const categorySelect = document.getElementById('reward-category');
    const categoryCustomField = document.getElementById('reward-category-custom');
    const categoryModeBtn = document.getElementById('reward-category-mode-btn');

    if (!categorySelect) return;

    const currentValue = preselectedCategory || categorySelect.value?.trim() || categoryCustomField?.value?.trim() || '';
    const isCustomMode = categoryCustomField && categoryCustomField.style.display !== 'none';

    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/rewards-categories`, {
            headers: {
                ...getAuthHeaders()
            }
        });

        if (response.status === 401 || response.status === 403) {
            clearAuthSession();
            showLogin('Session หมดอายุหรือไม่มีสิทธิ์');
            return;
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const categories = Array.isArray(data.categories) ? data.categories : [];

        categorySelect.innerHTML = '<option value="">-- เลือกจากหมวดหมู่ที่มีอยู่ --</option>';
        categories.forEach((category) => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categorySelect.appendChild(option);
        });

        const hasCurrentValue = currentValue && categories.includes(currentValue);
        if (hasCurrentValue) {
            categorySelect.value = currentValue;
            if (categoryCustomField) {
                categoryCustomField.value = '';
                if (!isCustomMode) categoryCustomField.style.display = 'none';
            }
            categorySelect.disabled = false;
            if (categoryModeBtn) categoryModeBtn.textContent = 'พิมพ์ใหม่';
        } else if (currentValue) {
            categorySelect.value = '';
            if (categoryCustomField) {
                categoryCustomField.value = currentValue;
                categoryCustomField.style.display = 'block';
            }
            categorySelect.disabled = true;
            if (categoryModeBtn) categoryModeBtn.textContent = 'ใช้รายการเดิม';
        } else if (!isCustomMode) {
            categorySelect.value = '';
            if (categoryCustomField) categoryCustomField.style.display = 'none';
            categorySelect.disabled = false;
            if (categoryModeBtn) categoryModeBtn.textContent = 'พิมพ์ใหม่';
        }
    } catch (error) {
        console.error('Failed to load reward categories:', error);
    }
}

async function saveNewReward() {
    console.log('saveNewReward() called');
    
    try {
        const name = document.getElementById('reward-name')?.value?.trim() || '';
        const pointsRaw = Number(document.getElementById('reward-points')?.value || 0);
        const points = Math.trunc(pointsRaw);
        const category = getRewardCategoryValue();
        const imageInput = document.getElementById('reward-image');
        const imageFile = imageInput?.files[0];
        const description = document.getElementById('reward-description')?.value?.trim() || '';
        const expiry_date = document.getElementById('reward-expiry')?.value || '';
        const is_active = document.getElementById('reward-active')?.checked ?? true;
        const campaign_start_date = document.getElementById('reward-campaign-start')?.value || '';
        const campaign_end_date = document.getElementById('reward-campaign-end')?.value || '';
        const userLimitRaw = (document.getElementById('reward-user-limit')?.value || '').trim();
        const user_limit = userLimitRaw === '' ? -1 : Number(userLimitRaw);
        const usage_instructions = document.getElementById('reward-usage-instructions')?.value?.trim() || '';
        const validityHoursRaw = (document.getElementById('reward-validity-hours')?.value || '1').trim();
        const validity_hours = Number(validityHoursRaw);

        console.log('Form data:', { name, points, category, imageFile, description, is_active, campaign_start_date, campaign_end_date, user_limit, usage_instructions, validity_hours });

        if (!name || name.length < 2 || name.length > 120) {
            alert('ชื่อรางวัลต้องมี 2-120 ตัวอักษร');
            return;
        }

        if (!Number.isFinite(pointsRaw) || !Number.isInteger(pointsRaw) || points < 1) {
            alert('กรุณากรอกชื่อรางวัลและจำนวนแต้มให้ถูกต้อง');
            return;
        }

        if (description.length > 2000) {
            alert('คำอธิบายรางวัลต้องไม่เกิน 2000 ตัวอักษร');
            return;
        }

        if (usage_instructions.length > 2000) {
            alert('วิธีใช้รหัส/เงื่อนไขต้องไม่เกิน 2000 ตัวอักษร');
            return;
        }

        if (!Number.isFinite(validity_hours) || !Number.isInteger(validity_hours) || validity_hours < 1 || validity_hours > 720) {
            alert('ระยะเวลาใช้ได้ต้องเป็นจำนวนเต็ม 1-720 ชั่วโมง');
            return;
        }

        if (!Number.isFinite(user_limit) || !Number.isInteger(user_limit) || user_limit < -1) {
            alert('Limit ต่อผู้ใช้ต้องเป็นจำนวนเต็มตั้งแต่ -1 ขึ้นไป');
            return;
        }

        const campaignRangeError = validateCampaignRange(campaign_start_date, campaign_end_date);
        if (campaignRangeError) {
            alert(campaignRangeError);
            return;
        }

        const imageError = validateImageFile(imageFile, 'รูปภาพรางวัล', 5);
        if (imageError) {
            alert(imageError);
            return;
        }

        const form = document.getElementById('reward-create-form');
        const isEditing = form.dataset.isEditing === 'true';
        const rewardId = form.dataset.rewardId;

        console.log('Editing mode:', isEditing, 'Reward ID:', rewardId);

        if (isEditing && rewardId) {
            await updateReward(rewardId);
            return;
        }
        const partnerId = window._selectedPartnerId;
        if (!partnerId) {
            alert('ไม่พบพาร์ทเนอร์ที่เลือกอยู่ กรุณาเปิดหน้ารายละเอียดพาร์ทเนอร์ก่อนสร้างรางวัล');
            return;
        }

        // Always use FormData for multipart upload (handles both with and without image)
        const formData = new FormData();
        formData.append('reward_name', name);
        formData.append('required_points', points);
        formData.append('category', category || '');
        formData.append('description', description || '');
        formData.append('expiry_date', expiry_date || '');
        formData.append('is_active', is_active ? 1 : 0);
        formData.append('campaign_start_date', campaign_start_date || '');
        formData.append('campaign_end_date', campaign_end_date || '');
        formData.append('user_limit', user_limit);
        formData.append('usage_instructions', usage_instructions || '');
        formData.append('validity_hours', validity_hours);
        formData.append('partner_id', partnerId);

        if (imageFile) {
            formData.append('image', imageFile);
            console.log('Image file attached:', imageFile.name);
        }

        const headers = getAuthHeaders();
        // Don't set Content-Type for FormData, browser will set it automatically
        delete headers['Content-Type'];

        console.log('Sending POST request to:', `${API_BASE_URL}/api/admin/rewards`);

        const response = await fetch(`${API_BASE_URL}/api/admin/rewards`, {
            method: 'POST',
            headers: headers,
            body: formData
        });

        console.log('Response status:', response.status);

        if (response.status === 401 || response.status === 403) {
            clearAuthSession();
            showLogin('Session หมดอายุหรือไม่มีสิทธิ์');
            return;
        }

        if (!response.ok) {
            const error = await response.json();
            console.error('Backend error:', error);
            alert('เกิดข้อผิดพลาด: ' + (error.message || error.error || 'ไม่สามารถบันทึกรางวัลได้'));
            return;
        }

        const result = await response.json();
        console.log('Success response:', result);

        alert('บันทึกรางวัลสำเร็จ');
        closeCreateRewardForm();
        loadRewardsCatalog(partnerId);
    } catch (err) {
        console.error('Save reward error:', err);
        alert('เกิดข้อผิดพลาดในการบันทึก: ' + err.message);
    }
}

async function loadRewardsCatalog(partnerId) {
    const id = partnerId || window._selectedPartnerId;
    const tableBody = document.getElementById('rewards-list-table');
    if (!tableBody) return;

    const renderStateRow = (html, tone = 'var(--text-muted)') => {
        tableBody.innerHTML = `
            <tr class="reward-table-state-row" style="text-align: center; border-top: 1px solid var(--border);">
                <td colspan="10" style="padding: 2rem; color: ${tone}; font-size: 0.95rem;">
                    ${html}
                </td>
            </tr>
        `;
    };

    if (!id) {
        renderStateRow('<div class="reward-table-state">เลือกพาร์ทเนอร์ก่อนเพื่อดูรางวัล</div>');
        return;
    }

    renderStateRow('<div class="reward-table-state"><i class="fas fa-spinner fa-spin"></i> กำลังโหลดข้อมูลแคมเปญ...</div>');

    try {
        console.log('Loading rewards from:', `${API_BASE_URL}/api/admin/rewards?limit=100&partner_id=${id}`);
        const response = await fetch(`${API_BASE_URL}/api/admin/rewards?limit=100&partner_id=${id}`, {
            headers: {
                ...getAuthHeaders()
            }
        });

        console.log('Response status:', response.status);

        if (response.status === 401 || response.status === 403) {
            clearAuthSession();
            showLogin('Session หมดอายุหรือไม่มีสิทธิ์');
            return;
        }

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API error response:', errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        console.log('Rewards data:', data);
        const rewards = data.data || [];
        setTabCount('campaigns', rewards.length);

        if (rewards.length === 0) {
            renderStateRow(`
                <div class="reward-empty-state">
                    <i class="fas fa-gift"></i>
                    <div style="font-weight: 600; color: var(--text-primary);">ยังไม่มีรางวัลในระบบ</div>
                    <div style="font-size: 0.88rem; color: var(--text-secondary);">เริ่มจากการกดเพิ่มรางวัลใหม่เพื่อสร้างแคมเปญแรก</div>
                </div>
            `);
            return;
        }

        tableBody.innerHTML = rewards.map(reward => {
            const rewardImageUrl = reward.image_url ? resolveMediaUrl(reward.image_url) : '';
            return `
            <tr style="border-top: 1px solid var(--border); transition: background 0.15s;" onmouseover="this.style.background='var(--bg-card-alt)'" onmouseout="this.style.background=''">
                <td style="text-align: center; padding: 1rem;">
                    ${rewardImageUrl ? `<img src="${rewardImageUrl}" style="width: 45px; height: 45px; border-radius: 6px; object-fit: cover; border: 1px solid var(--border);">` : '<div style="width: 45px; height: 45px; display: flex; align-items: center; justify-content: center; background: var(--bg-card-alt); border-radius: 6px; border: 1px solid var(--border);"><i class="fas fa-image" style="color: var(--text-muted);"></i></div>'}
                </td>
                <td style="text-align: left; padding: 1rem;">
                    <strong style="color: var(--text-primary); font-weight: 600;">${reward.reward_name}</strong>
                    ${reward.description ? `<br><small style="color: var(--text-secondary); display: block; margin-top: 0.3rem; line-height: 1.4;">${escapeHtmlMultiline(reward.description)}</small>` : ''}
                </td>
                <td style="text-align: center; padding: 1rem; color: var(--text-secondary);">${reward.category ? `<span style="display: inline-block; background: var(--bg-card-alt); padding: 0.35rem 0.7rem; border-radius: 20px; font-size: 0.85rem; border: 1px solid var(--border);">${reward.category}</span>` : '<span style="color: var(--text-muted);">-</span>'}</td>
                <td style="text-align: center; padding: 1rem; font-weight: 600; color: var(--blue);">${reward.required_points}</td>
                <td style="text-align: center; padding: 1rem; color: var(--text-secondary);">${reward.redemption_count || 0}</td>
                <td style="text-align: center; padding: 1rem; color: var(--text-secondary);">${reward.user_limit > 0 ? reward.user_limit : 'Unlimited'}</td>
                <td style="text-align: center; padding: 1rem; font-size: 0.85rem; color: var(--text-secondary);">
                    ${reward.campaign_start_date ? new Date(reward.campaign_start_date).toLocaleDateString('th-TH') : '<span style="color:var(--text-muted);">-</span>'}
                </td>
                <td style="text-align: center; padding: 1rem; font-size: 0.85rem; color: var(--text-secondary);">
                    ${reward.campaign_end_date ? `<span style="padding: 0.3rem 0.6rem; border-radius: 6px; font-size: 0.82rem; ${new Date(reward.campaign_end_date) < new Date() ? 'background: rgba(239,68,68,0.15); color: var(--red);' : 'background: rgba(16,185,129,0.15); color: var(--green);'}">${new Date(reward.campaign_end_date).toLocaleDateString('th-TH')}</span>` : '<span style="color:var(--text-muted);">-</span>'}
                </td>
                <td style="text-align: center; padding: 1rem;">
                    <span style="display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.35rem 0.7rem; border-radius: 6px; font-size: 0.85rem; font-weight: 500; white-space: nowrap; ${reward.is_active ? 'background: rgba(16,185,129,0.15); color: var(--green);' : 'background: rgba(239,68,68,0.15); color: var(--red);'}">
                        ${reward.is_active ? '<i class="fas fa-check-circle"></i> เปิดใช้' : '<i class="fas fa-times-circle"></i> ปิด'}
                    </span>
                </td>
                <td style="padding: 1rem;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; min-width: 160px;">
                        <button class="btn btn-ghost" onclick="editReward(${reward.reward_id})" style="padding: 0.35rem 0.5rem; font-size: 0.8rem; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--text-secondary); cursor: pointer; transition: 0.15s; white-space: nowrap;" onmouseover="this.style.background='var(--bg-card-alt)'; this.style.color='var(--blue)';" onmouseout="this.style.background='transparent'; this.style.color='var(--text-secondary)';">
                            <i class="fas fa-edit"></i> แก้ไข
                        </button>
                        <button class="btn btn-ghost" onclick="goToPartnerPromoCodes(${reward.reward_id}, '${escapeHtml(reward.reward_name || '').replace(/'/g, "\\'")}')" style="padding: 0.35rem 0.5rem; font-size: 0.8rem; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--text-secondary); cursor: pointer; transition: 0.15s; white-space: nowrap;" onmouseover="this.style.background='var(--bg-card-alt)'; this.style.color='var(--blue)';" onmouseout="this.style.background='transparent'; this.style.color='var(--text-secondary)';">
                            <i class="fas fa-ticket-alt"></i> โค้ด
                        </button>
                        <button class="btn btn-ghost" onclick="goToPartnerVerifier(${reward.reward_id})" style="padding: 0.35rem 0.5rem; font-size: 0.8rem; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--text-secondary); cursor: pointer; transition: 0.15s; white-space: nowrap;" onmouseover="this.style.background='var(--bg-card-alt)'; this.style.color='var(--blue)';" onmouseout="this.style.background='transparent'; this.style.color='var(--text-secondary)';">
                            <i class="fas fa-shield-halved"></i> ตรวจ
                        </button>
                        <button class="btn btn-del" onclick="deleteReward(${reward.reward_id})" style="padding: 0.35rem 0.5rem; font-size: 0.8rem; border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; background: rgba(239,68,68,0.1); color: var(--red); cursor: pointer; transition: 0.15s; white-space: nowrap;" onmouseover="this.style.background='rgba(239,68,68,0.2)';" onmouseout="this.style.background='rgba(239,68,68,0.1)';">
                            <i class="fas fa-trash"></i> ลบ
                        </button>
                    </div>
                </td>
            </tr>
        `;
        }).join('');
    } catch (err) {
        console.error('Load rewards error:', err);
        renderStateRow('<div class="reward-empty-state"><i class="fas fa-triangle-exclamation"></i><div style="font-weight: 600; color: var(--red);">เกิดข้อผิดพลาดในการโหลดข้อมูล</div><div style="font-size: 0.88rem; color: var(--text-secondary);">ตรวจสอบการเชื่อมต่อ API หรือรีเฟรชหน้าอีกครั้ง</div></div>', 'var(--red)');
    }
}

async function editReward(rewardId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/rewards/${rewardId}`, {
            headers: {
                ...getAuthHeaders()
            }
        });

        if (response.status === 401 || response.status === 403) {
            clearAuthSession();
            showLogin('Session หมดอายุหรือไม่มีสิทธิ์');
            return;
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        const reward = data.data;

        // Populate form with reward data
        document.getElementById('reward-name').value = reward.reward_name || '';
        document.getElementById('reward-points').value = reward.required_points || '';
        const rewardCategoryField = document.getElementById('reward-category');
        const rewardCategoryCustomField = document.getElementById('reward-category-custom');
        if (rewardCategoryField) rewardCategoryField.value = reward.category || '';
        if (rewardCategoryCustomField) rewardCategoryCustomField.value = reward.category || '';
        document.getElementById('reward-description').value = reward.description || '';
        document.getElementById('reward-usage-instructions').value = reward.usage_instructions || '';
        document.getElementById('reward-validity-hours').value = reward.validity_hours || 1;
        document.getElementById('reward-active').checked = reward.is_active === 1;
        document.getElementById('reward-user-limit').value = reward.user_limit || -1;
        
        // Populate campaign dates if they exist
        const campaignStartField = document.getElementById('reward-campaign-start');
        const campaignEndField = document.getElementById('reward-campaign-end');
        if (campaignStartField && reward.campaign_start_date) {
            campaignStartField.value = reward.campaign_start_date.slice(0, 16);
        }
        if (campaignEndField && reward.campaign_end_date) {
            campaignEndField.value = reward.campaign_end_date.slice(0, 16);
        }

        // Reset image input (user can upload new image)
        const imageInput = document.getElementById('reward-image');
        if (imageInput) {
            imageInput.value = '';
            const preview = document.getElementById('reward-image-preview');
            if (preview) preview.style.display = 'none';
        }

        // Change form title for editing
        const formTitle = document.querySelector('#reward-create-form h4');
        if (formTitle) {
            formTitle.textContent = 'แก้ไขรางวัล';
        }

        // Store reward ID for update in form data attribute
        const form = document.getElementById('reward-create-form');
        form.dataset.rewardId = rewardId;
        form.dataset.isEditing = 'true';
        form.dataset.imageUrl = reward.image_url || '';

        await loadRewardCategories(reward.category || '');
        showCreateRewardForm();
        updateRewardPreview();
    } catch (err) {
        console.error('Load reward detail error:', err);
        alert('เกิดข้อผิดพลาดในการโหลดข้อมูล: ' + err.message);
    }
}

async function updateReward(rewardId) {
    console.log('updateReward() called for ID:', rewardId);
    
    const name = document.getElementById('reward-name')?.value?.trim() || '';
    const pointsRaw = Number(document.getElementById('reward-points')?.value || 0);
    const points = Math.trunc(pointsRaw);
    const category = getRewardCategoryValue();
    const imageInput = document.getElementById('reward-image');
    const imageFile = imageInput?.files[0];
    const description = document.getElementById('reward-description')?.value?.trim() || '';
    const expiry_date = document.getElementById('reward-expiry')?.value || '';
    const is_active = document.getElementById('reward-active')?.checked ?? true;
    const campaign_start_date = document.getElementById('reward-campaign-start')?.value || '';
    const campaign_end_date = document.getElementById('reward-campaign-end')?.value || '';
    const userLimitRaw = (document.getElementById('reward-user-limit')?.value || '').trim();
    const user_limit = userLimitRaw === '' ? -1 : Number(userLimitRaw);
    const usage_instructions = document.getElementById('reward-usage-instructions')?.value?.trim() || '';
    const validityHoursRaw = (document.getElementById('reward-validity-hours')?.value || '1').trim();
    const validity_hours = Number(validityHoursRaw);

    if (!name || name.length < 2 || name.length > 120) {
        alert('ชื่อรางวัลต้องมี 2-120 ตัวอักษร');
        return;
    }

    if (!Number.isFinite(pointsRaw) || !Number.isInteger(pointsRaw) || points < 1) {
        alert('กรุณากรอกจำนวนแต้มเป็นจำนวนเต็มที่มากกว่า 0');
        return;
    }

    if (description.length > 2000) {
        alert('คำอธิบายรางวัลต้องไม่เกิน 2000 ตัวอักษร');
        return;
    }

    if (usage_instructions.length > 2000) {
        alert('วิธีใช้รหัส/เงื่อนไขต้องไม่เกิน 2000 ตัวอักษร');
        return;
    }

    if (!Number.isFinite(validity_hours) || !Number.isInteger(validity_hours) || validity_hours < 1 || validity_hours > 720) {
        alert('ระยะเวลาใช้ได้ต้องเป็นจำนวนเต็ม 1-720 ชั่วโมง');
        return;
    }

    if (!Number.isFinite(user_limit) || !Number.isInteger(user_limit) || user_limit < -1) {
        alert('Limit ต่อผู้ใช้ต้องเป็นจำนวนเต็มตั้งแต่ -1 ขึ้นไป');
        return;
    }

    const campaignRangeError = validateCampaignRange(campaign_start_date, campaign_end_date);
    if (campaignRangeError) {
        alert(campaignRangeError);
        return;
    }

    const imageError = validateImageFile(imageFile, 'รูปภาพรางวัล', 5);
    if (imageError) {
        alert(imageError);
        return;
    }

    try {
        const formData = new FormData();
        formData.append('reward_name', name);
        formData.append('required_points', points);
        formData.append('category', category || '');
        formData.append('description', description || '');
        formData.append('expiry_date', expiry_date || '');
        formData.append('is_active', is_active ? 1 : 0);
        formData.append('campaign_start_date', campaign_start_date || '');
        formData.append('campaign_end_date', campaign_end_date || '');
        formData.append('user_limit', user_limit);
        formData.append('usage_instructions', usage_instructions || '');
        formData.append('validity_hours', validity_hours);

        if (imageFile) {
            formData.append('image', imageFile);
            console.log('Image file attached:', imageFile.name);
        }

        const headers = getAuthHeaders();
        // Don't set Content-Type for FormData, browser will set it automatically
        delete headers['Content-Type'];

        console.log('Sending PUT request to:', `${API_BASE_URL}/api/admin/rewards/${rewardId}`);

        const response = await fetch(`${API_BASE_URL}/api/admin/rewards/${rewardId}`, {
            method: 'PUT',
            headers: headers,
            body: formData
        });

        console.log('Response status:', response.status);

        if (response.status === 401 || response.status === 403) {
            clearAuthSession();
            showLogin('Session หมดอายุหรือไม่มีสิทธิ์');
            return;
        }

        if (!response.ok) {
            const error = await response.json();
            console.error('Backend error:', error);
            alert('เกิดข้อผิดพลาด: ' + (error.message || error.error || 'ไม่สามารถอัปเดตรางวัลได้'));
            return;
        }

        const result = await response.json();
        console.log('Success response:', result);

        alert('อัปเดตรางวัลสำเร็จ');
        closeCreateRewardForm();
        loadRewardsCatalog();
    } catch (err) {
        console.error('Update reward error:', err);
        alert('เกิดข้อผิดพลาดในการอัปเดต: ' + err.message);
    }
}

async function deleteReward(rewardId) {
    if (!confirm('คุณแน่ใจหรือว่าต้องการลบรางวัลนี้?')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/rewards/${rewardId}`, {
            method: 'DELETE',
            headers: {
                ...getAuthHeaders()
            }
        });

        if (response.status === 401 || response.status === 403) {
            clearAuthSession();
            showLogin('Session หมดอายุหรือไม่มีสิทธิ์');
            return;
        }

        if (!response.ok) {
            const error = await response.json();
            alert('เกิดข้อผิดพลาด: ' + (error.message || 'ไม่สามารถลบรางวัลได้'));
            return;
        }

        alert('ลบรางวัลสำเร็จ');
        loadRewardsCatalog();
    } catch (err) {
        console.error('Delete reward error:', err);
        alert('เกิดข้อผิดพลาดในการลบ: ' + err.message);
    }
}

// ========== REWARD IMAGE UPLOAD & PREVIEW ==========
document.addEventListener('DOMContentLoaded', () => {
    const rewardImageInput = document.getElementById('reward-image');
    if (rewardImageInput) {
        rewardImageInput.addEventListener('change', function(event) {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const preview = document.getElementById('reward-image-preview');
                    const previewImg = document.getElementById('reward-image-preview-img');
                    if (preview && previewImg) {
                        previewImg.src = e.target.result;
                        preview.style.display = 'block';
                    }
                };
                reader.readAsDataURL(file);
            }
        });
    }
});

// NOTE: editReward is already defined above, this duplicate is removed

// ========== SHOW REWARD CODES MODAL ==========
async function showRewardCodes(rewardId, rewardName) {
    try {
        // Navigate to Campaigns & Promo Codes page, "อัพโหลดโค้ด" tab
        navToCampaignsTab('codes');
        
        // Wait a bit for page to render
        setTimeout(async () => {
            // Auto-select the reward in the dropdown
            const rewardSelect = document.getElementById('promo-reward-select');
            if (rewardSelect) {
                rewardSelect.value = rewardId;
                rewardSelect.dispatchEvent(new Event('change', { bubbles: true }));
                
                // Load promo codes for this reward
                const response = await fetch(`${API_BASE_URL}/api/admin/promo-codes?reward_id=${rewardId}&limit=99999`, {
                    headers: getAuthHeaders()
                });

                if (!response.ok) throw new Error('ไม่สามารถโหลดโค้ดได้');

                const data = await response.json();
                const codes = data.data || [];

                // Populate promo codes table
                const tableBody = document.getElementById('promo-codes-table');
                if (tableBody) {
                    if (codes.length === 0) {
                        tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">ไม่มีโค้ดสำหรับรางวัลนี้</td></tr>';
                    } else {
                        tableBody.innerHTML = codes.map(code => {
                            const status = code.status || 'available';
                            const statusColor = status === 'available' ? 'var(--green)' : status === 'used' ? 'var(--blue)' : 'var(--red)';
                            const statusLabel = status === 'available' ? 'พร้อมใช้' : status === 'used' ? 'ใช้แล้ว' : 'หมดอายุ';
                            const expiryDate = code.expiry_date ? new Date(code.expiry_date).toLocaleDateString('th-TH') : '-';
                            
                            return `
                                <tr style="border-top: 1px solid var(--border);">
                                    <td style="text-align: left; padding: 1rem;">${maskedCodeCell(code.code || code.promo_code)}</td>
                                    <td style="padding: 1rem;">${code.reward_name || rewardName}</td>
                                    <td style="padding: 1rem;">
                                        <span style="display: inline-block; padding: 0.3rem 0.6rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600; color: ${statusColor}; background: ${statusColor}26;">
                                            ${statusLabel}
                                        </span>
                                    </td>
                                    <td style="padding: 1rem; font-size: 0.9rem; color: var(--text-secondary);">${expiryDate}</td>
                                    <td style="padding: 1rem; font-size: 0.9rem; color: var(--text-secondary);">${code.description || '-'}</td>
                                    <td style="padding: 1rem; text-align: center;">
                                        <button class="btn btn-del" onclick="deletePromoCode(${code.promo_code_id})" style="padding: 0.35rem 0.7rem; font-size: 0.85rem; border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; background: rgba(239,68,68,0.1); color: var(--red); cursor: pointer;">
                                            <i class="fas fa-trash"></i> ลบ
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join('');
                    }
                }
            }
        }, 100);
    } catch (error) {
        console.error('Show reward codes error:', error);
        alert('เกิดข้อผิดพลาดในการโหลดโค้ด: ' + error.message);
    }
}

// ─── Code masking helpers ────────────────────────────────────────────────────
// Shows first 4 + last 4 chars, masks the middle — prevents casual visual leakage.
function maskCode(code) {
    if (!code) return '-';
    const s = String(code);
    if (s.length <= 8) return s.slice(0, 2) + '****' + s.slice(-2);
    return s.slice(0, 4) + '•'.repeat(Math.min(s.length - 8, 8)) + s.slice(-4);
}

function copyCodeToClipboard(encodedCode) {
    const code = decodeURIComponent(encodedCode);
    navigator.clipboard.writeText(code).then(() => {
        const btn = event.currentTarget;
        const prev = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i>';
        btn.style.color = 'var(--green)';
        setTimeout(() => { btn.innerHTML = prev; btn.style.color = ''; }, 1500);
    }).catch(() => {
        // Fallback for browsers without clipboard API
        const ta = document.createElement('textarea');
        ta.value = code;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    });
}

function maskedCodeCell(code) {
    const enc = encodeURIComponent(code);
    return `<span style="font-family:monospace;font-weight:600;letter-spacing:0.05em;">${maskCode(code)}</span>` +
        `<button onclick="copyCodeToClipboard('${enc}')" title="Copy code" style="margin-left:6px;background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:0.8rem;padding:2px 4px;border-radius:4px;" onmouseover="this.style.color='var(--blue)'" onmouseout="this.style.color='var(--text-muted)'"><i class="fas fa-copy"></i></button>`;
}

// Delete promo code
async function deletePromoCode(promoCodeId) {
    if (!confirm('ต้องการลบโค้ดนี้ใช่หรือไม่?')) return;
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/promo-codes`, {
            method: 'DELETE',
            headers: {
                ...getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ promo_code_ids: [promoCodeId] })
        });

        if (!response.ok) throw new Error('ไม่สามารถลบโค้ดได้');

        alert('ลบโค้ดสำเร็จ');
        // Reload current promo codes
        const rewardSelect = document.getElementById('promo-reward-select');
        if (rewardSelect && rewardSelect.value) {
            showRewardCodes(rewardSelect.value, rewardSelect.options[rewardSelect.selectedIndex].text);
        }
    } catch (error) {
        console.error('Delete promo code error:', error);
        alert('เกิดข้อผิดพลาด: ' + error.message);
    }
}

// ========== PROMO CODE MANAGEMENT (REWARD-BASED) ==========

// Load rewards for the upload page
async function loadRewardsForUpload() {
    const rewardSelect = document.getElementById('promo-reward-select');
    if (!rewardSelect) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/rewards`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error('ไม่สามารถโหลดรางวัลได้');

        const data = await response.json();
        const rewards = data.data || [];

        rewardSelect.innerHTML = '<option value="">-- เลือกรางวัล --</option>';

        rewards.forEach(reward => {
            const option = document.createElement('option');
            option.value = reward.reward_id;
            option.textContent = reward.reward_name;
            option.dataset.rewardName = reward.reward_name;
            option.dataset.requiredPoints = reward.required_points || 0;
            option.dataset.stock = reward.stock || 0;
            rewardSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Load rewards for upload error:', error);
        rewardSelect.innerHTML = '<option value="">ไม่สามารถโหลดรางวัลได้</option>';
    }
}

function showRewardDetails() {
    const rewardSelect = document.getElementById('promo-reward-select');
    const infoDiv = document.getElementById('promo-reward-info');
    const contentDiv = document.getElementById('reward-details-content');
    if (!rewardSelect || !infoDiv || !contentDiv) return;

    const uploadHistorySection = document.getElementById('promo-upload-history');
    const selected = rewardSelect.options[rewardSelect.selectedIndex];
    if (!rewardSelect.value) {
        infoDiv.classList.add('hidden');
        if (uploadHistorySection) uploadHistorySection.classList.add('hidden');
        return;
    }

    if (uploadHistorySection) uploadHistorySection.classList.remove('hidden');

    const rewardName = selected.dataset.rewardName || '-';
    const requiredPoints = selected.dataset.requiredPoints || 0;
    const stock = selected.dataset.stock || 0;

    // Display reward details
    contentDiv.innerHTML = `
        <div style="padding: 1rem; background: var(--bg-card-alt); border-radius: 8px;">
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1rem;">
                <div style="padding: 0.75rem; background: var(--bg-card); border-radius: 8px; text-align: center; border: 1px solid var(--border);">
                    <div style="font-size: 1.2rem; font-weight: bold; color: var(--text-primary);">${rewardName}</div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.3rem;">ชื่อรางวัล</div>
                </div>
                <div style="padding: 0.75rem; background: var(--bg-card); border-radius: 8px; text-align: center; border: 1px solid var(--border);">
                    <div style="font-size: 1.2rem; font-weight: bold; color: var(--blue);">${requiredPoints}</div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.3rem;">แต้มที่ต้อง</div>
                </div>
                <div style="padding: 0.75rem; background: var(--bg-card); border-radius: 8px; text-align: center; border: 1px solid var(--border);">
                    <div style="font-size: 1.2rem; font-weight: bold; color: var(--green);">${stock}</div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.3rem;">จำนวนคงคลัง</div>
                </div>
            </div>
        </div>
    `;

    infoDiv.classList.remove('hidden');
}

async function loadRewardUploadHistory(rewardId) {
    const historyContainer = document.getElementById('promo-upload-history');
    const historyContent = document.getElementById('promo-upload-history-content');
    if (!historyContent) return;

    if (!rewardId) {
        if (historyContainer) historyContainer.classList.add('hidden');
        return;
    }

    if (historyContainer) historyContainer.classList.remove('hidden');
    historyContent.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังโหลด...';

    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/promo-codes?reward_id=${rewardId}&limit=2000`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error('ไม่สามารถโหลดประวัติได้');

        const data = await response.json();
        const codes = data.data || [];

        if (codes.length === 0) {
            historyContent.innerHTML = '<span style="color: var(--text-muted);">ยังไม่มีการอัพโหลดโค้ดสำหรับรางวัลนี้</span>';
            return;
        }

        // Group by batch_upload_id; codes without batch fall into 'legacy'
        const batchMap = {};
        codes.forEach(code => {
            const key = code.batch_upload_id || 'legacy';
            if (!batchMap[key]) {
                batchMap[key] = { batch_id: key, uploaded_at: code.uploaded_at || code.created_at, codes: [] };
            }
            batchMap[key].codes.push(code);
        });

        const batches = Object.values(batchMap).sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at));

        const rewardId2 = rewardId;
        historyContent.innerHTML = batches.map((batch, i) => {
            const uploadDate = batch.uploaded_at
                ? new Date(batch.uploaded_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : '-';
            const count = batch.codes.length;
            const usedCount = batch.codes.filter(c => c.is_used).length;
            const availCount = count - usedCount;
            const lowStock = availCount <= 10;
            return `
                <div style="display: flex; align-items: center; gap: 1.5rem; padding: 0.6rem 0.8rem; background: var(--bg-card); border-radius: 6px; margin-bottom: 0.4rem; border: 1px solid var(--border); flex-wrap: wrap;">
                    <div style="min-width: 70px; font-weight: 600; color: var(--text-primary);">ชุดที่ ${i + 1}</div>
                    <div style="color: var(--text-secondary);">อัพโหลด: <strong>${uploadDate}</strong></div>
                    <div style="color: var(--blue); font-weight: 600;">${count} โค้ด</div>
                    <div style="color: var(--text-secondary);">ใช้แล้ว: <span style="color: ${usedCount > 0 ? 'var(--green)' : 'var(--text-muted)'};">${usedCount}</span></div>
                    <div style="color: ${lowStock ? 'var(--red)' : 'var(--text-secondary)'}; font-weight: ${lowStock ? '600' : '400'};">คงเหลือ: ${availCount}${lowStock ? ' ⚠️' : ''}</div>
                    <a href="#" onclick="navToCampaignsTab('verifier'); setTimeout(()=>{ const s=document.getElementById('verifier-reward-select'); if(s){ s.value='${rewardId2}'; loadVerifierRewardCodes('${rewardId2}',1); } },400); return false;" style="margin-left:auto; font-size:0.8rem; color:var(--blue); text-decoration:underline;">ดูโค้ดทั้งหมด →</a>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Load history error:', error);
        historyContent.innerHTML = '<span style="color: var(--red);">เกิดข้อผิดพลาดในการโหลดประวัติ</span>';
    }
}

// Upload CSV to campaign
async function uploadPromoCodesToCampaign() {
    const rewardSelect = document.getElementById('promo-reward-select');
    const fileInput = document.getElementById('promo-csv-upload');
    const btn = document.getElementById('promo-csv-upload-btn');
    const resultDiv = document.getElementById('promo-upload-result');
    const messageDiv = document.getElementById('promo-upload-message');
    const detailsDiv = document.getElementById('promo-upload-details');

    if (!rewardSelect?.value) {
        alert('กรุณาเลือกรางวัลก่อนอัพโหลด');
        return;
    }

    const file = fileInput?.files[0];
    if (!file) {
        alert('กรุณาเลือกไฟล์ CSV');
        return;
    }

    if (!file.name.match(/\.csv$/i)) {
        alert('กรุณาอัพโหลดเฉพาะไฟล์ .csv เท่านั้น');
        return;
    }

    const selected = rewardSelect.options[rewardSelect.selectedIndex];
    const rewardName = selected.dataset.rewardName;
    const rewardId = rewardSelect.value;

    // Show result div immediately (loading state) so user knows something is happening
    if (resultDiv) {
        resultDiv.style.display = 'block';
        resultDiv.style.background = 'rgba(59,111,212,0.07)';
        resultDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (messageDiv) messageDiv.innerHTML = `<span style="color:var(--blue);"><i class="fas fa-spinner fa-spin"></i> กำลังอัพโหลด...</span>`;
    if (detailsDiv) detailsDiv.innerHTML = '';

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังอัพโหลด...'; }

    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('reward_id', rewardId);

        const response = await fetch(`${API_BASE_URL}/api/admin/promo-codes/upload-csv`, {
            method: 'POST',
            headers: (() => { const h = getAuthHeaders(); delete h['Content-Type']; return h; })(),
            body: formData
        });

        const result = await response.json();

        // Handle duplicate file error (409)
        if (response.status === 409 && result.fileAlreadyUploaded) {
            if (resultDiv) {
                resultDiv.style.background = 'rgba(234,179,8,0.12)';
                resultDiv.style.border = '1px solid rgba(234,179,8,0.4)';
                resultDiv.style.display = 'block';
                resultDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
            if (messageDiv) messageDiv.innerHTML = `<span style="color:#b45309; font-weight:700; font-size:1rem;"><i class="fas fa-exclamation-triangle"></i> ไฟล์ CSV นี้เคยอัพโหลดไว้แล้ว — ไม่มีโค้ดใหม่ถูกเพิ่ม</span>`;
            if (detailsDiv) detailsDiv.innerHTML = `
                <div style="margin-top:0.5rem; color:#92400e;">
                    ${escapeHtml(result.error || '')}<br><br>
                    <strong>วิธีแก้:</strong> เตรียม CSV ไฟล์ใหม่ที่มีโค้ดต่างออกไป แล้วอัพโหลดใหม่<br>
                    <small style="color:var(--text-muted);">ระบบตรวจจับซ้ำด้วย fingerprint ของไฟล์ — แม้เปลี่ยนชื่อไฟล์แต่โค้ดเหมือนเดิมก็ยังถือว่าซ้ำ</small>
                </div>`;
            loadRewardUploadHistory(rewardId);
            return;
        }

        if (response.ok && result.success) {
            const allFailed = result.successCount === 0 && result.errorCount > 0;
            const hasDuplicates = (result.duplicateInRewardCount || 0) > 0;

            if (allFailed) {
                if (resultDiv) resultDiv.style.background = 'rgba(239,68,68,0.1)';
                const dupCount = (result.selfDuplicateCount || 0) + (result.duplicateInRewardCount || 0);
                const reason = dupCount > 0 ? `โค้ดซ้ำทั้งหมด ${dupCount} ตัว` : `โค้ดทั้งหมดมีอยู่แล้วในระบบ`;
                if (messageDiv) messageDiv.innerHTML = `<span style="color:var(--red); font-weight:600;"><i class="fas fa-times-circle"></i> ไม่มีโค้ดใหม่ถูกเพิ่ม — ${reason}</span>`;
            } else {
                if (resultDiv) resultDiv.style.background = 'rgba(16,185,129,0.1)';
                if (messageDiv) messageDiv.innerHTML = `<span style="color:var(--green); font-weight:600;"><i class="fas fa-check-circle"></i> อัพโหลดสำเร็จ!</span>`;
            }

            let detailsHtml = `รางวัล: <strong>${escapeHtml(rewardName)}</strong><br>
                อัพโหลดสำเร็จ: <strong style="color:var(--green);">${result.successCount}</strong> โค้ด`;
            if (result.errorCount > 0) detailsHtml += ` | ล้มเหลว: <strong style="color:var(--red);">${result.errorCount}</strong> โค้ด`;
            if ((result.selfDuplicateCount || 0) > 0) detailsHtml += ` | <span style="color:#b45309;">ซ้ำในไฟล์: ${result.selfDuplicateCount}</span>`;
            detailsHtml += `<br>วันที่: ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;

            if (hasDuplicates) {
                detailsHtml += `<br><span style="color:#b45309; font-weight:600;"><i class="fas fa-copy"></i> โค้ดซ้ำกับที่อัพโหลดไว้แล้วในรางวัลนี้: ${result.duplicateInRewardCount} โค้ด</span>`;
                if (result.duplicateCodesInReward?.length > 0) {
                    const moreCount = result.duplicateInRewardCount - result.duplicateCodesInReward.length;
                    detailsHtml += `<details style="margin-top:0.4rem;"><summary style="cursor:pointer;color:#b45309;">ดูรายการโค้ดซ้ำ (${result.duplicateCodesInReward.length}${moreCount > 0 ? ` จาก ${result.duplicateInRewardCount}` : ''})</summary><ul style="margin-top:0.4rem;font-family:monospace;font-size:0.82rem;">${result.duplicateCodesInReward.map(c => `<li>${escapeHtml(c)}</li>`).join('')}${moreCount > 0 ? `<li style="color:var(--text-muted);">...และอีก ${moreCount} โค้ด</li>` : ''}</ul></details>`;
                }
            }

            if (result.errors?.length > 0) {
                detailsHtml += `<br><details style="margin-top:0.4rem;"><summary style="cursor:pointer;color:var(--red);">ดูรายการที่ผิดพลาด (${result.errors.length})</summary><ul style="margin-top:0.4rem;">${result.errors.map(e => `<li><code>${escapeHtml(e.code)}</code>: ${escapeHtml(e.error)}</li>`).join('')}</ul></details>`;
            }

            if (detailsDiv) detailsDiv.innerHTML = detailsHtml;

            await loadRewardsForUpload();
            const sel = document.getElementById('promo-reward-select');
            if (sel) { sel.value = rewardId; showRewardDetails(); }
            loadRewardUploadHistory(rewardId);
            if (!allFailed && fileInput) fileInput.value = '';
        } else {
            if (resultDiv) resultDiv.style.background = 'rgba(239,68,68,0.1)';
            if (messageDiv) messageDiv.innerHTML = `<span style="color:var(--red); font-weight:600;"><i class="fas fa-times-circle"></i> อัพโหลดไม่สำเร็จ</span>`;
            if (detailsDiv) detailsDiv.innerHTML = escapeHtml(result.error || 'เกิดข้อผิดพลาด');
            loadRewardUploadHistory(rewardId);
        }
    } catch (error) {
        console.error('Upload to reward error:', error);
        if (resultDiv) resultDiv.style.background = 'rgba(239,68,68,0.1)';
        if (messageDiv) messageDiv.innerHTML = `<span style="color:var(--red);font-weight:600;"><i class="fas fa-times-circle"></i> เกิดข้อผิดพลาด: ${escapeHtml(error.message)}</span>`;
        if (detailsDiv) detailsDiv.innerHTML = 'กรุณาตรวจสอบ Console สำหรับรายละเอียด';
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> อัพโหลดโค้ดเข้ารางวัล'; }
    }
}

// ========== PROMO CODE MANAGEMENT (LEGACY - kept for compatibility) ==========

// Load rewards and populate the dropdown
async function loadPromoRewards() {
    const rewardSelect = document.getElementById('promo-reward-select');
    if (!rewardSelect) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/rewards`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error('ไม่สามารถโหลดรางวัลได้');

        const data = await response.json();
        const rewards = data.data || [];

        // Clear existing options (except first one)
        rewardSelect.innerHTML = '<option value="">-- เลือกรางวัล --</option>';

        // Add reward options
        rewards.forEach(reward => {
            if (reward.is_active) {
                const option = document.createElement('option');
                option.value = reward.reward_id;
                option.textContent = `${reward.reward_name} (${reward.required_points} pts)`;
                option.dataset.rewardName = reward.reward_name;
                option.dataset.requiredPoints = reward.required_points;
                option.dataset.stock = reward.stock || 0;
                rewardSelect.appendChild(option);
            }
        });

        // Add event listener for showing reward details
        rewardSelect.addEventListener('change', showPromoRewardInfo);
    } catch (error) {
        console.error('Load promo rewards error:', error);
        const rewardSelect = document.getElementById('promo-reward-select');
        if (rewardSelect) {
            rewardSelect.innerHTML = '<option value="">-- เลือกรางวัล (เกิดข้อผิดพลาด) --</option>';
        }
    }
}

// Show selected reward information
function showPromoRewardInfo() {
    const rewardSelect = document.getElementById('promo-reward-select');
    const rewardInfo = document.getElementById('promo-reward-info');
    
    if (!rewardSelect || !rewardInfo) return;

    const selectedOption = rewardSelect.options[rewardSelect.selectedIndex];

    if (!rewardSelect.value) {
        rewardInfo.innerHTML = '<span><i class="fas fa-info-circle"></i> เลือกรางวัลเพื่อดูรายละเอียด</span>';
        // Clear codes table
        const tableBody = document.getElementById('promo-codes-table');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">เลือกรางวัลเพื่อแสดงโค้ด</td></tr>';
        }
        return;
    }

    const rewardName = selectedOption.dataset.rewardName || '';
    const requiredPoints = selectedOption.dataset.requiredPoints || 0;
    const stock = selectedOption.dataset.stock || 0;

    rewardInfo.innerHTML = `
        <span style="display: flex; align-items: center; gap: 0.5rem; width: 100%; justify-content: space-between;">
            <span><i class="fas fa-gift" style="color: var(--blue); margin-right: 0.5rem;"></i> ${rewardName}</span>
            <span style="font-size: 0.85rem; background: var(--blue); color: white; padding: 0.25rem 0.5rem; border-radius: 4px;">${requiredPoints} pts</span>
        </span>
    `;
    
    // Load promo codes for selected reward
    loadPromoCodesByReward(rewardSelect.value, rewardName);
}

// Load promo codes by reward
async function loadPromoCodesByReward(rewardId, rewardName) {
    try {
        const tableBody = document.getElementById('promo-codes-table');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;"><i class="fas fa-spinner fa-spin"></i> กำลังโหลดโค้ด...</td></tr>';
        }

        const response = await fetch(`${API_BASE_URL}/api/admin/promo-codes?reward_id=${rewardId}&limit=99999`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error('ไม่สามารถโหลดโค้ดได้');

        const data = await response.json();
        const codes = Array.isArray(data) ? data : data.data || [];

        // Calculate stats
        const stats = {
            total: 0,
            available: 0,
            used: 0,
            expired: 0
        };

        codes.forEach(code => {
            stats.total++;
            const status = code.status || 'available';
            if (stats.hasOwnProperty(status)) {
                stats[status]++;
            }
        });

        // Update stats display
        const statsHtml = `
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem;">
                <div style="padding: 1rem; background: var(--bg-card-alt); border-radius: 8px; text-align: center;">
                    <div style="font-size: 1.6rem; font-weight: bold; color: var(--blue); margin-bottom: 0.3rem;">${stats.total}</div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary);">โค้ดทั้งหมด</div>
                </div>
                <div style="padding: 1rem; background: var(--bg-card-alt); border-radius: 8px; text-align: center;">
                    <div style="font-size: 1.6rem; font-weight: bold; color: var(--green); margin-bottom: 0.3rem;">${stats.available}</div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary);">พร้อมใช้</div>
                </div>
                <div style="padding: 1rem; background: var(--bg-card-alt); border-radius: 8px; text-align: center;">
                    <div style="font-size: 1.6rem; font-weight: bold; color: var(--blue); margin-bottom: 0.3rem;">${stats.used}</div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary);">ใช้แล้ว</div>
                </div>
                <div style="padding: 1rem; background: var(--bg-card-alt); border-radius: 8px; text-align: center;">
                    <div style="font-size: 1.6rem; font-weight: bold; color: var(--red); margin-bottom: 0.3rem;">${stats.expired}</div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary);">หมดอายุ</div>
                </div>
            </div>
        `;

        // Update stats container
        const statsContainer = document.getElementById('promo-codes-stats');
        if (statsContainer) {
            statsContainer.innerHTML = statsHtml;
        }

        if (tableBody) {
            if (codes.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">ไม่มีโค้ดสำหรับรางวัลนี้</td></tr>';
            } else {
                tableBody.innerHTML = codes.map(code => {
                    const status = code.status || 'available';
                    const statusColor = status === 'available' ? 'var(--green)' : status === 'used' ? 'var(--blue)' : 'var(--red)';
                    const statusLabel = status === 'available' ? 'พร้อมใช้' : status === 'used' ? 'ใช้แล้ว' : 'หมดอายุ';
                    const expiryDate = code.expiry_date ? new Date(code.expiry_date).toLocaleDateString('th-TH') : '-';
                    
                    return `
                        <tr style="border-top: 1px solid var(--border);">
                            <td style="text-align: left; padding: 1rem;">${maskedCodeCell(code.code || code.promo_code)}</td>
                            <td style="padding: 1rem;">${code.reward_name || rewardName}</td>
                            <td style="padding: 1rem;">
                                <span style="display: inline-block; padding: 0.3rem 0.6rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600; color: ${statusColor}; background: ${statusColor}26;">
                                    ${statusLabel}
                                </span>
                            </td>
                            <td style="padding: 1rem; font-size: 0.9rem; color: var(--text-secondary);">${expiryDate}</td>
                            <td style="padding: 1rem; font-size: 0.9rem; color: var(--text-secondary);">${code.description || '-'}</td>
                            <td style="padding: 1rem; text-align: center;">
                                <button class="btn btn-del" onclick="deletePromoCode(${code.promo_code_id})" style="padding: 0.35rem 0.7rem; font-size: 0.85rem; border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; background: rgba(239,68,68,0.1); color: var(--red); cursor: pointer;">
                                    <i class="fas fa-trash"></i> ลบ
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('');
            }
        }
    } catch (error) {
        console.error('Load promo codes error:', error);
        const tableBody = document.getElementById('promo-codes-table');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--red);">เกิดข้อผิดพลาดในการโหลดโค้ด</td></tr>';
        }
    }
}

// ─── Tab switcher ────────────────────────────────────────────────────────────
function switchUploadTab(tab) {
    const csvTab = document.getElementById('tab-csv');
    const excelTab = document.getElementById('tab-excel');
    const csvBtn = document.getElementById('tab-csv-btn');
    const excelBtn = document.getElementById('tab-excel-btn');

    if (tab === 'csv') {
        csvTab.style.display = 'block';
        excelTab.style.display = 'none';
        csvBtn.style.background = 'var(--blue)';
        csvBtn.style.color = '#fff';
        csvBtn.style.borderColor = 'var(--blue)';
        excelBtn.style.background = 'var(--bg-card)';
        excelBtn.style.color = 'var(--text-secondary)';
        excelBtn.style.borderColor = 'var(--border)';
    } else {
        csvTab.style.display = 'none';
        excelTab.style.display = 'block';
        excelBtn.style.background = 'var(--blue)';
        excelBtn.style.color = '#fff';
        excelBtn.style.borderColor = 'var(--blue)';
        csvBtn.style.background = 'var(--bg-card)';
        csvBtn.style.color = 'var(--text-secondary)';
        csvBtn.style.borderColor = 'var(--border)';
    }
}

// ─── Download CSV template ────────────────────────────────────────────────────
function downloadCsvTemplate() {
    const csvContent = 'code,description\nPROMO001,ส่วนลด 50 บาท\nPROMO002,ส่วนลด 100 บาท\nPROMO003,\n';
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'promo_codes_template.csv';
    a.click();
    URL.revokeObjectURL(url);
}

// ─── Upload CSV file directly (multipart) ────────────────────────────────────
async function uploadPromoCodesFromCsvFile() {
    const rewardSelect = document.getElementById('promo-reward-select');
    const fileInput = document.getElementById('promo-csv-upload');
    const file = fileInput?.files[0];
    const btn = document.getElementById('promo-csv-upload-btn');

    if (!rewardSelect || !rewardSelect.value) {
        alert('กรุณาเลือกรางวัลก่อนอัพโหลดโค้ด');
        return;
    }

    if (!file) {
        alert('กรุณาเลือกไฟล์ CSV');
        return;
    }

    if (!file.name.match(/\.csv$/i)) {
        alert('กรุณาอัพโหลดเฉพาะไฟล์ .csv เท่านั้น');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังอัพโหลด...';

    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('reward_id', rewardSelect.value);

        const response = await fetch(`${API_BASE_URL}/api/admin/promo-codes/upload-csv`, {
            method: 'POST',
            headers: { ...getAuthHeaders() }, // no Content-Type — let browser set multipart boundary
            body: formData
        });

        const result = await response.json();

        const resultDiv = document.getElementById('promo-upload-result');
        const messageDiv = document.getElementById('promo-upload-message');
        const detailsDiv = document.getElementById('promo-upload-details');

        if (resultDiv && messageDiv) {
            resultDiv.style.display = 'block';

            if (result.success) {
                resultDiv.style.background = result.errorCount === 0
                    ? 'rgba(16,185,129,0.15)' : 'rgba(255,165,0,0.15)';
                resultDiv.style.color = result.errorCount === 0
                    ? 'var(--green)' : 'var(--orange)';
                messageDiv.innerHTML = `<strong>✅ อัพโหลดสำเร็จ ${result.successCount} โค้ด</strong>`
                    + (result.errorCount ? `, ล้มเหลว ${result.errorCount} โค้ด` : '')
                    + (result.reward_name ? ` → รางวัล: ${result.reward_name}` : '');
            } else {
                resultDiv.style.background = 'rgba(239,68,68,0.12)';
                resultDiv.style.color = 'var(--red, #ef4444)';
                messageDiv.innerHTML = `<strong>❌ ${result.error || 'อัพโหลดไม่สำเร็จ'}</strong>`;
            }

            if (result.errors && result.errors.length > 0) {
                detailsDiv.innerHTML = result.errors.slice(0, 5).map(e =>
                    `<div><strong>${e.code}</strong>: ${e.error}</div>`
                ).join('');
                if (result.errors.length > 5) {
                    detailsDiv.innerHTML += `<div style="margin-top:0.4rem;">...และอื่นๆ ${result.errors.length - 5} รายการ</div>`;
                }
            } else {
                detailsDiv.innerHTML = '';
            }
        }

        if (result.success) {
            fileInput.value = '';
            setTimeout(() => loadPromoCodes(), 800);
        }
    } catch (error) {
        alert('เกิดข้อผิดพลาด: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> อัพโหลด CSV';
    }
}

async function uploadPromoCodesFromExcel() {
    const rewardSelect = document.getElementById('promo-reward-select');
    const fileInput = document.getElementById('promo-excel-upload');
    const file = fileInput?.files[0];

    // Validate reward selection
    if (!rewardSelect || !rewardSelect.value) {
        alert('กรุณาเลือกรางวัลก่อนอัพโหลดโค้ด');
        return;
    }

    if (!file) {
        alert('กรุณาเลือกไฟล์');
        return;
    }

    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
        alert('กรุณาอัพโหลดไฟล์ Excel (.xlsx, .xls, .csv)');
        return;
    }

    try {
        // Load XLSX library if not available
        if (!window.XLSX) {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.min.js';
            script.onload = () => parseAndUploadExcel(file, parseInt(rewardSelect.value));
            document.head.appendChild(script);
        } else {
            await parseAndUploadExcel(file, parseInt(rewardSelect.value));
        }
    } catch (error) {
        alert('เกิดข้อผิดพลาด: ' + error.message);
    }
}

// ═══════════════════════════════════════════════════════════════
// PARTNERS MANAGEMENT
// ═══════════════════════════════════════════════════════════════

let _partnersList = [];

// ── Load & render sidebar ──


async function loadPartnersList() {
    const el = document.getElementById('partner-sidebar-list');
    if (!el) return;
    el.innerHTML = '<div style="text-align:center;padding:30px;color:#aaa"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
        const res = await fetch(`${API_BASE_URL}/api/partners/admin/all`);
        _partnersList = await res.json();
        renderPartnersSidebar(_partnersList);
    } catch (e) {
        el.innerHTML = `<div style="color:#e74c3c;padding:12px;font-size:13px">โหลดไม่ได้: ${e.message}</div>`;
    }
}

function renderPartnersSidebar(list) {
    const el = document.getElementById('partner-sidebar-list');
    if (!list.length) {
        el.innerHTML = '<div style="color:#aaa;text-align:center;padding:30px;font-size:13px">ยังไม่มีพาร์ทเนอร์</div>';
        return;
    }
    const sorted = [...list].sort((a, b) => Number(b.is_active) - Number(a.is_active));
    el.innerHTML = sorted.map(p => {
        const logo = p.logo_url ? resolveMediaUrl(p.logo_url) : '';
        const isSelected = window._selectedPartnerId === p.id;
        const isActive = !!p.is_active;
        const statusDot = isActive
            ? '<span style="color:#43A047;font-size:8px">●</span>'
            : '<span style="color:#ef4444;font-size:8px">●</span>';
        const inactiveBadge = !isActive
            ? '<span style="font-size:9px;padding:1px 6px;border-radius:4px;font-weight:700;background:#F5F5F5;color:#9E9E9E;border:1px solid #E0E0E0">ปิดใช้งาน</span>'
            : '';
        return `
        <div class="partner-sidebar-card${isSelected ? ' selected' : ''}" onclick="selectPartner(${p.id})" id="sidebar-partner-${p.id}" style="${isActive ? '' : 'opacity:0.55'}">
            <div class="partner-sidebar-logo">
                ${logo
                    ? `<img src="${logo}" style="width:100%;height:100%;object-fit:contain" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-store\\' style=\\'color:#aaa;font-size:16px\\'></i>'">`
                    : '<i class="fas fa-store" style="color:#aaa;font-size:16px"></i>'}
            </div>
            <div style="flex:1;min-width:0">
                <div class="pt-item-name" style="display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                    ${statusDot} ${escHtml(p.name || '')}
                </div>
                <div class="pt-item-sub" style="display:flex;align-items:center;gap:4px">
                    ${escHtml(p.category || '—')}
                    ${p.tier && p.tier !== 'none' ? `<span style="font-size:9px;padding:1px 5px;border-radius:4px;font-weight:700;background:${p.tier==='platinum'?'#ECEFF1':p.tier==='gold'?'#FFF8E1':'#F5F5F5'};color:${p.tier==='platinum'?'#546E7A':p.tier==='gold'?'#E65100':'#616161'};border:1px solid ${p.tier==='platinum'?'#B0BEC5':p.tier==='gold'?'#F9A825':'#9E9E9E'}">${p.tier==='platinum'?'💎':p.tier==='gold'?'🥇':'🥈'}</span>` : ''}
                    ${inactiveBadge}
                </div>
            </div>
        </div>`;
    }).join('');
}

function filterPartners(query) {
    const q = query.toLowerCase();
    const filtered = _partnersList.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
    );
    renderPartnersSidebar(filtered);
}

// ── Select partner → show detail panel ──

async function selectPartner(id) {
    window._selectedPartnerId = id;
    // Highlight sidebar card
    document.querySelectorAll('.partner-sidebar-card').forEach(c => c.classList.remove('selected'));
    const card = document.getElementById(`sidebar-partner-${id}`);
    if (card) card.classList.add('selected');

    // Show detail content, hide others
    document.getElementById('partner-detail-empty').style.display = 'none';
    document.getElementById('partner-detail-form').style.display = 'none';
    document.getElementById('partner-detail-content').style.display = 'block';

    // Populate header
    const p = _partnersList.find(x => x.id === id);
    if (!p) return;
    window._selectedPartnerActive = p.is_active;
    window._editingPartnerId = id;
    window._partnerDetailData = p;

    document.getElementById('pdc-name').textContent = p.name || '';
    document.getElementById('pdc-category').textContent = p.category || '';
    document.getElementById('pdc-tagline').textContent = p.tagline || '';

    const badge = document.getElementById('pdc-status-badge');
    if (p.is_active) {
        badge.textContent = 'Active'; badge.style.cssText = 'font-size:10px;padding:2px 8px;border-radius:10px;font-weight:700;background:rgba(67,160,71,.15);color:#43A047';
    } else {
        badge.textContent = 'Inactive'; badge.style.cssText = 'font-size:10px;padding:2px 8px;border-radius:10px;font-weight:700;background:rgba(239,68,68,.12);color:#ef4444';
    }

    const toggleBtn = document.getElementById('pdc-toggle-btn');
    if (p.is_active) {
        toggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i> ปิด';
        toggleBtn.className = 'btn btn-soft';
    } else {
        toggleBtn.innerHTML = '<i class="fas fa-eye"></i> เปิด';
        toggleBtn.className = 'btn btn-primary';
    }
    toggleBtn.style.cssText = 'font-size:11px;padding:5px 12px';

    // Cover
    const coverImg = document.getElementById('pdc-cover-img');
    if (p.cover_image_url) {
        coverImg.src = resolveMediaUrl(p.cover_image_url);
        coverImg.style.display = 'block';
    } else { coverImg.style.display = 'none'; }

    // Logo
    const logo = document.getElementById('pdc-logo');
    const logoFallback = document.getElementById('pdc-logo-fallback');
    if (p.logo_url) {
        logo.src = resolveMediaUrl(p.logo_url);
        logo.style.display = 'block';
        logoFallback.style.display = 'none';
    } else {
        logo.style.display = 'none';
        logoFallback.style.display = 'flex';
    }

    // Load first tab (announcements) data
    switchPartnerTab('announcements');
}

// ── Tab switching ──

function switchPartnerTab(tab) {
    document.querySelectorAll('.ptab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.querySelectorAll('.ptab-content').forEach(c => {
        c.style.display = c.id === `tab-${tab}` ? 'block' : 'none';
    });
    const id = window._selectedPartnerId;
    if (!id) return;
    if (tab === 'announcements') { loadPartnerAnnouncements(id); updateAnnouncementPreview(); }
    if (tab === 'services')      { loadPartnerServices(id); updateServicePreview(); }
    if (tab === 'jobs')          { loadPartnerJobs(id); updateJobPreview(); }
    if (tab === 'projects')      { loadPartnerProjects(id); updateProjectPreview(); }
    if (tab === 'ads')           { loadPartnerAds(id); updateAdPreview(); }
    if (tab === 'banners')       loadPartnerBanners(id);
    if (tab === 'campaigns')     { loadRewardCategories(); loadRewardsCatalog(id); updateRewardPreview(); }
    if (tab === 'articles')      loadPartnerArticles(id);
}

// ── Partner Campaigns tab (uses the shared reward create/list functions, scoped by partner_id) ──

async function goToPartnerPromoCodes(rewardId, rewardName) {
    await navToCampaignsTab('codes');
    const sel = document.getElementById('promo-reward-select');
    if (sel) { sel.value = rewardId; sel.dispatchEvent(new Event('change')); }
}

async function goToPartnerVerifier(rewardId) {
    await navToCampaignsTab('verifier');
    const sel = document.getElementById('verifier-reward-select');
    if (sel) { sel.value = rewardId; sel.dispatchEvent(new Event('change')); }
}

// ── Tab list loaders ──

async function loadPartnerServices(partnerId) {
    const el = document.getElementById('service-list');
    if (!el) return;
    el.innerHTML = '<div style="color:#aaa;font-size:12px"><i class="fas fa-spinner fa-spin"></i> โหลด...</div>';
    try {
        const res = await fetch(`${API_BASE_URL}/api/partners/${partnerId}/services`);
        const list = await res.json();
        _serviceCache = list;
        setTabCount('services', list.length);
        if (!list.length) { el.innerHTML = '<div style="color:#aaa;font-size:13px;text-align:center;padding:16px">ยังไม่มีบริการ</div>'; return; }
        el.innerHTML = list.map(s => {
            const img = s.image_url
                ? `<img src="${resolveMediaUrl(s.image_url)}" style="width:100%;height:100%;object-fit:cover">`
                : `<i class="fas fa-image" style="color:#aaa"></i>`;
            return `
            <div class="pt-item">
                <div class="pt-item-top">
                    <div class="pt-thumb">${img}</div>
                    <div class="pt-item-info">
                        <div class="pt-item-name">${escHtml(s.title || '')}</div>
                        ${s.description ? `<div class="pt-item-sub">${escHtml(s.description)}</div>` : ''}
                    </div>
                    <div class="pt-item-actions">
                        <button class="btn btn-check" style="font-size:10px;padding:3px 8px" onclick="editService(${s.id})"><i class="fas fa-pen"></i></button>
                        <button class="btn btn-del" style="font-size:10px;padding:3px 8px" onclick="deleteService(${s.id}, ${partnerId})"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            </div>`;
        }).join('');
    } catch { el.innerHTML = '<div style="color:#e74c3c;font-size:12px">โหลดไม่ได้</div>'; }
}

async function deleteService(serviceId, partnerId) {
    if (!confirm('ลบบริการนี้?')) return;
    await fetch(`${API_BASE_URL}/api/partners/services/${serviceId}`, { method: 'DELETE' });
    loadPartnerServices(partnerId);
}

async function loadPartnerJobs(partnerId) {
    const el = document.getElementById('job-list');
    if (!el) return;
    el.innerHTML = '<div style="color:#aaa;font-size:12px"><i class="fas fa-spinner fa-spin"></i> โหลด...</div>';
    try {
        const res = await fetch(`${API_BASE_URL}/api/partners/${partnerId}`);
        const data = await res.json();
        const list = (data.jobs || []);
        _jobCache = list;
        setTabCount('jobs', list.filter(j => j.is_active).length);
        if (!list.length) { el.innerHTML = '<div style="color:#aaa;font-size:13px;text-align:center;padding:16px">ยังไม่มีตำแหน่งงาน</div>'; return; }
        el.innerHTML = list.map(j => {
            const active = j.is_active == 1 || j.is_active === true;
            return `
            <div class="pt-item" style="${active ? '' : 'opacity:0.55'}">
                <div class="pt-item-top">
                    <div class="pt-thumb"><i class="fas fa-briefcase" style="color:#aaa"></i></div>
                    <div class="pt-item-info">
                        <div class="pt-item-name" style="display:flex;align-items:center;gap:6px">
                            ${escHtml(j.title || '')}
                            <span style="font-size:9px;padding:1px 6px;border-radius:4px;font-weight:700;background:${active?'rgba(16,185,129,0.12)':'rgba(156,163,175,0.18)'};color:${active?'#059669':'#6b7280'}">${active?'เปิด':'ปิด'}</span>
                        </div>
                        <div class="pt-item-sub">${[j.job_type, j.location, j.salary_range].filter(Boolean).map(escHtml).join(' · ') || '—'}</div>
                    </div>
                    <div class="pt-item-actions">
                        <button class="btn" style="font-size:10px;padding:3px 10px;background:${active?'#f3f4f6':'#d1fae5'};color:${active?'#374151':'#065f46'};border:1px solid ${active?'#d1d5db':'#6ee7b7'}" onclick="toggleJobActive(${j.id}, ${active?1:0}, ${partnerId})">${active?'ปิด':'เปิด'}</button>
                        <button class="btn btn-check" style="font-size:10px;padding:3px 8px" onclick="editJob(${j.id})"><i class="fas fa-pen"></i></button>
                        <button class="btn btn-del" style="font-size:10px;padding:3px 8px" onclick="deleteJob(${j.id}, ${partnerId})"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            </div>`;
        }).join('');
    } catch { el.innerHTML = '<div style="color:#e74c3c;font-size:12px">โหลดไม่ได้</div>'; }
}

async function deleteJob(jobId, partnerId) {
    if (!confirm('ลบตำแหน่งงานนี้?')) return;
    await fetch(`${API_BASE_URL}/api/partners/jobs/${jobId}`, { method: 'DELETE' });
    loadPartnerJobs(partnerId);
}

async function toggleJobActive(jobId, currentActive, partnerId) {
    await fetch(`${API_BASE_URL}/api/partners/jobs/${jobId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: currentActive ? 0 : 1 }),
    });
    loadPartnerJobs(partnerId);
}

async function loadPartnerProjects(partnerId) {
    const el = document.getElementById('project-list');
    if (!el) return;
    el.innerHTML = '<div style="color:#aaa;font-size:12px"><i class="fas fa-spinner fa-spin"></i> โหลด...</div>';
    try {
        const res = await fetch(`${API_BASE_URL}/api/partners/${partnerId}/projects`);
        const list = await res.json();
        _projectCache = list;
        setTabCount('projects', list.length);
        if (!list.length) { el.innerHTML = '<div style="color:#aaa;font-size:13px;text-align:center;padding:16px">ยังไม่มีโครงการ</div>'; return; }
        el.innerHTML = list.map(p => {
            const img = p.image_url
                ? `<img src="${resolveMediaUrl(p.image_url)}" style="width:100%;height:100%;object-fit:cover">`
                : `<i class="fas fa-heart" style="color:#aaa"></i>`;
            return `
            <div class="pt-item">
                <div class="pt-item-top">
                    <div class="pt-thumb">${img}</div>
                    <div class="pt-item-info">
                        <div class="pt-item-name">${escHtml(p.title || '')}</div>
                        ${p.description ? `<div class="pt-item-sub">${escHtml(p.description)}</div>` : ''}
                    </div>
                    <div class="pt-item-actions">
                        <button class="btn btn-check" style="font-size:10px;padding:3px 8px" onclick="editProject(${p.id})"><i class="fas fa-pen"></i></button>
                        <button class="btn btn-del" style="font-size:10px;padding:3px 8px" onclick="deleteProject(${p.id}, ${partnerId})"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            </div>`;
        }).join('');
    } catch { el.innerHTML = '<div style="color:#e74c3c;font-size:12px">โหลดไม่ได้</div>'; }
}

async function deleteProject(projectId, partnerId) {
    if (!confirm('ลบโครงการนี้?')) return;
    await fetch(`${API_BASE_URL}/api/partners/projects/${projectId}`, { method: 'DELETE' });
    loadPartnerProjects(partnerId);
}

// ── Banner tab (per-partner) ──

let _partnerBannerCache = [];

async function loadPartnerBanners(partnerId) {
    const el = document.getElementById('partner-banners-list');
    if (!el || !partnerId) return;
    el.innerHTML = '<div style="color:#aaa;font-size:12px"><i class="fas fa-spinner fa-spin"></i> โหลด...</div>';
    try {
        const res  = await fetch(`${API_BASE_URL}/api/banners/admin/all`);
        let list   = await res.json();
        list = list.filter(b => String(b.partner_id) === String(partnerId));
        const filterType = document.getElementById('banner-filter-type')?.value || '';
        if (filterType) list = list.filter(b => b.banner_type === filterType);
        _partnerBannerCache = list;
        setTabCount('banners', list.length);
        if (!list.length) {
            el.innerHTML = '<div style="color:#aaa;font-size:13px;text-align:center;padding:20px">ยังไม่มีแบนเนอร์</div>';
            return;
        }
        el.innerHTML = list.map(b => {
            const now   = new Date();
            const start = b.start_date ? new Date(b.start_date) : null;
            const end   = b.end_date   ? new Date(b.end_date)   : null;
            let statusColor = '#10b981', statusLabel = 'Active';
            if (!b.is_active)             { statusColor = '#6b7280'; statusLabel = 'Inactive'; }
            else if (start && now < start){ statusColor = '#f59e0b'; statusLabel = 'Scheduled'; }
            else if (end   && now > end)  { statusColor = '#ef4444'; statusLabel = 'Expired'; }
            const daysLabel = end
                ? (Math.ceil((end - now) / 86400000) > 0 ? `เหลือ ${Math.ceil((end-now)/86400000)} วัน` : 'หมดอายุแล้ว')
                : 'ไม่มีวันหมดอายุ';
            const typeLabel = BANNER_TYPE_LABELS[b.banner_type] || b.banner_type || '-';
            const img = b.image_url
                ? `<img src="${resolveMediaUrl(b.image_url)}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">`
                : `<i class="fas fa-image" style="color:#bbb"></i>`;
            return `
            <div class="pt-item">
                <div class="pt-item-top">
                    <div class="pt-thumb">${img}</div>
                    <div class="pt-item-info">
                        <div class="pt-item-name" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px">${escHtml(b.title||'(ไม่มีชื่อ)')}</span>
                            <span style="font-size:10px;background:${statusColor}18;color:${statusColor};padding:1px 6px;border-radius:10px;font-weight:600;white-space:nowrap">${statusLabel}</span>
                            <span style="font-size:10px;background:#f0f0f0;color:#666;padding:1px 6px;border-radius:10px;white-space:nowrap">${typeLabel}</span>
                        </div>
                        <div class="pt-item-sub">${daysLabel}</div>
                    </div>
                    <div class="pt-item-actions">
                        <button class="btn btn-check" style="font-size:10px;padding:3px 8px" onclick="editPartnerBanner(${b.id})"><i class="fas fa-pen"></i></button>
                        <button class="btn" style="font-size:10px;padding:3px 8px" onclick="togglePartnerBannerActive(${b.id},${b.is_active?1:0},${partnerId})">${b.is_active?'ปิด':'เปิด'}</button>
                        <button class="btn btn-del" style="font-size:10px;padding:3px 8px" onclick="deletePartnerBanner(${b.id},${partnerId})"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
                <div class="pt-item-stats">
                    <span style="font-size:11px;color:#555"><i class="fas fa-eye" style="color:#6366f1"></i> <b>${b.view_count||0}</b></span>
                    <span style="font-size:11px;color:#555"><i class="fas fa-hand-pointer" style="color:#10b981"></i> <b>${b.click_count||0}</b></span>
                    <span style="font-size:11px;color:#555"><i class="fas fa-percent" style="color:#f59e0b"></i> CTR <b>${b.view_count>0?((b.click_count/b.view_count)*100).toFixed(1)+'%':'—'}</b></span>
                </div>
            </div>`;
        }).join('');
    } catch (e) {
        el.innerHTML = `<div style="color:#e74c3c;font-size:12px">โหลดไม่ได้: ${e.message}</div>`;
    }
}

function editPartnerBanner(id) {
    const b = _partnerBannerCache.find(x => x.id === id);
    if (!b) return;
    document.getElementById('banner-edit-id').value      = id;
    document.getElementById('banner-title').value        = b.title || '';
    document.getElementById('banner-description').value  = b.description || '';
    document.getElementById('banner-type').value         = b.banner_type || 'general';
    document.getElementById('banner-link').value         = b.link_url || '';
    document.getElementById('banner-start').value        = b.start_date ? b.start_date.substring(0,10) : '';
    document.getElementById('banner-end').value          = b.end_date   ? b.end_date.substring(0,10)   : '';
    document.getElementById('banner-order').value        = b.display_order ?? 0;
    const prev = document.getElementById('banner-image-preview');
    if (b.image_url) { prev.src = resolveMediaUrl(b.image_url); prev.style.display = 'block'; }
    else prev.style.display = 'none';
    document.getElementById('banner-form-header').textContent = 'แก้ไข';
    document.getElementById('banner-cancel-btn').style.display = '';
    document.getElementById('banner-submit-btn').innerHTML = '<i class="fas fa-save"></i> บันทึกการแก้ไข';
    document.getElementById('banner-title').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function resetPartnerBannerForm() {
    document.getElementById('banner-edit-id').value = '';
    document.getElementById('banner-title').value = '';
    document.getElementById('banner-description').value = '';
    document.getElementById('banner-type').value = 'benefits';
    document.getElementById('banner-link').value = '';
    document.getElementById('banner-start').value = '';
    document.getElementById('banner-end').value = '';
    document.getElementById('banner-order').value = '0';
    document.getElementById('banner-image').value = '';
    document.getElementById('banner-image-preview').style.display = 'none';
    document.getElementById('banner-form-msg').textContent = '';
    document.getElementById('banner-form-header').textContent = 'เพิ่มใหม่';
    document.getElementById('banner-cancel-btn').style.display = 'none';
    document.getElementById('banner-submit-btn').innerHTML = '<i class="fas fa-plus"></i> เพิ่มแบนเนอร์';
}

async function submitPartnerBannerForm() {
    const partnerId = window._selectedPartnerId;
    if (!partnerId) return;
    const msg    = document.getElementById('banner-form-msg');
    const editId = document.getElementById('banner-edit-id').value;
    const title  = document.getElementById('banner-title').value.trim();
    if (!title) { msg.style.color = '#e74c3c'; msg.textContent = 'กรุณากรอกชื่อแบนเนอร์'; return; }
    try {
        msg.textContent = 'กำลังบันทึก...';
        const fd = new FormData();
        fd.append('partner_id',    partnerId);
        fd.append('title',         title);
        fd.append('description',   document.getElementById('banner-description').value.trim());
        fd.append('banner_type',   document.getElementById('banner-type').value);
        fd.append('link_url',      document.getElementById('banner-link').value.trim());
        fd.append('start_date',    document.getElementById('banner-start').value);
        fd.append('end_date',      document.getElementById('banner-end').value);
        fd.append('display_order', document.getElementById('banner-order').value || '0');
        const imgFile = document.getElementById('banner-image').files[0];
        if (imgFile) fd.append('image', imgFile);
        const url    = editId ? `${API_BASE_URL}/api/banners/${editId}` : `${API_BASE_URL}/api/banners`;
        const method = editId ? 'PUT' : 'POST';
        const res  = await fetch(url, { method, body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
        msg.style.color = '#27ae60';
        msg.textContent = editId ? 'อัปเดตสำเร็จ!' : 'เพิ่มแบนเนอร์สำเร็จ!';
        resetPartnerBannerForm();
        loadPartnerBanners(partnerId);
    } catch (err) {
        msg.style.color = '#e74c3c';
        msg.textContent = err.message;
    }
}

async function togglePartnerBannerActive(id, currentActive, partnerId) {
    try {
        await fetch(`${API_BASE_URL}/api/banners/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: currentActive ? 0 : 1 }),
        });
        loadPartnerBanners(partnerId);
    } catch (e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
}

async function deletePartnerBanner(id, partnerId) {
    if (!confirm('ลบแบนเนอร์นี้?')) return;
    try {
        await fetch(`${API_BASE_URL}/api/banners/${id}`, { method: 'DELETE' });
        loadPartnerBanners(partnerId);
    } catch (e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
}

function setTabCount(tab, n) {
    const el = document.getElementById(`ptab-count-${tab}`);
    if (el) el.textContent = n > 0 ? n : '';
}

// ── Add / Edit form panel ──

function showAddPartnerPanel() {
    resetPartnerForm();
    document.getElementById('partner-detail-empty').style.display = 'none';
    document.getElementById('partner-detail-content').style.display = 'none';
    document.getElementById('partner-detail-form').style.display = 'block';
    document.getElementById('partner-form-title').textContent = 'เพิ่มพาร์ทเนอร์ใหม่';
    document.getElementById('partner-detail-form').scrollIntoView({ behavior: 'smooth' });
}

function closePartnerDetailForm() {
    document.getElementById('partner-detail-form').style.display = 'none';
    if (window._selectedPartnerId) {
        document.getElementById('partner-detail-content').style.display = 'block';
    } else {
        document.getElementById('partner-detail-empty').style.display = 'block';
    }
}

function editPartner(id) {
    const p = _partnersList.find(x => x.id === id);
    if (!p) return;
    document.getElementById('partner-edit-id').value = id;
    document.getElementById('partner-form-title').textContent = `แก้ไข: ${p.name}`;
    document.getElementById('partner-name').value = p.name || '';
    document.getElementById('partner-description').value = p.description || '';
    document.getElementById('partner-website').value = p.website_url || '';
    document.getElementById('partner-contact-phone').value    = p.contact_phone    || '';
    document.getElementById('partner-contact-email').value    = p.contact_email    || '';
    document.getElementById('partner-contact-line').value     = p.contact_line     || '';
    document.getElementById('partner-contact-facebook').value = p.contact_facebook || '';
    document.getElementById('partner-contact-address').value  = p.contact_address  || '';
    document.getElementById('partner-tier').value = p.tier || 'none';
    document.getElementById('partner-category').value = p.category || '';
    const logoPrev = document.getElementById('partner-logo-preview');
    if (p.logo_url) { logoPrev.src = resolveMediaUrl(p.logo_url); logoPrev.style.display = 'block'; }
    else logoPrev.style.display = 'none';
    const coverPrev = document.getElementById('partner-cover-preview');
    if (p.cover_image_url) { coverPrev.src = resolveMediaUrl(p.cover_image_url); coverPrev.style.display = 'block'; }
    else coverPrev.style.display = 'none';

    document.getElementById('partner-detail-content').style.display = 'none';
    document.getElementById('partner-detail-form').style.display = 'block';
    document.getElementById('partner-detail-form').scrollIntoView({ behavior: 'smooth' });
}

function resetPartnerForm() {
    document.getElementById('partner-edit-id').value = '';
    document.getElementById('partner-form').reset();
    document.getElementById('partner-logo-preview').style.display = 'none';
    document.getElementById('partner-cover-preview').style.display = 'none';
    document.getElementById('partner-form-msg').textContent = '';
}

function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function submitPartnerForm(e) {
    e.preventDefault();
    const msg = document.getElementById('partner-form-msg');
    const editId = document.getElementById('partner-edit-id').value;

    const name = document.getElementById('partner-name').value.trim();
    const description = document.getElementById('partner-description').value.trim();
    const websiteUrl = document.getElementById('partner-website').value.trim();
    const contactPhone = document.getElementById('partner-contact-phone').value.trim();
    const contactEmail = document.getElementById('partner-contact-email').value.trim();
    const contactLine = document.getElementById('partner-contact-line').value.trim();
    const contactFacebook = document.getElementById('partner-contact-facebook').value.trim();
    const contactAddress = document.getElementById('partner-contact-address').value.trim();
    const tier = document.getElementById('partner-tier').value;
    const category = document.getElementById('partner-category').value.trim();

    const logoFile = document.getElementById('partner-logo').files[0];
    const coverFile = document.getElementById('partner-cover').files[0];

    const fail = (text) => {
        msg.style.color = '#e74c3c';
        msg.textContent = text;
    };

    if (!name || name.length < 2 || name.length > 120) {
        fail('ชื่อพาร์ทเนอร์ต้องมี 2-120 ตัวอักษร');
        return;
    }
    if (description.length > 500) {
        fail('รายละเอียดพาร์ทเนอร์ต้องไม่เกิน 500 ตัวอักษร');
        return;
    }
    if (websiteUrl && !isValidHttpUrl(websiteUrl)) {
        fail('เว็บไซต์ต้องเป็น URL ที่ขึ้นต้นด้วย http:// หรือ https://');
        return;
    }
    if (contactEmail && !isValidEmail(contactEmail)) {
        fail('รูปแบบอีเมลไม่ถูกต้อง');
        return;
    }
    if (contactPhone && contactPhone.length > 30) {
        fail('เบอร์โทรศัพท์ต้องไม่เกิน 30 ตัวอักษร');
        return;
    }

    const logoError = validateImageFile(logoFile, 'โลโก้พาร์ทเนอร์', 5);
    if (logoError) {
        fail(logoError);
        return;
    }
    const coverError = validateImageFile(coverFile, 'ภาพหน้าปกพาร์ทเนอร์', 5);
    if (coverError) {
        fail(coverError);
        return;
    }

    const fd = new FormData();
    fd.append('name', name);
    fd.append('description', description);
    fd.append('website_url', websiteUrl);
    fd.append('contact_phone', contactPhone);
    fd.append('contact_email', contactEmail);
    fd.append('contact_line', contactLine);
    fd.append('contact_facebook', contactFacebook);
    fd.append('contact_address', contactAddress);
    fd.append('tier', tier);
    fd.append('category', category);
    if (logoFile)  fd.append('logo',  logoFile);
    if (coverFile) fd.append('cover', coverFile);
    try {
        msg.textContent = 'กำลังบันทึก...';
        const url    = editId ? `${API_BASE_URL}/api/partners/${editId}` : `${API_BASE_URL}/api/partners`;
        const method = editId ? 'PUT' : 'POST';
        const res  = await fetch(url, { method, body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
        msg.style.color = '#43A047';
        msg.textContent = editId ? 'อัปเดตสำเร็จ!' : 'เพิ่มพาร์ทเนอร์สำเร็จ!';
        const savedId = editId ? parseInt(editId) : data.id;
        await loadPartnersList();
        closePartnerDetailForm();
        if (savedId) selectPartner(savedId);
    } catch (err) {
        msg.style.color = '#e74c3c';
        msg.textContent = err.message;
    }
}

async function togglePartnerActive(id, currentActive) {
    try {
        await fetch(`${API_BASE_URL}/api/partners/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: currentActive ? 0 : 1 })
        });
        await loadPartnersList();
        selectPartner(id);
    } catch (e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
}

async function deletePartner(id) {
    if (!confirm('ปิดการใช้งานพาร์ทเนอร์นี้?')) return;
    try {
        await fetch(`${API_BASE_URL}/api/partners/${id}`, { method: 'DELETE' });
        window._selectedPartnerId = null;
        document.getElementById('partner-detail-content').style.display = 'none';
        document.getElementById('partner-detail-empty').style.display = 'block';
        await loadPartnersList();
    } catch (e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
}

function editJob(id) {
    const j = _jobCache.find(x => x.id === id);
    if (!j) return;
    document.getElementById('job-edit-id').value   = id;
    document.getElementById('job-title').value     = j.title || '';
    document.getElementById('job-type').value      = j.job_type || '';
    document.getElementById('job-location').value  = j.location || '';
    document.getElementById('job-salary').value    = j.salary_range || '';
    document.getElementById('job-desc').value      = j.description || '';
    document.getElementById('job-link').value      = j.link_url || '';
    document.getElementById('job-form-header').textContent = 'แก้ไข';
    document.getElementById('job-cancel-btn').style.display = '';
    document.getElementById('job-submit-btn').innerHTML = '<i class="fas fa-save"></i> บันทึกการแก้ไข';
    document.getElementById('job-title').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    updateJobPreview();
}

function resetJobForm() {
    document.getElementById('job-edit-id').value = '';
    ['job-title','job-type','job-location','job-salary','job-desc','job-link'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('job-form-msg').textContent = '';
    document.getElementById('job-form-header').textContent = 'เพิ่มใหม่';
    document.getElementById('job-cancel-btn').style.display = 'none';
    document.getElementById('job-submit-btn').innerHTML = '<i class="fas fa-plus"></i> เพิ่มตำแหน่งงาน';
    updateJobPreview();
}

async function submitJobForm() {
    const partnerId = window._editingPartnerId;
    if (!partnerId) return;
    const msg    = document.getElementById('job-form-msg');
    const editId = document.getElementById('job-edit-id').value;
    const title  = document.getElementById('job-title').value.trim();
    if (!title) { msg.style.color = '#e74c3c'; msg.textContent = 'กรุณากรอกชื่อตำแหน่ง'; return; }
    try {
        msg.textContent = 'กำลังบันทึก...';
        const body = {
            title,
            job_type:     document.getElementById('job-type').value.trim(),
            location:     document.getElementById('job-location').value.trim(),
            salary_range: document.getElementById('job-salary').value.trim(),
            description:  document.getElementById('job-desc').value.trim(),
            link_url:     document.getElementById('job-link').value.trim() || null,
        };
        const url    = editId
            ? `${API_BASE_URL}/api/partners/jobs/${editId}`
            : `${API_BASE_URL}/api/partners/${partnerId}/jobs`;
        const method = editId ? 'PUT' : 'POST';
        const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
        msg.style.color = '#43A047';
        msg.textContent = editId ? 'อัปเดตสำเร็จ!' : 'เพิ่มตำแหน่งงานสำเร็จ!';
        resetJobForm();
        loadPartnerJobs(partnerId);
    } catch (err) {
        msg.style.color = '#e74c3c';
        msg.textContent = err.message;
    }
}

let _annCache = [];
let _serviceCache = [];
let _jobCache = [];
let _projectCache = [];

async function loadPartnerAnnouncements(partnerId) {
    const el = document.getElementById('ann-list');
    if (!el || !partnerId) return;
    el.innerHTML = '<div style="color:#888;font-size:12px">กำลังโหลด...</div>';
    try {
        const res = await fetch(`${API_BASE_URL}/api/banners/admin/all?partner_id=${partnerId}&type=announcement`);
        const list = await res.json();
        _annCache = list;
        if (!list.length) { el.innerHTML = '<div style="color:#aaa;font-size:12px;text-align:center">ยังไม่มีประชาสัมพันธ์</div>'; return; }
        el.innerHTML = list.map(b => {
            // ── Stats ──
            const views  = b.view_count  ?? 0;
            const clicks = b.click_count ?? 0;
            const ctr    = views > 0 ? ((clicks / views) * 100).toFixed(1) + '%' : '—';

            // ── Status ──
            const now   = new Date();
            const start = b.start_date ? new Date(b.start_date) : null;
            const end   = b.end_date   ? new Date(b.end_date)   : null;
            let statusColor = '#10b981', statusLabel = 'Active';
            if (!b.is_active)                    { statusColor = '#6b7280'; statusLabel = 'Inactive'; }
            else if (start && now < start)        { statusColor = '#f59e0b'; statusLabel = 'Scheduled'; }
            else if (end   && now > end)          { statusColor = '#ef4444'; statusLabel = 'Expired'; }

            // ── Days remaining ──
            let daysLabel = '';
            if (end) {
                const diff = Math.ceil((end - now) / 86400000);
                daysLabel = diff > 0 ? `เหลือ ${diff} วัน` : 'หมดอายุแล้ว';
            } else {
                daysLabel = 'ไม่มีวันหมดอายุ';
            }

            const img = b.image_url
                ? `<img src="${resolveMediaUrl(b.image_url)}" style="width:52px;height:40px;object-fit:cover;border-radius:4px;flex-shrink:0" onerror="this.style.display='none'">`
                : `<div style="width:52px;height:40px;background:#eee;border-radius:4px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas fa-image" style="color:#bbb;font-size:14px"></i></div>`;

            return `
            <div style="background:#f9f9f9;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px">
                <div style="display:flex;align-items:center;gap:10px">
                    ${img}
                    <div style="flex:1;min-width:0">
                        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                            <span style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px">${escHtml(b.title || '(ไม่มีชื่อ)')}</span>
                            <span style="font-size:10px;font-weight:600;color:${statusColor};background:${statusColor}18;padding:1px 6px;border-radius:10px;white-space:nowrap">${statusLabel}</span>
                        </div>
                        <div style="font-size:10px;color:#888;margin-top:1px">${daysLabel}</div>
                    </div>
                    <button class="btn btn-check" style="font-size:10px;padding:3px 8px;flex-shrink:0" onclick="editAnnouncement(${b.id})"><i class="fas fa-pen"></i></button>
                    <button class="btn btn-del" style="font-size:10px;padding:3px 8px;flex-shrink:0" onclick="deleteAnnouncement(${b.id}, ${partnerId})"><i class="fas fa-trash"></i></button>
                </div>
                <div style="display:flex;gap:8px;margin-top:7px;padding-top:7px;border-top:1px solid #e5e7eb;flex-wrap:wrap">
                    <span style="font-size:11px;color:#555;display:flex;align-items:center;gap:4px"><i class="fas fa-eye" style="color:#6366f1"></i> <b>${views.toLocaleString()}</b> views</span>
                    <span style="font-size:11px;color:#555;display:flex;align-items:center;gap:4px"><i class="fas fa-hand-pointer" style="color:#10b981"></i> <b>${clicks.toLocaleString()}</b> clicks</span>
                    <span style="font-size:11px;color:#555;display:flex;align-items:center;gap:4px"><i class="fas fa-percent" style="color:#f59e0b"></i> CTR <b>${ctr}</b></span>
                </div>
            </div>`;
        }).join('');
    } catch (e) {
        el.innerHTML = '<div style="color:#e74c3c;font-size:12px">โหลดไม่ได้</div>';
    }
}

async function deleteAnnouncement(bannerId, partnerId) {
    if (!confirm('ลบประชาสัมพันธ์นี้?')) return;
    try {
        await fetch(`${API_BASE_URL}/api/banners/${bannerId}`, { method: 'DELETE' });
        loadPartnerAnnouncements(partnerId);
    } catch (e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
}

function editAnnouncement(id) {
    const b = _annCache.find(x => x.id === id);
    if (!b) return;
    document.getElementById('ann-edit-id').value = id;
    document.getElementById('ann-title').value = b.title || '';
    document.getElementById('ann-desc').value  = b.description || '';
    document.getElementById('ann-link').value  = b.link_url || '';
    document.getElementById('ann-start').value = b.start_date ? b.start_date.substring(0,10) : '';
    document.getElementById('ann-end').value   = b.end_date   ? b.end_date.substring(0,10)   : '';
    document.getElementById('ann-form-header').textContent = 'แก้ไข';
    document.getElementById('ann-cancel-btn').style.display = '';
    document.getElementById('ann-submit-btn').innerHTML = '<i class="fas fa-save"></i> บันทึกการแก้ไข';
    document.getElementById('ann-title').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    updateAnnouncementPreview();
}

function resetAnnouncementForm() {
    document.getElementById('ann-edit-id').value = '';
    ['ann-title','ann-desc','ann-link','ann-start','ann-end'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('ann-image').value = '';
    document.getElementById('ann-form-msg').textContent = '';
    document.getElementById('ann-form-header').textContent = 'เพิ่มใหม่';
    document.getElementById('ann-cancel-btn').style.display = 'none';
    document.getElementById('ann-submit-btn').innerHTML = '<i class="fas fa-plus"></i> เพิ่มประชาสัมพันธ์';
    updateAnnouncementPreview();
}

async function submitAnnouncementForm() {
    const partnerId = window._editingPartnerId;
    if (!partnerId) return;
    const msg    = document.getElementById('ann-form-msg');
    const editId = document.getElementById('ann-edit-id').value;
    const title  = document.getElementById('ann-title').value.trim();
    if (!title) { msg.style.color = '#e74c3c'; msg.textContent = 'กรุณากรอกหัวข้อ'; return; }
    try {
        msg.textContent = 'กำลังบันทึก...';
        const fd = new FormData();
        fd.append('partner_id',  partnerId);
        fd.append('banner_type', 'announcement');
        fd.append('title',       title);
        fd.append('description', document.getElementById('ann-desc').value.trim());
        fd.append('link_url',    document.getElementById('ann-link').value.trim());
        const start = document.getElementById('ann-start').value;
        const end   = document.getElementById('ann-end').value;
        if (start) fd.append('start_date', start);
        if (end)   fd.append('end_date',   end);
        const imgFile = document.getElementById('ann-image').files[0];
        if (imgFile) fd.append('image', imgFile);
        const url    = editId ? `${API_BASE_URL}/api/banners/${editId}` : `${API_BASE_URL}/api/banners`;
        const method = editId ? 'PUT' : 'POST';
        const res  = await fetch(url, { method, body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
        msg.style.color = '#27ae60';
        msg.textContent = editId ? 'อัปเดตสำเร็จ!' : 'เพิ่มประชาสัมพันธ์สำเร็จ!';
        resetAnnouncementForm();
        loadPartnerAnnouncements(partnerId);
    } catch (err) {
        msg.style.color = '#e74c3c';
        msg.textContent = err.message;
    }
}

function editService(id) {
    const s = _serviceCache.find(x => x.id === id);
    if (!s) return;
    document.getElementById('service-edit-id').value  = id;
    document.getElementById('service-title').value    = s.title || '';
    document.getElementById('service-desc').value     = s.description || '';
    document.getElementById('service-form-header').textContent = 'แก้ไข';
    document.getElementById('service-cancel-btn').style.display = '';
    document.getElementById('service-submit-btn').innerHTML = '<i class="fas fa-save"></i> บันทึกการแก้ไข';
    document.getElementById('service-title').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    updateServicePreview();
}

function resetServiceForm() {
    document.getElementById('service-edit-id').value = '';
    ['service-title','service-desc'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('service-image').value = '';
    document.getElementById('service-form-msg').textContent = '';
    document.getElementById('service-form-header').textContent = 'เพิ่มใหม่';
    document.getElementById('service-cancel-btn').style.display = 'none';
    document.getElementById('service-submit-btn').innerHTML = '<i class="fas fa-plus"></i> เพิ่มบริการ';
    updateServicePreview();
}

async function submitServiceForm() {
    const partnerId = window._editingPartnerId;
    if (!partnerId) return;
    const msg    = document.getElementById('service-form-msg');
    const editId = document.getElementById('service-edit-id').value;
    const title  = document.getElementById('service-title').value.trim();
    if (!title) { msg.style.color = '#e74c3c'; msg.textContent = 'กรุณากรอกชื่อบริการ'; return; }
    try {
        msg.textContent = 'กำลังบันทึก...';
        const fd = new FormData();
        fd.append('title',         title);
        fd.append('description',   document.getElementById('service-desc').value.trim());
        fd.append('display_order', '0');
        const imgFile = document.getElementById('service-image').files[0];
        if (imgFile) fd.append('image', imgFile);
        const url    = editId
            ? `${API_BASE_URL}/api/partners/services/${editId}`
            : `${API_BASE_URL}/api/partners/${partnerId}/services`;
        const method = editId ? 'PUT' : 'POST';
        const res  = await fetch(url, { method, body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
        msg.style.color = '#43A047';
        msg.textContent = editId ? 'อัปเดตสำเร็จ!' : 'เพิ่มบริการสำเร็จ!';
        resetServiceForm();
        loadPartnerServices(partnerId);
    } catch (err) {
        msg.style.color = '#e74c3c';
        msg.textContent = err.message;
    }
}

function editProject(id) {
    const p = _projectCache.find(x => x.id === id);
    if (!p) return;
    document.getElementById('project-edit-id').value = id;
    document.getElementById('project-title').value   = p.title || '';
    document.getElementById('project-desc').value    = p.description || '';
    document.getElementById('project-link').value    = p.link_url || '';
    document.getElementById('project-form-header').textContent = 'แก้ไข';
    document.getElementById('project-cancel-btn').style.display = '';
    document.getElementById('project-submit-btn').innerHTML = '<i class="fas fa-save"></i> บันทึกการแก้ไข';
    document.getElementById('project-title').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    updateProjectPreview();
}

function resetProjectForm() {
    document.getElementById('project-edit-id').value = '';
    ['project-title','project-desc','project-link'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('project-image').value = '';
    document.getElementById('project-form-msg').textContent = '';
    document.getElementById('project-form-header').textContent = 'เพิ่มใหม่';
    document.getElementById('project-cancel-btn').style.display = 'none';
    document.getElementById('project-submit-btn').innerHTML = '<i class="fas fa-plus"></i> เพิ่มโครงการ';
    updateProjectPreview();
}

async function submitProjectForm() {
    const partnerId = window._editingPartnerId;
    if (!partnerId) return;
    const msg    = document.getElementById('project-form-msg');
    const editId = document.getElementById('project-edit-id').value;
    const title  = document.getElementById('project-title').value.trim();
    if (!title) { msg.style.color = '#e74c3c'; msg.textContent = 'กรุณากรอกชื่อโครงการ'; return; }
    try {
        msg.textContent = 'กำลังบันทึก...';
        const fd = new FormData();
        fd.append('title',       title);
        fd.append('description', document.getElementById('project-desc').value.trim());
        fd.append('link_url',    document.getElementById('project-link').value.trim());
        const imgFile = document.getElementById('project-image').files[0];
        if (imgFile) fd.append('image', imgFile);
        const url    = editId
            ? `${API_BASE_URL}/api/partners/projects/${editId}`
            : `${API_BASE_URL}/api/partners/${partnerId}/projects`;
        const method = editId ? 'PUT' : 'POST';
        const res  = await fetch(url, { method, body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
        msg.style.color = '#43A047';
        msg.textContent = editId ? 'อัปเดตสำเร็จ!' : 'เพิ่มโครงการสำเร็จ!';
        resetProjectForm();
        loadPartnerProjects(partnerId);
    } catch (err) {
        msg.style.color = '#e74c3c';
        msg.textContent = err.message;
    }
}

// File preview helpers
document.addEventListener('DOMContentLoaded', () => {
    const pLogo = document.getElementById('partner-logo');
    if (pLogo) pLogo.addEventListener('change', () => previewFile(pLogo, 'partner-logo-preview'));
    const pCover = document.getElementById('partner-cover');
    if (pCover) pCover.addEventListener('change', () => previewFile(pCover, 'partner-cover-preview'));
    document.addEventListener('change', e => {
        if (e.target.id === 'banner-image') previewFile(e.target, 'banner-image-preview');
    });
});

function previewFile(input, previewId) {
    const file = input.files[0];
    const prev = document.getElementById(previewId);
    if (!file || !prev) return;
    const reader = new FileReader();
    reader.onload = e => { prev.src = e.target.result; prev.style.display = 'block'; };
    reader.readAsDataURL(file);
}

// ═══════════════════════════════════════════════════════════════
// HOME BANNERS MANAGEMENT
// ═══════════════════════════════════════════════════════════════

async function loadBannerPartnerOptions() {
    const sel = document.getElementById('banner-partner-id');
    if (!sel) return;
    try {
        const res = await fetch(`${API_BASE_URL}/api/partners`);
        const list = await res.json();
        sel.innerHTML = '<option value="">— ไม่ระบุ —</option>' +
            list.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('');
    } catch (_) {}
}

async function loadBannersList() {
    const el = document.getElementById('banners-list');
    if (!el) return;
    el.innerHTML = '<div style="text-align:center;padding:32px"><i class="fas fa-spinner fa-spin"></i> กำลังโหลด...</div>';
    const filterType = document.getElementById('banner-filter-type')?.value || '';
    try {
        let url = `${API_BASE_URL}/api/banners/admin/all`;
        const res = await fetch(url);
        let list = await res.json();
        if (filterType) list = list.filter(b => b.banner_type === filterType);
        renderBannersList(list);
    } catch (e) {
        el.innerHTML = `<div style="color:#e74c3c;padding:16px">เกิดข้อผิดพลาด: ${e.message}</div>`;
    }
}

const BANNER_TYPE_LABELS = {
    benefits: 'สิทธิประโยชน์',
    announcement: 'ประกาศสัมพันธ์',
    special_offer: 'โปรโมชั่นเด่น',
    sponsor: 'ผู้สนับสนุน',
    general: 'ทั่วไป',
};

function renderBannersList(list) {
    const el = document.getElementById('banners-list');
    if (!list.length) {
        el.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:40px">ยังไม่มีแบนเนอร์</div>';
        return;
    }
    el.innerHTML = list.map(b => {
        const imgUrl = b.image_url ? resolveMediaUrl(b.image_url) : '';
        const typeLabel = BANNER_TYPE_LABELS[b.banner_type] || b.banner_type || '-';
        const active = b.is_active ? '<span style="color:#27ae60">● Active</span>' : '<span style="color:#e74c3c">● Inactive</span>';
        const dates = [b.start_date, b.end_date].filter(Boolean).join(' → ') || '-';
        return `
        <div style="border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:12px;display:flex;gap:14px;align-items:flex-start">
            <div style="flex-shrink:0;width:80px;height:56px;border-radius:6px;overflow:hidden;background:var(--bg-2);display:flex;align-items:center;justify-content:center">
                ${imgUrl ? `<img src="${imgUrl}" style="width:100%;height:100%;object-fit:cover">` : '<i class="fas fa-image" style="font-size:22px;color:var(--text-muted)"></i>'}
            </div>
            <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:14px">${escHtml(b.title || '(ไม่มีชื่อ)')}</div>
                <div style="font-size:12px;margin-top:2px;display:flex;gap:8px;flex-wrap:wrap">
                    <span style="background:var(--bg-2);padding:2px 8px;border-radius:10px">${typeLabel}</span>
                    ${b.partner_name ? `<span style="color:var(--text-muted)">${escHtml(b.partner_name)}</span>` : ''}
                </div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:4px">📅 ${dates} · ลำดับ: ${b.display_order ?? 0}</div>
                <div style="font-size:12px;margin-top:2px">${active}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
                <button class="btn btn-primary" style="font-size:11px;padding:4px 10px" onclick="editBanner(${b.id})"><i class="fas fa-pen"></i> แก้ไข</button>
                <button class="btn" style="font-size:11px;padding:4px 10px" onclick="toggleBannerActive(${b.id}, ${b.is_active})">${b.is_active ? '<i class="fas fa-eye-slash"></i> ปิด' : '<i class="fas fa-eye"></i> เปิด'}</button>
                <button class="btn btn-del" style="font-size:11px;padding:4px 10px" onclick="deleteBanner(${b.id})"><i class="fas fa-trash"></i> ลบ</button>
            </div>
        </div>`;
    }).join('');
}

let _bannersList = [];

async function editBanner(id) {
    // Fetch fresh from admin/all list already loaded, or re-fetch
    try {
        const res = await fetch(`${API_BASE_URL}/api/banners/admin/all`);
        _bannersList = await res.json();
        const b = _bannersList.find(x => x.id === id);
        if (!b) return;
        document.getElementById('banner-edit-id').value = id;
        document.getElementById('banner-form-title').textContent = 'แก้ไขแบนเนอร์';
        document.getElementById('banner-title').value = b.title || '';
        document.getElementById('banner-description').value = b.description || '';
        document.getElementById('banner-type').value = b.banner_type || 'general';
        document.getElementById('banner-partner-id').value = b.partner_id || '';
        document.getElementById('banner-link').value = b.link_url || '';
        document.getElementById('banner-start').value = b.start_date ? b.start_date.substring(0, 10) : '';
        document.getElementById('banner-end').value = b.end_date ? b.end_date.substring(0, 10) : '';
        document.getElementById('banner-order').value = b.display_order ?? 0;
        if (b.image_url) {
            const prev = document.getElementById('banner-image-preview');
            prev.src = resolveMediaUrl(b.image_url);
            prev.style.display = 'block';
        }
        document.getElementById('banner-form').scrollIntoView({ behavior: 'smooth' });
    } catch (e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
}

// ═══════════════════════════════════════════════════════════════════════════
// ARTICLE MANAGER
// ═══════════════════════════════════════════════════════════════════════════

function articlesShowTab(tab) {
    ['pending', 'approved', 'create'].forEach(t => {
        const panel = document.getElementById('articles-panel-' + t);
        const btn   = document.getElementById('articles-tab-' + t);
        if (panel) panel.style.display = (t === tab) ? 'block' : 'none';
        if (btn)   { btn.classList.toggle('active', t === tab); }
    });
    if (tab === 'pending')  loadArticlesAdmin('pending');
    if (tab === 'approved') loadArticlesAdmin('approved');
    if (tab === 'create')   loadArticlePartners();
}

function getAdminToken() {
    return localStorage.getItem('elderspace_admin_token') || '';
}

async function loadArticlesAdmin(status) {
    const containerId = status === 'pending' ? 'articles-pending-list' : 'articles-approved-list';
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i> กำลังโหลด...</div>';

    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/articles?status=${status}&limit=100`, {
            headers: { 'Authorization': 'Bearer ' + getAdminToken() }
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const articles = data.articles || [];

        // Update pending badge
        if (status === 'pending') {
            const badge  = document.getElementById('articles-pending-badge');
            const navBdg = document.getElementById('articles-pending-count');
            if (badge)  { badge.textContent = articles.length; badge.style.display = articles.length ? 'inline' : 'none'; }
            if (navBdg) { navBdg.textContent = articles.length; navBdg.style.display = articles.length ? 'inline' : 'none'; }
        }

        if (!articles.length) {
            container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-secondary);">ไม่มีบทความในสถานะนี้</div>';
            return;
        }

        container.innerHTML = articles.map(a => _renderArticleRow(a, status)).join('');
    } catch (e) {
        container.innerHTML = `<div style="text-align:center;padding:1.5rem;color:var(--accent-red,#e53935);">โหลดไม่สำเร็จ: ${e.message}</div>`;
    }
}

function _renderArticleRow(a, status) {
    const coverHtml = a.cover_image
        ? `<img src="${resolveMediaUrl(a.cover_image)}" style="width:72px;height:52px;object-fit:cover;border-radius:6px;flex-shrink:0;" onerror="this.style.display='none'">`
        : `<div style="width:72px;height:52px;background:var(--bg-card-alt);border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fas fa-image" style="color:var(--text-muted);"></i></div>`;

    const submitter = a.source_type === 'partner'
        ? `<span style="color:var(--accent-blue,#1565c0);font-size:0.8rem;"><i class="fas fa-handshake"></i> ${a.partner_name || 'พาทเนอร์'}</span>`
        : `<span style="color:var(--accent-orange,#f57c00);font-size:0.8rem;"><i class="fas fa-user"></i> ${a.submitter_name || a.author_name} ${a.submitter_phone ? '('+a.submitter_phone+')' : ''}</span>`;

    const catBadge = `<span style="background:var(--bg-card-alt);padding:2px 8px;border-radius:999px;font-size:0.75rem;">${a.category}</span>`;

    const approveBtn = status === 'pending'
        ? `<button class="btn btn-check" style="padding:0.3rem 0.8rem;font-size:0.82rem;" onclick="adminApproveArticle(${a.article_id})"><i class="fas fa-check"></i> อนุมัติ</button>
           <button class="btn btn-del" style="padding:0.3rem 0.8rem;font-size:0.82rem;" onclick="adminRejectArticle(${a.article_id})"><i class="fas fa-times"></i> ปฏิเสธ</button>`
        : '';
    const deleteBtn = `<button class="btn btn-del" style="padding:0.3rem 0.7rem;font-size:0.82rem;" onclick="adminDeleteArticle(${a.article_id})" title="ลบบทความ"><i class="fas fa-trash"></i></button>`;

    const previewBtn = `<button class="btn btn-ghost" style="padding:0.3rem 0.8rem;font-size:0.82rem;" onclick="adminViewArticle(${a.article_id})"><i class="fas fa-eye"></i> ดู</button>`;
    const editBtn = `<button class="btn btn-ghost" style="padding:0.3rem 0.8rem;font-size:0.82rem;" onclick="adminEditArticle(${a.article_id})"><i class="fas fa-edit"></i> แก้ไข</button>`;

    return `
    <div id="article-row-${a.article_id}" style="display:flex;gap:1rem;align-items:flex-start;padding:1rem;border-bottom:1px solid var(--border);flex-wrap:wrap;">
        ${coverHtml}
        <div style="flex:1;min-width:200px;">
            <div style="font-weight:700;margin-bottom:2px;">${a.title}</div>
            <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:4px;">โดย ${a.author_name} &nbsp;${submitter}</div>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;">
                ${catBadge}
                <span style="font-size:0.75rem;color:var(--text-muted);">${new Date(a.created_at).toLocaleDateString('th-TH')}</span>
            </div>
            ${a.summary ? `<div style="font-size:0.82rem;color:var(--text-secondary);margin-top:6px;line-height:1.5;">${a.summary.substring(0,120)}${a.summary.length>120?'…':''}</div>` : ''}
            <div style="display:flex;gap:0.75rem;margin-top:6px;flex-wrap:wrap;">
                <span title="Views" style="font-size:0.78rem;color:var(--text-muted);"><i class="fas fa-eye"></i> ${a.view_count||0}</span>
                <span title="Likes" style="font-size:0.78rem;color:var(--text-muted);"><i class="fas fa-heart"></i> ${a.like_count||0}</span>
                <span title="Comments" style="font-size:0.78rem;color:var(--text-muted);"><i class="fas fa-comment"></i> ${a.comment_count||0}</span>
                <span title="Shares" style="font-size:0.78rem;color:var(--text-muted);"><i class="fas fa-share"></i> ${a.share_count||0}</span>
            </div>
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;flex-shrink:0;">
            ${approveBtn}
            ${previewBtn}
            ${editBtn}
            ${deleteBtn}
        </div>
    </div>`;
}

async function adminApproveArticle(id) {
    if (!confirm('อนุมัติบทความนี้ใช่ไหม? บทความจะแสดงในแอพทันที')) return;
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/articles/${id}/approve`, {
            method: 'PATCH',
            headers: { 'Authorization': 'Bearer ' + getAdminToken() }
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const row = document.getElementById('article-row-' + id);
        if (row) row.remove();
        // update badge count
        const badge = document.getElementById('articles-pending-badge');
        if (badge) { const n = Math.max(0, parseInt(badge.textContent||'0') - 1); badge.textContent = n; badge.style.display = n ? 'inline' : 'none'; }
        const navBdg = document.getElementById('articles-pending-count');
        if (navBdg) { const n = Math.max(0, parseInt(navBdg.textContent||'0') - 1); navBdg.textContent = n; navBdg.style.display = n ? 'inline' : 'none'; }
        showToast('อนุมัติบทความสำเร็จ ✅');
    } catch (e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
}

async function adminRejectArticle(id) {
    if (!confirm('ปฏิเสธบทความนี้?')) return;
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/articles/${id}/reject`, {
            method: 'PATCH',
            headers: { 'Authorization': 'Bearer ' + getAdminToken() }
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const row = document.getElementById('article-row-' + id);
        if (row) row.remove();
        showToast('ปฏิเสธบทความแล้ว');
    } catch (e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
}

async function adminDeleteArticle(id) {
    if (!confirm('ลบบทความนี้? (soft delete — สามารถกู้คืนได้จาก DB)')) return;
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/articles/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + getAdminToken() }
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const row = document.getElementById('article-row-' + id);
        if (row) row.remove();
        showToast('ลบบทความแล้ว');
    } catch (e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
}

async function adminViewArticle(id) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/articles/${id}`, {
            headers: { 'Authorization': 'Bearer ' + getAdminToken() }
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const a = await res.json();

        const isPartner = a.source_type === 'partner';
        const authorDisplay = isPartner
            ? (a.partner_name || a.author_name || '')
            : (a.submitter_name || a.author_name || '');
        const badgeLabel = a.badge_label || (isPartner ? 'ได้รับการสนับสนุน' : 'นักเขียนมือทอง');

        // AppBar title
        document.getElementById('afp-appbar-title').textContent = a.title || 'บทความ';

        // Clock
        const now = new Date();
        document.getElementById('afp-time').textContent =
            now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');

        // Cover image
        const coverUrl = a.cover_image ? resolveMediaUrl(a.cover_image) : '';
        const coverWrap = document.getElementById('afp-cover-wrap');
        const coverImg = document.getElementById('afp-cover-img');
        if (coverUrl) {
            coverImg.src = coverUrl;
            coverWrap.style.display = 'block';
        } else {
            coverWrap.style.display = 'none';
        }

        // Badge
        document.getElementById('afp-badge-icon').textContent = isPartner ? '❤️' : '🏆';
        document.getElementById('afp-badge-icon').style.background = isPartner ? '#e8f5e9' : '#fff3e0';
        document.getElementById('afp-badge-label').textContent = badgeLabel;
        document.getElementById('afp-badge-label').style.color = isPartner ? '#1565C0' : '#e65100';
        document.getElementById('afp-author').textContent = 'โดย ' + (authorDisplay || '-');

        // Title & Headline
        document.getElementById('afp-title').textContent = a.title || '';
        const headlineEl = document.getElementById('afp-headline');
        if (a.headline) {
            headlineEl.textContent = a.headline;
            headlineEl.style.display = 'block';
        } else {
            headlineEl.style.display = 'none';
        }

        // Stats
        document.getElementById('afp-views').textContent = a.view_count || 0;
        document.getElementById('afp-likes').textContent = a.like_count || 0;
        document.getElementById('afp-comments').textContent = a.comment_count || 0;
        document.getElementById('afp-shares').textContent = a.share_count || 0;
        document.getElementById('afp-action-likes').textContent = a.like_count || 0;
        document.getElementById('afp-action-comments').textContent = a.comment_count || 0;
        document.getElementById('afp-action-shares').textContent = a.share_count || 0;

        // Sections
        const sections = [
            { wrap: 'afp-intro-section', text: 'afp-intro-text', val: a.introduction },
            { wrap: 'afp-body-section',  text: 'afp-body-text',  val: a.body },
            { wrap: 'afp-conclusion-section', text: 'afp-conclusion-text', val: a.conclusion },
        ];
        sections.forEach(({ wrap, text, val }) => {
            const wEl = document.getElementById(wrap);
            const tEl = document.getElementById(text);
            if (val && val.trim()) {
                tEl.textContent = val;
                wEl.style.display = 'block';
            } else {
                wEl.style.display = 'none';
            }
        });

        // Scroll body to top
        document.getElementById('afp-scroll-body').scrollTop = 0;

        document.getElementById('article-flutter-preview-modal').style.display = 'flex';
    } catch (e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
}

function closeArticleFlutterPreview() {
    document.getElementById('article-flutter-preview-modal').style.display = 'none';
}

async function loadPartnerArticles(partnerId) {
    const el = document.getElementById('partner-articles-list');
    if (!el) return;
    el.innerHTML = '<div style="color:#aaa;font-size:12px"><i class="fas fa-spinner fa-spin"></i> โหลด...</div>';
    try {
        const partner = (_partnersList || []).find(p => p.id === partnerId);
        const partnerName = partner ? (partner.name || '') : '';
        if (!partnerName) {
            el.innerHTML = '<div style="color:#aaa;font-size:13px;text-align:center;padding:20px">ไม่พบข้อมูลพาทเนอร์</div>';
            return;
        }
        const res = await fetch(
            `${API_BASE_URL}/api/admin/articles?source_type=partner&partner_name=${encodeURIComponent(partnerName)}&limit=100`,
            { headers: getAuthHeaders() }
        );
        const data = await res.json();
        const list = data.articles || [];
        const count = document.getElementById('ptab-count-articles');
        if (count) { count.textContent = list.length || ''; count.style.display = list.length ? '' : 'none'; }
        if (!list.length) {
            el.innerHTML = '<div style="color:#aaa;font-size:13px;text-align:center;padding:20px">ยังไม่มีบทความของพาทเนอร์นี้</div>';
            return;
        }
        el.innerHTML = list.map(a => _renderArticleRow(a, 'approved')).join('');
    } catch (e) {
        el.innerHTML = `<div style="color:red;font-size:12px">โหลดไม่สำเร็จ: ${e.message}</div>`;
    }
}

async function adminEditArticle(id) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/articles/${id}`, {
            headers: getAuthHeaders()
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const a = await res.json();
        document.getElementById('edit-art-id').value = a.article_id;
        document.getElementById('edit-art-title').value = a.title || '';
        document.getElementById('edit-art-category').value = a.category || 'สุขภาพ';
        document.getElementById('edit-art-summary').value = a.summary || '';
        document.getElementById('edit-art-headline').value = a.headline || '';
        document.getElementById('edit-art-intro').value = a.introduction || '';
        document.getElementById('edit-art-body').value = a.body || '';
        document.getElementById('edit-art-conclusion').value = a.conclusion || '';
        document.getElementById('edit-art-image').value = '';
        document.getElementById('edit-art-msg').style.display = 'none';
        document.getElementById('edit-article-modal').style.display = 'block';
    } catch (e) { alert('โหลดข้อมูลไม่สำเร็จ: ' + e.message); }
}

function closeEditArticleModal() {
    document.getElementById('edit-article-modal').style.display = 'none';
}

async function saveEditArticle() {
    const id = document.getElementById('edit-art-id').value;
    const btn = document.getElementById('edit-art-save-btn');
    const msg = document.getElementById('edit-art-msg');
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';
    msg.style.display = 'none';
    try {
        const form = new FormData();
        form.append('title',        document.getElementById('edit-art-title').value.trim());
        form.append('category',     document.getElementById('edit-art-category').value);
        form.append('summary',      document.getElementById('edit-art-summary').value.trim());
        form.append('headline',     document.getElementById('edit-art-headline').value.trim());
        form.append('introduction', document.getElementById('edit-art-intro').value.trim());
        form.append('body',         document.getElementById('edit-art-body').value.trim());
        form.append('conclusion',   document.getElementById('edit-art-conclusion').value.trim());
        const imgFile = document.getElementById('edit-art-image').files[0];
        if (imgFile) form.append('cover_image', imgFile);

        const res = await fetch(`${API_BASE_URL}/api/admin/articles/${id}`, {
            method: 'PUT',
            headers: { 'Authorization': 'Bearer ' + getAdminToken() },
            body: form
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);

        msg.style.cssText = 'display:block;background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;padding:10px 14px;border-radius:8px;font-size:13px';
        msg.textContent = '✅ บันทึกสำเร็จ';
        showToast('บันทึกบทความสำเร็จ ✅');
        setTimeout(() => closeEditArticleModal(), 1000);
    } catch (e) {
        msg.style.cssText = 'display:block;background:#ffebee;color:#c62828;border:1px solid #ef9a9a;padding:10px 14px;border-radius:8px;font-size:13px';
        msg.textContent = '❌ ' + e.message;
    } finally {
        btn.disabled = false;
        btn.textContent = 'บันทึก';
    }
}

async function loadArticlePartners() {
    const sel = document.getElementById('art-partner-select');
    if (!sel) return;
    try {
        const res = await fetch(`${API_BASE_URL}/api/partners/admin/all`, {
            headers: { 'Authorization': 'Bearer ' + getAdminToken() }
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const partners = data.partners || data || [];
        const current = sel.value;
        sel.innerHTML = '<option value="">-- เลือกพาทเนอร์ --</option>' +
            partners.map(p => `<option value="${p.name || p.partner_name}" data-logo="${p.logo_url || ''}">${p.name || p.partner_name}</option>`).join('');
        if (current) sel.value = current;
        onPartnerSelectChange(sel);
    } catch (e) {
        console.warn('loadArticlePartners failed:', e.message);
    }
}

function onPartnerSelectChange(sel) {
    const preview = document.getElementById('art-partner-preview');
    if (!preview) return;
    const opt = sel.options[sel.selectedIndex];
    if (!opt || !opt.value) {
        preview.style.display = 'none';
        updateArticlePreview();
        return;
    }
    const logo = opt.getAttribute('data-logo') || '';
    const name = opt.value;
    preview.style.display = 'flex';
    preview.innerHTML = (logo
        ? `<img src="${resolveMediaUrl(logo)}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;margin-right:8px;" onerror="this.style.display='none'">`
        : `<i class="fas fa-handshake" style="margin-right:8px;color:#1565c0;"></i>`) +
        `<span style="font-weight:600;">${name}</span>` +
        `<span style="margin-left:8px;background:#e8f5e9;color:#2e7d32;padding:2px 8px;border-radius:999px;font-size:0.75rem;font-weight:600;">ได้รับการสนับสนุน</span>`;
    updateArticlePreview();
}

// ── Live "Preview (in-app)" mocks for announcements/services/jobs/projects/ads/campaigns ──
// Mirrors updateArticlePreview() below: read form fields, write into a hand-built clone of the
// real Flutter card, using FileReader for instant image preview and window._partnerDetailData
// for the currently-selected partner's name/logo.

function _dpvPartner() {
    return window._partnerDetailData || {};
}

function _dpvSetText(id, val, placeholder) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = val || placeholder;
    el.classList.toggle('dpv-placeholder', !val);
}

function _dpvPreviewImage(wrapId, file, fallbackUrl, iconClass) {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;
    if (file) {
        const reader = new FileReader();
        reader.onload = e => { wrap.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;display:block;">`; };
        reader.readAsDataURL(file);
    } else if (fallbackUrl) {
        wrap.innerHTML = `<img src="${resolveMediaUrl(fallbackUrl)}" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.parentElement.innerHTML='<i class=\\'${iconClass}\\'></i>'">`;
    } else {
        wrap.innerHTML = `<i class="${iconClass}"></i>`;
    }
}

function updateAnnouncementPreview() {
    const title = (document.getElementById('ann-title')?.value || '').trim();
    const desc  = (document.getElementById('ann-desc')?.value || '').trim();
    const editId = document.getElementById('ann-edit-id')?.value;
    const cached = editId ? _annCache.find(x => String(x.id) === String(editId)) : null;
    const file = document.getElementById('ann-image')?.files?.[0];

    _dpvSetText('pvw-ann-title', title, 'ชื่อประชาสัมพันธ์...');
    _dpvSetText('pvw-ann-desc', desc, 'รายละเอียดจะปรากฏที่นี่...');
    const partnerEl = document.getElementById('pvw-ann-partner');
    if (partnerEl) partnerEl.textContent = _dpvPartner().name || 'พาร์ทเนอร์';
    _dpvPreviewImage('pvw-ann-img', file, cached?.image_url, 'fas fa-image');
}

function updateServicePreview() {
    const title = (document.getElementById('service-title')?.value || '').trim();
    const editId = document.getElementById('service-edit-id')?.value;
    const cached = editId ? _serviceCache.find(x => String(x.id) === String(editId)) : null;
    const file = document.getElementById('service-image')?.files?.[0];

    _dpvSetText('pvw-svc-title', title, 'ชื่อบริการ...');
    _dpvPreviewImage('pvw-svc-img', file, cached?.image_url, 'fas fa-image');
}

function updateJobPreview() {
    const title    = (document.getElementById('job-title')?.value || '').trim();
    const type     = (document.getElementById('job-type')?.value || '').trim();
    const location = (document.getElementById('job-location')?.value || '').trim();
    const salary   = (document.getElementById('job-salary')?.value || '').trim();
    const link     = (document.getElementById('job-link')?.value || '').trim();
    const partner  = _dpvPartner();

    _dpvSetText('pvw-job-title', title, 'ชื่อตำแหน่ง...');
    const partnerEl = document.getElementById('pvw-job-partner');
    if (partnerEl) partnerEl.textContent = partner.name || 'พาร์ทเนอร์';

    const logoWrap = document.getElementById('pvw-job-logo');
    if (logoWrap) {
        if (partner.logo_url) logoWrap.innerHTML = `<img src="${resolveMediaUrl(partner.logo_url)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-store\\'></i>'">`;
        else logoWrap.innerHTML = '<i class="fas fa-store"></i>';
    }

    const typeEl = document.getElementById('pvw-job-type');
    if (typeEl) { typeEl.textContent = type; typeEl.style.display = type ? 'inline-block' : 'none'; }
    const locEl = document.getElementById('pvw-job-location');
    if (locEl) { locEl.textContent = location; locEl.style.display = location ? 'inline-block' : 'none'; }

    const salaryEl = document.getElementById('pvw-job-salary');
    if (salaryEl) {
        salaryEl.style.display = salary ? 'flex' : 'none';
        salaryEl.innerHTML = `<i class="fas fa-sack-dollar"></i>&nbsp;${escapeHtml(salary)}`;
    }

    const btnEl = document.getElementById('pvw-job-btn');
    if (btnEl) {
        btnEl.textContent = 'สมัคร';
        btnEl.style.background = link ? '#1565C0' : '#bbb';
    }
}

function updateProjectPreview() {
    const title = (document.getElementById('project-title')?.value || '').trim();
    const desc  = (document.getElementById('project-desc')?.value || '').trim();
    const editId = document.getElementById('project-edit-id')?.value;
    const cached = editId ? _projectCache.find(x => String(x.id) === String(editId)) : null;
    const file = document.getElementById('project-image')?.files?.[0];

    _dpvSetText('pvw-proj-title', title, 'ชื่อโครงการ...');
    _dpvSetText('pvw-proj-desc', desc, 'รายละเอียดจะปรากฏที่นี่...');
    const partnerEl = document.getElementById('pvw-proj-partner');
    if (partnerEl) partnerEl.textContent = _dpvPartner().name || 'พาร์ทเนอร์';

    const wrap = document.getElementById('pvw-proj-img');
    if (wrap) {
        if (file) {
            const reader = new FileReader();
            reader.onload = e => { wrap.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;display:block;">`; };
            reader.readAsDataURL(file);
        } else if (cached?.image_url) {
            wrap.innerHTML = `<img src="${resolveMediaUrl(cached.image_url)}" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-hand-holding-heart\\'></i>'">`;
        } else {
            wrap.innerHTML = '<i class="fas fa-hand-holding-heart"></i>';
        }
    }
}

function updateAdPreview() {
    const fmt   = document.getElementById('p-ad-format')?.value || 'popup';
    const title = (document.getElementById('p-ad-title')?.value || '').trim();
    const body  = (document.getElementById('p-ad-body')?.value || '').trim();
    const cta   = (document.getElementById('p-ad-cta')?.value || '').trim() || 'ดูเพิ่มเติม';
    const editId = document.getElementById('p-ad-edit-id')?.value;
    const cached = editId ? _partnerAdsCache.find(x => String(x.id) === String(editId)) : null;
    const file = document.getElementById('p-ad-image')?.files?.[0];
    const partner = _dpvPartner();

    // Toggle which sub-mock is visible
    document.getElementById('pvw-ad-popup').style.display   = fmt === 'popup'        ? 'block' : 'none';
    document.getElementById('pvw-ad-notif').style.display   = fmt === 'notification' ? 'flex'  : 'none';
    document.getElementById('pvw-ad-article').style.display = fmt === 'article'      ? 'block' : 'none';
    document.getElementById('pvw-ad-notif-note').style.display = fmt === 'notification' ? 'block' : 'none';

    if (fmt === 'popup') {
        _dpvSetText('pvw-ad-popup-title', title, 'หัวข้อโฆษณา...');
        _dpvSetText('pvw-ad-popup-body-text', body, 'เนื้อหาโฆษณาจะปรากฏที่นี่...');
        const partnerEl = document.getElementById('pvw-ad-popup-partner');
        if (partnerEl) partnerEl.textContent = partner.name || 'พาร์ทเนอร์';
        const ctaEl = document.getElementById('pvw-ad-popup-cta');
        if (ctaEl) ctaEl.textContent = cta;
        _dpvPreviewImage('pvw-ad-popup-img', file, cached?.image_url, 'fas fa-image');
    } else if (fmt === 'notification') {
        _dpvSetText('pvw-ad-notif-title', title, 'หัวข้อโฆษณา...');
        _dpvSetText('pvw-ad-notif-body', body, 'เนื้อหาโฆษณาจะปรากฏที่นี่...');
    } else if (fmt === 'article') {
        _dpvSetText('pvw-ad-article-title', title, 'หัวข้อโฆษณา...');
        _dpvSetText('pvw-ad-article-text', body, 'เนื้อหาโฆษณาจะปรากฏที่นี่...');
        const partnerEl = document.getElementById('pvw-ad-article-partner');
        if (partnerEl) partnerEl.textContent = partner.name || 'พาร์ทเนอร์';
        const ctaEl = document.getElementById('pvw-ad-article-cta');
        if (ctaEl) ctaEl.textContent = cta;
        _dpvPreviewImage('pvw-ad-article-img', file, cached?.image_url, 'fas fa-image');
    }
}

function updateRewardPreview() {
    const name   = (document.getElementById('reward-name')?.value || '').trim();
    const desc   = (document.getElementById('reward-description')?.value || '').trim();
    const points = document.getElementById('reward-points')?.value || '0';
    const file   = document.getElementById('reward-image')?.files?.[0];
    const fallbackImg = document.getElementById('reward-create-form')?.dataset.imageUrl || null;

    _dpvSetText('pvw-reward-name', name, 'ชื่อรางวัล...');
    const descEl = document.getElementById('pvw-reward-desc');
    if (descEl) { descEl.textContent = desc; descEl.style.display = desc ? 'block' : 'none'; }
    const ptsEl = document.getElementById('pvw-reward-pts');
    if (ptsEl) ptsEl.innerHTML = `<i class="fas fa-star" style="color:#f9a825;"></i> ${points || 0}`;
    _dpvPreviewImage('pvw-reward-img', file, fallbackImg, 'fas fa-gift');
}

function updateArticlePreview() {
    const title      = (document.getElementById('art-title')?.value || '').trim();
    const headline   = (document.getElementById('art-headline')?.value || '').trim();
    const summary    = (document.getElementById('art-summary')?.value || '').trim();
    const intro      = (document.getElementById('art-intro')?.value || '').trim();
    const body       = (document.getElementById('art-body')?.value || '').trim();
    const conclusion = (document.getElementById('art-conclusion')?.value || '').trim();
    const catOpt     = document.getElementById('art-category');
    const catText    = catOpt ? catOpt.options[catOpt.selectedIndex]?.text || '' : '';
    const partnerSel = document.getElementById('art-partner-select');
    const partnerOpt = partnerSel ? partnerSel.options[partnerSel.selectedIndex] : null;
    const partnerName = partnerOpt?.value || '';
    const partnerLogo = partnerOpt?.getAttribute('data-logo') || '';
    const imgFile    = document.getElementById('art-image')?.files?.[0];

    // Title
    const pvwTitle = document.getElementById('pvw-title');
    if (pvwTitle) {
        pvwTitle.textContent = title || 'ชื่อบทความ...';
        pvwTitle.classList.toggle('art-preview-placeholder', !title);
    }

    // Headline
    const pvwHeadline = document.getElementById('pvw-headline');
    if (pvwHeadline) {
        pvwHeadline.textContent = headline;
        pvwHeadline.style.display = headline ? 'block' : 'none';
    }

    // Summary
    const pvwSummary = document.getElementById('pvw-summary');
    if (pvwSummary) {
        pvwSummary.textContent = summary || 'เรื่องย่อจะปรากฏที่นี่...';
        pvwSummary.classList.toggle('art-preview-placeholder', !summary);
    }

    // Category badge
    const pvwCat = document.getElementById('pvw-cat');
    if (pvwCat) pvwCat.textContent = catText;

    // Partner
    const pvwPartnerName = document.getElementById('pvw-partner-name');
    const pvwPartnerLogo = document.getElementById('pvw-partner-logo');
    const pvwPartnerIcon = document.getElementById('pvw-partner-icon');
    if (pvwPartnerName) {
        pvwPartnerName.textContent = partnerName || 'เลือกพาทเนอร์...';
        pvwPartnerName.classList.toggle('art-preview-placeholder', !partnerName);
    }
    if (pvwPartnerLogo && pvwPartnerIcon) {
        if (partnerLogo) {
            pvwPartnerLogo.src = resolveMediaUrl(partnerLogo);
            pvwPartnerLogo.style.display = 'block';
            pvwPartnerIcon.style.display = 'none';
        } else {
            pvwPartnerLogo.style.display = 'none';
            pvwPartnerIcon.style.display = 'inline';
        }
    }

    // Cover image
    const pvwImgWrap = document.getElementById('pvw-img-wrap');
    if (pvwImgWrap) {
        if (imgFile) {
            const reader = new FileReader();
            reader.onload = e => {
                pvwImgWrap.innerHTML = `<img src="${e.target.result}" style="width:100%;height:160px;object-fit:cover;display:block;">`;
            };
            reader.readAsDataURL(imgFile);
        } else {
            pvwImgWrap.innerHTML = '<i class="fas fa-image"></i>';
        }
    }

    // Full content sections
    const setSection = (wrapId, textId, val) => {
        const wrap = document.getElementById(wrapId);
        const el   = document.getElementById(textId);
        if (!wrap || !el) return;
        if (val) { el.textContent = val; wrap.style.display = 'block'; }
        else { wrap.style.display = 'none'; }
    };
    setSection('pvw-intro-wrap',      'pvw-intro',      intro);
    setSection('pvw-body-wrap',       'pvw-body',       body);
    setSection('pvw-conclusion-wrap', 'pvw-conclusion', conclusion);

    const emptyHint = document.getElementById('pvw-empty-hint');
    if (emptyHint) emptyHint.style.display = (intro || body || conclusion) ? 'none' : 'block';
}

async function adminCreateArticle(e) {
    e.preventDefault();
    const btn = document.getElementById('article-create-btn');
    const msg = document.getElementById('article-create-msg');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังโพส...';
    msg.style.display = 'none';

    try {
        const form = new FormData();
        const partnerName = document.getElementById('art-partner-select').value.trim();
        const title = document.getElementById('art-title').value.trim();
        const summary = document.getElementById('art-summary').value.trim();
        const headline = document.getElementById('art-headline').value.trim();
        const introduction = document.getElementById('art-intro').value.trim();
        const body = document.getElementById('art-body').value.trim();
        const conclusion = document.getElementById('art-conclusion').value.trim();
        const imgFile = document.getElementById('art-image').files[0];

        if (!partnerName) {
            throw new Error('กรุณาเลือกพาทเนอร์');
        }

        if (!title || title.length < 5 || title.length > 180) {
            throw new Error('ชื่อบทความต้องมี 5-180 ตัวอักษร');
        }

        if (!body || body.length < 20 || body.length > 12000) {
            throw new Error('เนื้อหาหลักต้องมี 20-12000 ตัวอักษร');
        }

        if (summary.length > 2000 || headline.length > 300 || introduction.length > 4000 || conclusion.length > 4000) {
            throw new Error('ความยาวข้อมูลบางช่องเกินกว่าที่ระบบกำหนด');
        }

        const articleImageError = validateImageFile(imgFile, 'รูปบทความ', 5);
        if (articleImageError) {
            throw new Error(articleImageError);
        }

        form.append('title', title);
        form.append('partner_name', partnerName);
        form.append('category',     document.getElementById('art-category').value);
        form.append('summary', summary);
        form.append('headline', headline);
        form.append('introduction', introduction);
        form.append('body', body);
        form.append('conclusion', conclusion);
        if (imgFile) form.append('cover_image', imgFile);

        const res = await fetch(`${API_BASE_URL}/api/admin/articles`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + getAdminToken() },
            body: form
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);

        msg.style.background = '#e8f5e9'; msg.style.color = '#2e7d32'; msg.style.border = '1px solid #a5d6a7';
        msg.textContent = '✅ โพสบทความสำเร็จ! Article ID: ' + data.article_id;
        msg.style.display = 'block';
        document.getElementById('article-create-form').reset();
        showToast('โพสบทความสำเร็จ ✅');
    } catch (err) {
        msg.style.background = '#ffebee'; msg.style.color = '#c62828'; msg.style.border = '1px solid #ef9a9a';
        msg.textContent = '❌ ' + err.message;
        msg.style.display = 'block';
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> โพสบทความ';
    }
}

function showToast(text) {
    let t = document.getElementById('admin-toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'admin-toast';
        t.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;background:#1565c0;color:#fff;padding:0.75rem 1.25rem;border-radius:10px;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.2);transition:opacity 0.3s;';
        document.body.appendChild(t);
    }
    t.textContent = text;
    t.style.opacity = '1';
    clearTimeout(t._timeout);
    t._timeout = setTimeout(() => { t.style.opacity = '0'; }, 2500);
}

async function submitBannerForm(e) {
    e.preventDefault();
    const msg = document.getElementById('banner-form-msg');
    const editId = document.getElementById('banner-edit-id').value;
    const fd = new FormData();
    fd.append('title', document.getElementById('banner-title').value.trim());
    fd.append('description', document.getElementById('banner-description').value.trim());
    fd.append('banner_type', document.getElementById('banner-type').value);
    const partnerId = document.getElementById('banner-partner-id').value;
    if (partnerId) fd.append('partner_id', partnerId);
    fd.append('link_url', document.getElementById('banner-link').value.trim());
    fd.append('start_date', document.getElementById('banner-start').value);
    fd.append('end_date', document.getElementById('banner-end').value);
    fd.append('display_order', document.getElementById('banner-order').value || '0');
    const imgFile = document.getElementById('banner-image').files[0];
    if (imgFile) fd.append('image', imgFile);

    try {
        msg.textContent = 'กำลังบันทึก...';
        const url = editId ? `${API_BASE_URL}/api/banners/${editId}` : `${API_BASE_URL}/api/banners`;
        const method = editId ? 'PUT' : 'POST';
        const res = await fetch(url, { method, body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
        msg.style.color = '#27ae60';
        msg.textContent = editId ? 'อัปเดตสำเร็จ!' : 'เพิ่มแบนเนอร์สำเร็จ!';
        resetBannerForm();
        loadBannersList();
    } catch (err) {
        msg.style.color = '#e74c3c';
        msg.textContent = err.message;
    }
}

function resetBannerForm() {
    document.getElementById('banner-edit-id').value = '';
    document.getElementById('banner-form-title').textContent = 'เพิ่มแบนเนอร์ใหม่';
    document.getElementById('banner-form').reset();
    document.getElementById('banner-image-preview').style.display = 'none';
    document.getElementById('banner-form-msg').textContent = '';
}

async function toggleBannerActive(id, currentActive) {
    try {
        await fetch(`${API_BASE_URL}/api/banners/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: currentActive ? 0 : 1 })
        });
        loadBannersList();
    } catch (e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
}

async function deleteBanner(id) {
    if (!confirm('ปิดการใช้งานแบนเนอร์นี้?')) return;
    try {
        await fetch(`${API_BASE_URL}/api/banners/${id}`, { method: 'DELETE' });
        loadBannersList();
    } catch (e) { alert('เกิดข้อผิดพลาด: ' + e.message); }
}

async function parseAndUploadExcel(file, selectedRewardId) {
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet);

        if (rows.length === 0) {
            alert('ไฟล์ว่างเปล่า');
            return;
        }

        // Validate and prepare codes - use selected reward_id for all codes
        const codes = rows.map(row => ({
            code: (row.code || row.Code || row.CODE || '').trim(),
            reward_id: selectedRewardId,  // Use selected reward, not from file
            description: (row.description || row.Description || row.DESCRIPTION || '').trim(),
            expiry_date: row.expiry_date || row.Expiry_Date || row.EXPIRY_DATE || null
        })).filter(c => c.code);  // Only need code now

        if (codes.length === 0) {
            alert('ไฟล์ต้องมีอย่างน้อย column code');
            return;
        }

        // Upload to backend
        const uploadResponse = await fetch(`${API_BASE_URL}/api/admin/promo-codes/upload`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
            },
            body: JSON.stringify({ codes })
        });

        if (!uploadResponse.ok) {
            const error = await uploadResponse.json();
            throw new Error(error.error || 'ไม่สามารถอัพโหลดโค้ดได้');
        }

        const result = await uploadResponse.json();

        // Show result
        const resultDiv = document.getElementById('promo-upload-result');
        const messageDiv = document.getElementById('promo-upload-message');
        const detailsDiv = document.getElementById('promo-upload-details');

        if (resultDiv && messageDiv) {
            resultDiv.style.display = 'block';
            resultDiv.style.background = result.errorCount === 0 ? 'rgba(16,185,129,0.15)' : 'rgba(255,165,0,0.15)';
            resultDiv.style.color = result.errorCount === 0 ? 'var(--green)' : 'var(--orange)';
            messageDiv.textContent = `สำเร็จ ${result.successCount}, ล้มเหลว ${result.errorCount}`;
            
            if (result.errors && result.errors.length > 0) {
                detailsDiv.innerHTML = result.errors.slice(0, 5).map(e => 
                    `<div><strong>${e.code}</strong>: ${e.error}</div>`
                ).join('');
                if (result.errors.length > 5) {
                    detailsDiv.innerHTML += `<div style="margin-top: 0.5rem;">...และอื่นๆ ${result.errors.length - 5} รายการ</div>`;
                }
            }
        }

        // Reset form
        const fileInput = document.getElementById('promo-excel-upload');
        if (fileInput) fileInput.value = '';

        // Reload promo codes
        setTimeout(() => loadPromoCodes(), 1000);
    } catch (error) {
        alert('เกิดข้อผิดพลาด: ' + error.message);
    }
}

async function loadPromoCodes(search = '', status = '') {
    const tableBody = document.getElementById('promo-codes-table');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="6" style="padding: 2rem; color: var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> กำลังโหลด...</td></tr>';

    try {
        let url = `${API_BASE_URL}/api/admin/promo-codes?limit=100`;
        if (search) url += `&search=${encodeURIComponent(search)}`;
        if (status) url += `&status=${encodeURIComponent(status)}`;

        const response = await fetch(url, {
            headers: getAuthHeaders()
        });

        if (response.status === 401 || response.status === 403) {
            clearAuthSession();
            showLogin('Session หมดอายุหรือไม่มีสิทธิ์');
            return;
        }

        if (!response.ok) throw new Error('ไม่สามารถโหลดข้อมูลได้');

        const data = await response.json();
        const codes = data.data || [];

        if (codes.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">ไม่มีโค้ด</td></tr>';
            return;
        }

        tableBody.innerHTML = codes.map((code, index) => {
            let statusBadge = '';
            let statusColor = '';
            let statusBgColor = '';

            if (code.status === 'used') {
                statusBadge = '<i class="fas fa-check-circle"></i> ใช้แล้ว';
                statusColor = 'var(--green)';
                statusBgColor = 'rgba(16,185,129,0.15)';
            } else if (code.status === 'expired') {
                statusBadge = '<i class="fas fa-times-circle"></i> หมดอายุ';
                statusColor = 'var(--red)';
                statusBgColor = 'rgba(239,68,68,0.15)';
            } else {
                statusBadge = '<i class="fas fa-check"></i> ใช้ได้';
                statusColor = 'var(--blue)';
                statusBgColor = 'rgba(74,108,247,0.15)';
            }

            return `<tr style="border-top: 1px solid var(--border); transition: background 0.15s;" onmouseover="this.style.background='var(--bg-card-alt)'" onmouseout="this.style.background=''">
                <td style="text-align: left; padding: 0.75rem;">
                    <code style="background: var(--bg-card-alt); padding: 0.3rem 0.6rem; border-radius: 4px;">${maskedCodeCell(code.code)}</code>
                </td>
                <td style="text-align: left; padding: 0.75rem; color: var(--text-primary); font-weight: 500;">
                    ${code.reward_name ? `<span style="cursor: pointer; text-decoration: underline; color: var(--blue);" title="Reward: ${code.reward_name}">${code.reward_name}</span>` : '<span style="color: var(--text-muted);">-</span>'}
                </td>
                <td style="text-align: center; padding: 0.75rem;">
                    <span style="padding: 0.25rem 0.75rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600; background: ${statusBgColor}; color: ${statusColor};">
                        ${statusBadge}
                    </span>
                </td>
                <td style="text-align: center; padding: 0.75rem; font-size: 0.9rem; color: var(--text-secondary);">
                    ${code.expiry_date ? new Date(code.expiry_date).toLocaleDateString('th-TH') : '-'}
                </td>
                <td style="text-align: center; padding: 0.75rem; font-size: 0.9rem; color: var(--text-secondary);">
                    ${code.description || '-'}
                </td>
                <td style="text-align: center; padding: 0.75rem;">
                    <button class="btn btn-del" onclick="deletePromoCode('${code.code}')" style="padding: 0.3rem 0.6rem; font-size: 0.85rem; border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; background: rgba(239,68,68,0.1); color: var(--red); cursor: pointer; transition: 0.15s;" onmouseover="this.style.background='rgba(239,68,68,0.2)'" onmouseout="this.style.background='rgba(239,68,68,0.1)'">
                        <i class="fas fa-trash"></i> ลบ
                    </button>
                </td>
            </tr>`;
        }).join('');
    } catch (error) {
        console.error('Load promo codes error:', error);
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--red);">เกิดข้อผิดพลาด: ' + error.message + '</td></tr>';
    }
}

async function deletePromoCode(code) {
    if (!confirm('คุณแน่ใจว่าต้องการลบโค้ดนี้?')) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/promo-codes`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders()
            },
            body: JSON.stringify({ codes: [code] })
        });

        if (response.status === 401 || response.status === 403) {
            clearAuthSession();
            showLogin('Session หมดอายุหรือไม่มีสิทธิ์');
            return;
        }

        if (!response.ok) throw new Error('ไม่สามารถลบโค้ดได้');

        alert('ลบโค้ดสำเร็จ');
        loadPromoCodes();
    } catch (error) {
        alert('เกิดข้อผิดพลาด: ' + error.message);
    }
}

// Load promo codes on page view
document.addEventListener('DOMContentLoaded', () => {
    const promoSearch = document.getElementById('promo-search');
    const promoStatusFilter = document.getElementById('promo-status-filter');
    const promoRewardSelect = document.getElementById('promo-reward-select');

    if (promoSearch) {
        promoSearch.addEventListener('input', () => {
            filterPromoCodesByReward();
        });
    }

    if (promoStatusFilter) {
        promoStatusFilter.addEventListener('change', () => {
            filterPromoCodesByReward();
        });
    }

    if (promoRewardSelect) {
        promoRewardSelect.addEventListener('change', showPromoRewardInfo);
    }

    // Load rewards on initial page load (if user is already on the codes tab)
    const campaignCodesPanel = document.getElementById('campaign-panel-codes');
    if (campaignCodesPanel && campaignCodesPanel.style.display !== 'none') {
        loadPromoRewards();
    }
});

// Filter promo codes by search and status
function filterPromoCodesByReward() {
    const rewardSelect = document.getElementById('promo-reward-select');
    const searchInput = document.getElementById('promo-search');
    const statusFilter = document.getElementById('promo-status-filter');
    const tableBody = document.getElementById('promo-codes-table');
    
    if (!tableBody || !rewardSelect.value) {
        return;
    }

    // Get all rows
    const rows = tableBody.querySelectorAll('tr');
    const searchTerm = (searchInput?.value || '').toLowerCase();
    const filterStatus = statusFilter?.value || '';

    let visibleCount = 0;
    rows.forEach(row => {
        // Skip header or loading rows
        if (row.querySelector('td:nth-child(2)')) {
            const code = row.querySelector('td:nth-child(1)')?.textContent?.toLowerCase() || '';
            const statusBadge = row.querySelector('td:nth-child(3) span')?.textContent?.toLowerCase() || '';
            
            // Check if matches search term
            const matchesSearch = !searchTerm || code.includes(searchTerm);
            
            // Check if matches status filter
            const matchesStatus = !filterStatus || statusBadge.includes(filterStatus.toLowerCase());
            
            if (matchesSearch && matchesStatus) {
                row.style.display = '';
                visibleCount++;
            } else {
                row.style.display = 'none';
            }
        }
    });
    
    // Show "no results" message if no rows visible
    if (visibleCount === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">ไม่พบโค้ดที่ตรงกับการค้นหา</td></tr>';
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// ════════════════════ PROMO CODE VERIFIER FUNCTIONS ═════════════════════════
// ═════════════════════════════════════════════════════════════════════════════

const verifierPageState = {
    rewardId: null,
    page: 1,
    pageSize: 100,
    total: 0
};

function getVerifierFilters() {
    const search = (document.getElementById('verifier-search')?.value || '').trim();
    const status = document.getElementById('verifier-status-filter')?.value || '';
    const usedFrom = document.getElementById('verifier-used-from')?.value || '';
    const usedTo = document.getElementById('verifier-used-to')?.value || '';

    return { search, status, usedFrom, usedTo };
}

function buildVerifierPagination(total, page, pageSize) {
    if (total <= 0) return '';

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const start = (safePage - 1) * pageSize + 1;
    const end = Math.min(safePage * pageSize, total);
    const rewardId = verifierPageState.rewardId;
    const makeButton = (label, targetPage, active = false, disabled = false, variant = 'ghost') => `
        <button class="btn btn-${variant}" type="button" onclick="loadVerifierRewardCodes(${rewardId}, ${targetPage})" ${active ? 'aria-current=\"page\"' : ''} ${disabled ? 'disabled' : ''} style="padding:0.35rem 0.7rem; font-size:0.82rem; ${active ? 'font-weight:700; box-shadow:0 0 0 2px rgba(74,108,247,0.15);' : ''}">${label}</button>
    `;

    const buildPageButtons = () => {
        const buttons = [];
        const pushPage = (pageNumber) => {
            buttons.push(makeButton(String(pageNumber), pageNumber, pageNumber === safePage, false, pageNumber === safePage ? 'check' : 'ghost'));
        };

        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pushPage(i);
            return buttons.join('');
        }

        pushPage(1);

        const startPage = Math.max(2, safePage - 1);
        const endPage = Math.min(totalPages - 1, safePage + 1);

        if (startPage > 2) {
            buttons.push('<span style="color:var(--text-muted); padding:0 0.2rem;">...</span>');
        }

        for (let i = startPage; i <= endPage; i++) {
            pushPage(i);
        }

        if (endPage < totalPages - 1) {
            buttons.push('<span style="color:var(--text-muted); padding:0 0.2rem;">...</span>');
        }

        pushPage(totalPages);
        return buttons.join('');
    };

    return `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:0.75rem; flex-wrap:wrap; margin-top:1rem; padding:0.75rem; background:var(--bg-card-alt); border:1px solid var(--border); border-radius:8px;">
            <div style="font-size:0.85rem; color:var(--text-secondary);">
                แสดง ${formatNumber(end - start + 1)} จาก ${formatNumber(total)} โค้ด
                <span style="margin-left:0.4rem; color:var(--text-muted);">(รายการ ${formatNumber(start)}-${formatNumber(end)})</span>
            </div>
            <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap; max-width:100%;">
                <button class="btn btn-ghost" type="button" onclick="loadVerifierRewardCodes(${rewardId}, ${safePage - 1})" ${safePage <= 1 ? 'disabled' : ''} style="padding:0.35rem 0.7rem; font-size:0.82rem;">ก่อนหน้า</button>
                ${buildPageButtons()}
                <button class="btn btn-check" type="button" onclick="loadVerifierRewardCodes(${rewardId}, ${safePage + 1})" ${safePage >= totalPages ? 'disabled' : ''} style="padding:0.35rem 0.7rem; font-size:0.82rem;">ถัดไป</button>
            </div>
        </div>
    `;
}

function getVerifierStatusMeta(status) {
    const raw = String(status || '').toLowerCase();
    const normalized = (raw === 'available' || raw === 'active') ? 'ready'
                     : (raw === 'used' || raw === 'manual_redeemed' || raw === 'redeemed') ? 'redeemed'
                     : raw;
    const map = {
        ready:     { label: 'พร้อมใช้งาน', icon: 'fa-circle-check',  className: 'vsb-ready' },
        reserved:  { label: 'จองแล้ว',     icon: 'fa-clock',          className: 'vsb-reserved' },
        redeemed:  { label: 'ใช้งานแล้ว',  icon: 'fa-circle-check',  className: 'vsb-redeemed' },
        expired:   { label: 'หมดอายุ',     icon: 'fa-circle-xmark',  className: 'vsb-expired' },
        cancelled: { label: 'ยกเลิกแล้ว', icon: 'fa-ban',            className: 'vsb-cancelled' },
        refunded:  { label: 'คืนแต้มแล้ว', icon: 'fa-rotate-left',   className: 'vsb-refunded' },
    };
    return map[normalized] || { label: normalized || 'ไม่ระบุสถานะ', icon: 'fa-circle-info', className: 'vsb-unknown' };
}

function renderVerifierStatusBadge(code) {
    const meta = getVerifierStatusMeta(code?.status || code?.current_status);
    return `
        <span class="verifier-status-badge ${meta.className}" title="สถานะ: ${meta.label}">
            <i class="fas ${meta.icon}"></i>
            <span>${meta.label}</span>
        </span>
    `;
}

function renderVerifierActionButtons(code) {
    const codeId = Number(code?.promo_code_id) || 0;
    const status = String(code?.status || code?.current_status || '').toLowerCase();
    const isUsed = status === 'redeemed' || status === 'used' || status === 'manual_redeemed';
    const isCancelled = status === 'cancelled';
    const isExpired = status === 'expired';
    const isDisabled = isUsed || isCancelled || isExpired;
    return `
        <div class="verifier-action-group-v2">
            <button class="verifier-action-btn verify" type="button"
                title="${isDisabled ? 'ไม่สามารถยืนยันได้' : 'ยืนยันการใช้งาน'}"
                ${isDisabled ? 'disabled style="opacity:0.45;cursor:not-allowed;"' : `onclick="confirmVerifyCode(${codeId})"`}>
                <i class="fas fa-circle-check"></i><span>ยืนยันการใช้งาน</span>
            </button>
        </div>
    `;
}

async function confirmVerifyCode(codeId) {
    if (typeof pvShowConfirmModal === 'function') {
        pvShowConfirmModal(codeId);
        return;
    }
    if (!confirm('ยืนยันการใช้งานโค้ดนี้หรือไม่?\nสถานะจะเปลี่ยนจาก "พร้อมใช้งาน" เป็น "ใช้งานแล้ว"')) return;
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/override/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ promo_code_id: codeId })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        alert('ยืนยันการใช้งานสำเร็จ');
        const rewardId = document.getElementById('verifier-reward-select')?.value;
        if (rewardId) loadVerifierRewardCodes(rewardId, verifierPageState.page);
    } catch (err) {
        alert('เกิดข้อผิดพลาด: ' + (err.message || 'ไม่สามารถดำเนินการได้'));
    }
}

function toggleVerifierDropdown(event, codeId) {
    event.stopPropagation();
    const menu = document.getElementById(`vdm-${codeId}`);
    if (!menu) return;
    const isOpen = menu.classList.contains('open');
    closeAllVerifierDropdowns();
    if (!isOpen) {
        const btn = event.currentTarget;
        const rect = btn.getBoundingClientRect();
        const menuWidth = 210;
        let left = rect.right - menuWidth;
        if (left < 4) left = 4;
        menu.style.top = (rect.bottom + 5) + 'px';
        menu.style.left = left + 'px';
        menu.classList.add('open');
    }
}

function closeAllVerifierDropdowns() {
    document.querySelectorAll('.verifier-dropdown-menu.open').forEach(m => m.classList.remove('open'));
}

function confirmCancelCode(codeId) {
    if (typeof showOverrideStatusModal === 'function') {
        showOverrideStatusModal(codeId);
    }
}

// Close all dropdowns on outside click
document.addEventListener('click', closeAllVerifierDropdowns);

function formatVerifierUpdatedBy(code) {
    if (!code) return '-';
    const label = code.last_updated_by || code.override_flag || '-';
    return String(label).replace(/_/g, ' ');
}

function formatVerifierOverrideFlag(code) {
    if (!code || !code.override_flag) return '-';
    return String(code.override_flag).replace(/_/g, ' ').toUpperCase();
}

// Load rewards for verifier page
async function loadRewardsForVerifier() {
    const rewardSelect = document.getElementById('verifier-reward-select');
    if (!rewardSelect) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/rewards`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error('ไม่สามารถโหลดรางวัลได้');

        const data = await response.json();
        const rewards = data.data || [];

        // Clear existing options
        rewardSelect.innerHTML = '<option value="">-- เลือกรางวัล --</option>';

        // Add reward options
        rewards.forEach(reward => {
            if (reward.is_active) {
                const option = document.createElement('option');
                option.value = reward.reward_id;
                option.textContent = reward.reward_name;
                option.dataset.rewardName = reward.reward_name;
                option.dataset.requiredPoints = reward.required_points || 0;
                rewardSelect.appendChild(option);
            }
        });
    } catch (error) {
        console.error('Load rewards error:', error);
    }
}

// Load codes for selected reward
async function loadVerifierRewardCodes(rewardId, targetPage = 1) {
    if (!rewardId) {
        document.getElementById('verifier-batches-container').innerHTML = '<div style="padding: 3rem; text-align: center; color: var(--text-muted);"><i class="fas fa-mouse-pointer" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>เลือกรางวัลด้านบนเพื่อดูรายการโค้ด</div>';
        document.getElementById('verifier-stats').innerHTML = '';
        const detailPanel = document.getElementById('verifier-campaign-detail');
        if (detailPanel) detailPanel.classList.add('hidden');
        verifierPageState.rewardId = null;
        verifierPageState.page = 1;
        verifierPageState.total = 0;
        return;
    }

    try {
        verifierPageState.rewardId = Number(rewardId);
        verifierPageState.page = Math.max(1, Number(targetPage) || 1);

        const { search, status, usedFrom, usedTo } = getVerifierFilters();
        const query = new URLSearchParams({
            reward_id: String(rewardId),
            limit: '99999',
            offset: '0'
        });

        const response = await fetch(`${API_BASE_URL}/api/admin/promo-codes?${query.toString()}`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error('ไม่สามารถโหลดรายละเอียดรางวัลได้');

        const data = await response.json();
        const rawCodes = Array.isArray(data) ? data : data.data || [];

        const normalizedCodes = rawCodes.map(code => ({
            promo_code_id: code.promo_code_id,
            code: code.code,
            description: code.description || null,
            reward_name: code.reward_name || code.reward_title || code.title || null,
            campaign_name: code.campaign_name || code.campaign || null,
            batch_id: code.batch_id || null,
            batch_name: code.batch_name || null,
            expiry_date: code.expiry_date || null,
            created_at: code.created_at,
            reward_points: Number(code.reward_points || code.points || 0),
            used_by_phone: code.used_by_phone || code.redeemed_by_phone || '-',
            used_by_user_id: code.used_by_user_id || code.redeemed_by || null,
            status: String(code.current_status || code.status || (code.is_used ? 'used' : 'available')).toLowerCase(),
            override_flag: code.override_flag || null,
            last_updated_at: code.last_updated_at || code.updated_at || null,
            last_updated_by: code.last_updated_by_name || code.last_updated_by || code.updated_by || null,
            used_at: code.used_at || code.redeemed_at || null
        }));

        let filteredCodes = normalizedCodes;

        if (status) {
            const normalizeStatus = (s) => {
                const raw = String(s || '').toLowerCase();
                if (raw === 'available' || raw === 'active') return 'ready';
                if (raw === 'used' || raw === 'manual_redeemed' || raw === 'redeemed') return 'redeemed';
                return raw;
            };
            const normalizedFilter = normalizeStatus(status);
            filteredCodes = filteredCodes.filter(code => normalizeStatus(code.status) === normalizedFilter);
        }

        const searchText = String(search || '').toLowerCase();
        if (searchText) {
            filteredCodes = filteredCodes.filter(code => {
                const haystack = `${code.code || ''} ${code.description || ''} ${code.used_by_phone || ''}`.toLowerCase();
                return haystack.includes(searchText);
            });
        }

        if (usedFrom) {
            const fromDate = new Date(`${usedFrom}T00:00:00`);
            filteredCodes = filteredCodes.filter(code => {
                if (!code.used_at) return false;
                return new Date(code.used_at) >= fromDate;
            });
        }

        if (usedTo) {
            const toDate = new Date(`${usedTo}T23:59:59`);
            filteredCodes = filteredCodes.filter(code => {
                if (!code.used_at) return false;
                return new Date(code.used_at) <= toDate;
            });
        }

        verifierPageState.total = filteredCodes.length;

        const totalPages = Math.max(1, Math.ceil(verifierPageState.total / verifierPageState.pageSize));
        if (verifierPageState.page > totalPages) {
            verifierPageState.page = totalPages;
            return loadVerifierRewardCodes(rewardId, totalPages);
        }

        const startIndex = (verifierPageState.page - 1) * verifierPageState.pageSize;
        const pageCodes = filteredCodes.slice(startIndex, startIndex + verifierPageState.pageSize);

        // Show campaign detail panel
        const detailPanel = document.getElementById('verifier-campaign-detail');
        const rewardSelect = document.getElementById('verifier-reward-select');
        const selected = rewardSelect.options[rewardSelect.selectedIndex];
        
        if (detailPanel && selected && selected.value) {
            const rName   = selected.dataset.rewardName   || selected.textContent.trim() || '-';
            const rPoints = selected.dataset.requiredPoints != null ? selected.dataset.requiredPoints : '-';
            detailPanel.classList.remove('hidden');
            detailPanel.innerHTML = `
                <div class="verifier-detail-banner" style="display:flex;gap:1rem;">
                    <div class="verifier-detail-tile" style="flex:1;">
                        <span class="verifier-detail-label">รางวัล</span>
                        <strong>${rName}</strong>
                    </div>
                    <div class="verifier-detail-tile" style="flex:1;">
                        <span class="verifier-detail-label">แต้มที่ต้อง</span>
                        <strong>${rPoints}</strong>
                    </div>
                </div>
            `;
        }

        // Calculate stats from raw data, unaffected by filters
        const stats = {
            total: normalizedCodes.length,
            available: normalizedCodes.filter(c => c.status === 'available' || c.status === 'active').length,
            used: normalizedCodes.filter(c => c.status === 'used' || c.status === 'redeemed' || c.status === 'manual_redeemed').length,
            expired: normalizedCodes.filter(c => c.status === 'expired').length
        };

        const lowStockWarn = stats.available <= 10 && stats.available > 0
            ? `<div style="margin-top:0.75rem;padding:0.6rem 1rem;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.35);border-radius:8px;color:#b45309;font-size:0.85rem;font-weight:600;display:flex;align-items:center;gap:0.5rem;"><i class="fas fa-exclamation-triangle"></i> โค้ดเหลือน้อย — เหลือ ${stats.available} โค้ด กรุณาเติมโค้ดใหม่</div>`
            : stats.available === 0
            ? `<div style="margin-top:0.75rem;padding:0.6rem 1rem;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.35);border-radius:8px;color:var(--red);font-size:0.85rem;font-weight:600;display:flex;align-items:center;gap:0.5rem;"><i class="fas fa-times-circle"></i> โค้ดหมดแล้ว — ผู้ใช้จะไม่สามารถแลกรางวัลนี้ได้จนกว่าจะเติมโค้ด</div>`
            : '';
        const statsHtml = `
            <div class="verifier-stats-grid" style="grid-template-columns: repeat(3, 1fr);">
                <div class="verifier-stat-card"><div class="verifier-stat-value blue">${stats.total}</div><div class="verifier-stat-label">โค้ดทั้งหมด</div></div>
                <div class="verifier-stat-card"><div class="verifier-stat-value ${stats.available <= 10 ? 'red' : 'green'}">${stats.available}</div><div class="verifier-stat-label">พร้อมใช้งาน</div></div>
                <div class="verifier-stat-card"><div class="verifier-stat-value blue">${stats.used}</div><div class="verifier-stat-label">ใช้งานแล้ว</div></div>
            </div>${lowStockWarn}
        `;

        document.getElementById('verifier-stats').innerHTML = statsHtml;

        // Render codes
        const codesHtml = pageCodes.map((code) => {
            const statusBadge = renderVerifierStatusBadge(code);
            const updatedBy = formatVerifierUpdatedBy(code);
            const updatedAt = code.last_updated_at ? formatDateTime(code.last_updated_at) : '-';
            const overrideFlag = formatVerifierOverrideFlag(code);

            const rewardLabel = code.reward_name || code.campaign_name || code.description || '-';
            return `
                <div class="verifier-row" data-pv-id="${code.promo_code_id}" data-code-id="${code.promo_code_id}"
                     data-reward-name="${(code.reward_name || '').replace(/"/g, '&quot;')}"
                     data-reward-points="${code.reward_points}"
                     data-description="${(code.description || '').replace(/"/g, '&quot;')}"
                     data-status="${code.status}"
                     data-used-phone="${code.used_by_phone || ''}"
                     data-used-at="${code.used_at || ''}"
                     data-created-at="${code.created_at || ''}"
                     data-expiry="${code.expiry_date || ''}">
                    <div class="verifier-cell code">
                        <div class="verifier-code-value">${maskedCodeCell(code.code)}</div>
                        ${code.batch_name ? `<div class="verifier-code-sub" style="font-size:0.7rem;opacity:0.6;">${code.batch_name}</div>` : ''}
                    </div>
                    <div class="verifier-cell points">
                        ${code.reward_points ? `<span class="verifier-points-badge">${formatNumber(code.reward_points)}</span>` : '<span style="color:var(--text-muted);">-</span>'}
                    </div>
                    <div class="verifier-cell detail">
                        <div class="verifier-reward-name">${rewardLabel}</div>
                        ${code.description && code.reward_name && code.description !== code.reward_name ? `<div class="verifier-reward-sub">${escapeHtmlMultiline(code.description)}</div>` : ''}
                    </div>
                    <div class="verifier-cell meta">${code.created_at ? formatDate(code.created_at) : '-'}</div>
                    <div class="verifier-cell meta">${code.used_at ? formatDate(code.used_at) : '-'}</div>
                    <div class="verifier-cell meta">${code.used_by_phone && code.used_by_phone !== '-' ? code.used_by_phone : '<span style="color:var(--text-muted);">-</span>'}</div>
                    <div class="verifier-cell status">${statusBadge}</div>
                    <div class="verifier-cell meta">${code.last_updated_by ? `${escapeHtml(code.last_updated_by)} <span style="color:var(--text-muted);font-size:0.78rem;">(admin)</span>` : '<span style="color:var(--text-muted);">-</span>'}</div>
                    <div class="verifier-cell actions">${renderVerifierActionButtons(code)}</div>
                </div>
            `;
        }).join('');

        if (codesHtml) {
            const headerHtml = `
                <div class="verifier-header-row">
                    <div>รหัสโค้ด</div>
                    <div style="text-align:center;">แต้ม</div>
                    <div>รายละเอียดรางวัล</div>
                    <div style="text-align:center;">วันที่สร้าง</div>
                    <div style="text-align:center;">วันที่ใช้งาน</div>
                    <div style="text-align:center;">เบอร์ผู้ใช้</div>
                    <div style="text-align:center;">สถานะ</div>
                    <div style="text-align:center;">ยืนยันโดย</div>
                    <div style="text-align:center;">การจัดการ</div>
                </div>
            `;
            const paginationHtml = buildVerifierPagination(
                verifierPageState.total,
                verifierPageState.page,
                verifierPageState.pageSize
            );
            document.getElementById('verifier-batches-container').innerHTML = `<div class="verifier-table-scroll">${headerHtml}${codesHtml}${paginationHtml}</div>`;
        } else {
            document.getElementById('verifier-batches-container').innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-muted);">ไม่มีโค้ดที่ตรงกับเงื่อนไข</div>';
        }
    } catch (error) {
        console.error('Load codes error:', error);
        document.getElementById('verifier-batches-container').innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--red);">เกิดข้อผิดพลาดในการโหลดโค้ด</div>';
    }
}

// ========== UTILITY FUNCTIONS FOR FILTERING ==========

function applyVerifierFilters() {
    const rewardId = document.getElementById('verifier-reward-select')?.value;

    if (!rewardId) {
        if (typeof pvToast === 'function') pvToast('กรุณาเลือกรางวัลก่อน', 'warning');
        return;
    }

    loadVerifierRewardCodes(rewardId, 1);
}

function changeVerifierPageSize(value) {
    const pageSize = Math.max(10, Number(value) || 100);
    verifierPageState.pageSize = pageSize;

    const rewardId = document.getElementById('verifier-reward-select')?.value;
    if (!rewardId) return;

    loadVerifierRewardCodes(rewardId, 1);
}

function resetVerifierFilters() {
    const searchInput = document.getElementById('verifier-search');
    const statusFilter = document.getElementById('verifier-status-filter');
    const dateFrom = document.getElementById('verifier-used-from');
    const dateTo = document.getElementById('verifier-used-to');
    const pageSizeSelect = document.getElementById('verifier-page-size');
    
    if (searchInput) searchInput.value = '';
    if (statusFilter) statusFilter.value = '';
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
    if (pageSizeSelect) pageSizeSelect.value = '100';
    verifierPageState.pageSize = 100;
    
    const rewardId = document.getElementById('verifier-reward-select')?.value;
    if (rewardId) loadVerifierRewardCodes(rewardId, 1);
}

function openVerifierStatusEditor(codeId) {
    const safeCodeId = Number(codeId) || 0;
    if (!safeCodeId) {
        alert('ไม่พบรหัสโค้ดสำหรับแก้ไขสถานะ');
        return;
    }

    if (typeof showOverrideStatusModal === 'function') {
        showOverrideStatusModal(safeCodeId);
        return;
    }

    if (typeof showManualUseModal === 'function') {
        showManualUseModal(safeCodeId);
        return;
    }

    alert('ยังไม่สามารถเปิดหน้าต่างแก้ไขสถานะได้');
}

// Initialize verifier page
function initPromoVerifier() {
    return loadRewardsForVerifier();
}

// Dynamically load optional admin helper if it exists to avoid 404 / MIME errors
(function(){
    if (!('fetch' in window)) return;
    fetch('qr_admin_functions.js', { method: 'GET' })
        .then(function(res){
            if (!res.ok) {
                console.info('Optional script qr_admin_functions.js not found, skipping.');
                return;
            }
            var ct = res.headers.get('content-type') || '';
            if (!/javascript|application\/x-javascript|application\/javascript|text\/javascript/i.test(ct)) {
                console.info('qr_admin_functions.js returned non-JS content-type, skipping.');
                return;
            }
            var s = document.createElement('script');
            s.src = 'qr_admin_functions.js';
            s.defer = true;
            document.body.appendChild(s);
        })
        .catch(function(err){ console.info('Failed to load optional qr_admin_functions.js', err); });
})();

// Header datetime clock
(function() {
    function updateClock() {
        var el = document.getElementById('header-datetime');
        if (!el) return;
        var now = new Date();
        el.textContent = now.toLocaleString('th-TH', {
            weekday: 'short', day: 'numeric', month: 'short',
            hour: '2-digit', minute: '2-digit'
        });
    }
    updateClock();
    setInterval(updateClock, 60000);
})();

// Breadcrumb: sync header page name with active nav item
(function() {
    function syncBreadcrumb() {
        var active = document.querySelector('.nav-item.active');
        var el = document.getElementById('header-page-name');
        if (active && el) {
            el.textContent = active.getAttribute('data-page-label') || active.textContent.trim();
        }
    }
    document.querySelectorAll('.nav-item').forEach(function(item) {
        item.addEventListener('click', function() {
            setTimeout(syncBreadcrumb, 50);
        });
    });
    syncBreadcrumb();
})();

// ═════════════════════════════════════════════════════════════════
// Home Banners admin
// ═════════════════════════════════════════════════════════════════

let _bannerCache = [];

async function loadBannersAdmin() {
    const el = document.getElementById('banner-list');
    if (!el) return;
    el.innerHTML = '<div style="color:#888;font-size:12px">กำลังโหลด...</div>';
    try {
        const list = await fetchAuthJson(`${API_BASE_URL}/api/banners/admin/all`);
        _bannerCache = list;
        if (!list.length) { el.innerHTML = '<div style="color:#aaa;font-size:12px;text-align:center">ยังไม่มีแบนเนอร์</div>'; return; }
        el.innerHTML = list.map(b => {
            const statusColor = b.is_active ? '#10b981' : '#6b7280';
            const statusLabel = b.is_active ? 'Active' : 'Inactive';
            const img = b.image_url
                ? `<img src="${resolveMediaUrl(b.image_url)}" style="width:52px;height:40px;object-fit:cover;border-radius:4px;flex-shrink:0" onerror="this.style.display='none'">`
                : `<div style="width:52px;height:40px;background:#eee;border-radius:4px;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas fa-image" style="color:#bbb;font-size:14px"></i></div>`;
            return `
            <div style="background:#f9f9f9;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px">
                <div style="display:flex;align-items:center;gap:10px">
                    ${img}
                    <div style="flex:1;min-width:0">
                        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                            <span style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px">${escapeHtml(b.title || '(ไม่มีชื่อ)')}</span>
                            <span style="font-size:10px;font-weight:600;color:${statusColor};background:${statusColor}18;padding:1px 6px;border-radius:10px;white-space:nowrap">${statusLabel}</span>
                            <span style="font-size:10px;color:#888">${escapeHtml(b.banner_type || 'general')}</span>
                        </div>
                    </div>
                    <button class="btn btn-check" style="font-size:10px;padding:3px 8px;flex-shrink:0" onclick="editBanner(${b.id})"><i class="fas fa-pen"></i></button>
                    <button class="btn btn-del" style="font-size:10px;padding:3px 8px;flex-shrink:0" onclick="deleteBannerById(${b.id})"><i class="fas fa-trash"></i></button>
                </div>
            </div>`;
        }).join('');
    } catch (e) {
        el.innerHTML = '<div style="color:#e74c3c;font-size:12px">โหลดไม่ได้</div>';
    }
}

function editBanner(id) {
    const b = _bannerCache.find(x => x.id === id);
    if (!b) return;
    document.getElementById('banner-edit-id').value = id;
    document.getElementById('banner-title').value = b.title || '';
    document.getElementById('banner-desc').value = b.description || '';
    document.getElementById('banner-link').value = b.link_url || '';
    document.getElementById('banner-type').value = b.banner_type || 'general';
    document.getElementById('banner-start').value = b.start_date ? b.start_date.substring(0, 10) : '';
    document.getElementById('banner-end').value = b.end_date ? b.end_date.substring(0, 10) : '';
    document.getElementById('banner-form-header').textContent = 'แก้ไข';
    document.getElementById('banner-cancel-btn').style.display = '';
    document.getElementById('banner-submit-btn').innerHTML = '<i class="fas fa-save"></i> บันทึกการแก้ไข';
}

function resetBannerForm() {
    document.getElementById('banner-edit-id').value = '';
    ['banner-title', 'banner-desc', 'banner-link', 'banner-start', 'banner-end'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('banner-type').value = 'general';
    document.getElementById('banner-image').value = '';
    document.getElementById('banner-form-msg').textContent = '';
    document.getElementById('banner-form-header').textContent = 'เพิ่มใหม่';
    document.getElementById('banner-cancel-btn').style.display = 'none';
    document.getElementById('banner-submit-btn').innerHTML = '<i class="fas fa-plus"></i> เพิ่มแบนเนอร์';
}

async function submitBannerForm() {
    const msg = document.getElementById('banner-form-msg');
    const editId = document.getElementById('banner-edit-id').value;
    const title = document.getElementById('banner-title').value.trim();
    if (!title) { msg.style.color = '#e74c3c'; msg.textContent = 'กรุณากรอกหัวข้อ'; return; }
    try {
        msg.textContent = 'กำลังบันทึก...';
        const fd = new FormData();
        fd.append('title', title);
        fd.append('description', document.getElementById('banner-desc').value.trim());
        fd.append('link_url', document.getElementById('banner-link').value.trim());
        fd.append('banner_type', document.getElementById('banner-type').value);
        const start = document.getElementById('banner-start').value;
        const end = document.getElementById('banner-end').value;
        if (start) fd.append('start_date', start);
        if (end) fd.append('end_date', end);
        const imgFile = document.getElementById('banner-image').files[0];
        if (imgFile) fd.append('image', imgFile);
        const url = editId ? `${API_BASE_URL}/api/banners/${editId}` : `${API_BASE_URL}/api/banners`;
        const method = editId ? 'PUT' : 'POST';
        const res = await fetch(url, { method, headers: getAuthHeaders(), body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
        msg.style.color = '#27ae60';
        msg.textContent = editId ? 'อัปเดตสำเร็จ!' : 'เพิ่มแบนเนอร์สำเร็จ!';
        resetBannerForm();
        loadBannersAdmin();
    } catch (err) {
        msg.style.color = '#e74c3c';
        msg.textContent = err.message;
    }
}

async function deleteBannerById(id) {
    const confirmed = await openActionDialog({
        title: 'ลบแบนเนอร์',
        message: 'ต้องการปิดใช้งานแบนเนอร์นี้หรือไม่?',
        confirmText: 'ลบ'
    });
    if (!confirmed) return;
    try {
        await fetchAuthJson(`${API_BASE_URL}/api/banners/${id}`, { method: 'DELETE' });
        loadBannersAdmin();
    } catch (e) {
        await showActionDialogInfo('เกิดข้อผิดพลาด: ' + e.message, 'ผิดพลาด');
    }
}

// ═════════════════════════════════════════════════════════════════
// Comment moderation admin
// ═════════════════════════════════════════════════════════════════

async function loadReportedComments() {
    try {
        const data = await fetchAuthJson(`${API_BASE_URL}/api/admin/comments/reported`);
        const comments = data.comments || [];
        const badge = document.getElementById('comment-report-count');
        if (badge) badge.textContent = comments.reduce((sum, c) => sum + (c.pending_count || 0), 0);

        if (!comments.length) {
            setEmptyRow('comment-report-table', 6, 'ไม่มีคอมเมนต์ที่ถูกรายงาน');
            return;
        }

        document.getElementById('comment-report-table').innerHTML = comments.map(c => `
            <tr>
                <td>${escapeHtml(c.author_name || '-')}<br><small style="color:#888">${escapeHtml(c.author_phone || '')}</small></td>
                <td style="max-width:280px;white-space:normal">${escapeHtml(c.content || '')}</td>
                <td>#${c.post_id}</td>
                <td>${c.report_count} ครั้ง (${c.pending_count} รอตรวจ)</td>
                <td>${new Date(c.created_at).toLocaleDateString('th-TH')}</td>
                <td>
                    <button class="btn btn-del" style="font-size:11px;padding:4px 8px" onclick="moderateCommentAction(${c.comment_id}, 'delete')"><i class="fas fa-trash"></i> ลบ</button>
                    <button class="btn btn-toggle" style="font-size:11px;padding:4px 8px" onclick="moderateCommentAction(${c.comment_id}, 'dismiss')">เพิกเฉย</button>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        setEmptyRow('comment-report-table', 6, 'โหลดไม่ได้: ' + e.message);
    }
}

async function moderateCommentAction(commentId, action) {
    const confirmed = await openActionDialog({
        title: action === 'delete' ? 'ลบคอมเมนต์' : 'เพิกเฉยรายงาน',
        message: action === 'delete' ? 'ต้องการลบคอมเมนต์นี้หรือไม่?' : 'ต้องการเพิกเฉยรายงานนี้หรือไม่?',
        confirmText: action === 'delete' ? 'ลบ' : 'เพิกเฉย'
    });
    if (!confirmed) return;
    try {
        await fetchAuthJson(`${API_BASE_URL}/api/admin/comments/${commentId}/moderate`, {
            method: 'POST',
            body: JSON.stringify({ action })
        });
        loadReportedComments();
    } catch (e) {
        await showActionDialogInfo('เกิดข้อผิดพลาด: ' + e.message, 'ผิดพลาด');
    }
}

// ═════════════════════════════════════════════════════════════════
// Groups admin
// ═════════════════════════════════════════════════════════════════

let _groupCache = [];

async function loadGroupsAdmin() {
    const el = document.getElementById('group-list');
    if (!el) return;
    el.innerHTML = '<div style="color:#888;font-size:12px">กำลังโหลด...</div>';
    try {
        const res = await fetch(`${API_BASE_URL}/api/groups`);
        const list = await res.json();
        _groupCache = list;
        if (!list.length) { el.innerHTML = '<div style="color:#aaa;font-size:12px;text-align:center">ยังไม่มีกลุ่ม</div>'; return; }
        el.innerHTML = list.map(g => `
            <div style="background:#f9f9f9;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;display:flex;align-items:center;gap:10px">
                <div style="width:36px;height:36px;border-radius:50%;background:${g.color_hex || '#ccc'};flex-shrink:0;display:flex;align-items:center;justify-content:center">
                    <i class="fas fa-people-group" style="color:#fff;font-size:14px"></i>
                </div>
                <div style="flex:1;min-width:0">
                    <div style="font-size:13px;font-weight:600">${escapeHtml(g.name)}</div>
                    <div style="font-size:11px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(g.description || '')}</div>
                </div>
                <button class="btn btn-check" style="font-size:10px;padding:3px 8px;flex-shrink:0" onclick="editGroup(${g.group_id})"><i class="fas fa-pen"></i></button>
                <button class="btn btn-del" style="font-size:10px;padding:3px 8px;flex-shrink:0" onclick="deleteGroupById(${g.group_id})"><i class="fas fa-trash"></i></button>
            </div>
        `).join('');
    } catch (e) {
        el.innerHTML = '<div style="color:#e74c3c;font-size:12px">โหลดไม่ได้</div>';
    }
}

function editGroup(id) {
    const g = _groupCache.find(x => x.group_id === id);
    if (!g) return;
    document.getElementById('group-edit-id').value = id;
    document.getElementById('group-name').value = g.name || '';
    document.getElementById('group-desc').value = g.description || '';
    document.getElementById('group-icon').value = g.icon || '';
    document.getElementById('group-color').value = g.color_hex || '';
    document.getElementById('group-form-header').textContent = 'แก้ไข';
    document.getElementById('group-cancel-btn').style.display = '';
    document.getElementById('group-submit-btn').innerHTML = '<i class="fas fa-save"></i> บันทึกการแก้ไข';
}

function resetGroupForm() {
    document.getElementById('group-edit-id').value = '';
    ['group-name', 'group-desc', 'group-icon', 'group-color'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('group-form-msg').textContent = '';
    document.getElementById('group-form-header').textContent = 'เพิ่มใหม่';
    document.getElementById('group-cancel-btn').style.display = 'none';
    document.getElementById('group-submit-btn').innerHTML = '<i class="fas fa-plus"></i> เพิ่มกลุ่ม';
}

async function submitGroupForm() {
    const msg = document.getElementById('group-form-msg');
    const editId = document.getElementById('group-edit-id').value;
    const name = document.getElementById('group-name').value.trim();
    if (!name) { msg.style.color = '#e74c3c'; msg.textContent = 'กรุณากรอกชื่อกลุ่ม'; return; }
    try {
        msg.textContent = 'กำลังบันทึก...';
        const body = JSON.stringify({
            name,
            description: document.getElementById('group-desc').value.trim(),
            icon: document.getElementById('group-icon').value.trim(),
            color_hex: document.getElementById('group-color').value.trim()
        });
        const url = editId ? `${API_BASE_URL}/api/groups/${editId}` : `${API_BASE_URL}/api/groups`;
        const method = editId ? 'PUT' : 'POST';
        await fetchAuthJson(url, { method, body });
        msg.style.color = '#27ae60';
        msg.textContent = editId ? 'อัปเดตสำเร็จ!' : 'เพิ่มกลุ่มสำเร็จ!';
        resetGroupForm();
        loadGroupsAdmin();
    } catch (err) {
        msg.style.color = '#e74c3c';
        msg.textContent = err.message;
    }
}

async function deleteGroupById(id) {
    const confirmed = await openActionDialog({
        title: 'ลบกลุ่ม',
        message: 'ต้องการลบกลุ่มนี้หรือไม่? โพสต์ในกลุ่มจะยังคงอยู่',
        confirmText: 'ลบ'
    });
    if (!confirmed) return;
    try {
        await fetchAuthJson(`${API_BASE_URL}/api/groups/${id}`, { method: 'DELETE' });
        loadGroupsAdmin();
    } catch (e) {
        await showActionDialogInfo('เกิดข้อผิดพลาด: ' + e.message, 'ผิดพลาด');
    }
}
