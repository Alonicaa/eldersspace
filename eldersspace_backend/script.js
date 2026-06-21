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

    // Always use localhost:3000 for development/local testing
    return 'http://localhost:3000';
}

const API_BASE_URL = resolveApiBaseUrl();
const ADMIN_TOKEN_KEY = 'elderspace_admin_token';
const ADMIN_PROFILE_KEY = 'elderspace_admin_profile';
const ADS_STORAGE_KEY = 'elderspace_admin_ads_drafts';

let activityChart;
let dashboardPayload = null;
let adminOtpRequestedPhone = '';
let currentPostDetail = null;
let currentUserDetail = null;
let adDrafts = [];
let actionDialogResolve = null;
let currentActivityView = 'today'; // 'today' | 'week' | 'month'
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
let moderationFiltersBound = false;
let currentContentFilter = 'all';
let currentContentSearchQuery = '';
let currentReportFilter = 'pending';
let contentMonitorSourceRows = [];
let reportQueueSourceRows = [];
let companySourceRows = [];
let currentCompanySearchQuery = '';


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
            throw new Error(data?.error || 'เข้าสู่ระบบไม่สำเร็จ');
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
            throw new Error(data?.error || 'ขอ OTP ไม่สำเร็จ');
        }

        adminOtpRequestedPhone = phone_number;
        if (otpInput) {
            otpInput.disabled = false;
            otpInput.focus();
        }
        if (verifyBtn) verifyBtn.disabled = false;
        if (otpHint) {
            otpHint.textContent = data?.otp
                ? `OTP (ทดสอบ): ${data.otp} | หมดอายุใน 5 นาที`
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
    
    // Setup reward settings page
    const navGroup = document.querySelector('.nav-group');
    if (navGroup) {
        navGroup.addEventListener('click', async (e) => {
            if (e.target.closest('[onclick*="navTo(\'rewards\'"]')) {
                await loadRewardSettings();
                await loadDailyLoginSettings();
                await loadStreakMilestoneSettings();
                await loadActivityRewardSettings();
                await loadBonusEvents();
            }
        });
    }
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
        
        document.getElementById('daily-login-bonus').value = dailyLoginBonus;
        
        const summaryEl = document.getElementById('daily-login-current');
        if (summaryEl) {
            summaryEl.textContent = `ค่าปัจจุบันจากระบบ: ${dailyLoginBonus} แต้ม/วัน`;
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

        if (!Number.isFinite(dailyLoginBonus) || dailyLoginBonus <= 0) {
            await showActionDialogInfo('❌ แต้มต่อการเข้าสู่ระบบต้องมากกว่า 0', 'ตรวจสอบข้อมูล');
            return;
        }

        const confirmed = await openActionDialog({
            title: 'ยืนยันการบันทึก Daily Login Settings',
            message: `แต้มต่อการเข้าสู่ระบบรายวัน: ${dailyLoginBonus} แต้ม`,
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
                daily_login_bonus: dailyLoginBonus
            })
        });

        if (!response.ok) throw new Error('Failed to save settings');
        
        const result = await response.json();
        if (result.success) {
            await loadDailyLoginSettings();
            await showActionDialogInfo(
                `✅ บันทึกการตั้งค่าสำเร็จ\n` +
                `แต้มต่อการเข้าสู่ระบบรายวัน: ${dailyLoginBonus} แต้ม`,
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
        // Load reward settings when navigating to rewards page
        if (page === 'rewards') {
            loadRewardSettings();
            loadDailyLoginSettings();
            loadStreakMilestoneSettings();
            loadActivityRewardSettings();
            loadBonusEvents();
        }

        if (page === 'reward-catalog') {
            loadRewardCategories();
            loadRewardsCatalog();
        }

        if (page === 'promo-codes') {
            loadRewardsForUpload();
            const csvTemplateBtn = document.getElementById('promo-csv-template-btn');
            const csvUploadBtn = document.getElementById('promo-csv-upload-btn');
            if (csvTemplateBtn) csvTemplateBtn.onclick = downloadCsvTemplate;
            if (csvUploadBtn) csvUploadBtn.onclick = uploadPromoCodesToCampaign;
        }

        if (page === 'promo-verifier') {
            initPromoVerifier();  // Load campaigns for verifier
        }

        if (page === 'ads') {
            renderAds();
        }
    } else {
        document.getElementById('page-fallback').classList.add('active');
        document.getElementById('fallback-name').innerText = page;
    }
}

function findNavItemByPage(page) {
    return document.querySelector(`.nav-item[onclick*="navTo('${page}'"]`);
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

    const resolveProfilePictureUrl = (picture) => {
        if (!picture || !String(picture).trim()) return '';

        const raw = String(picture).trim();
        if (/^https?:\/\//i.test(raw)) return raw;

        // รองรับ path จาก DB เช่น "avatars/...", "uploads/...", "/uploads/..."
        const normalized = raw.replace(/^\/+/, '');
        if (normalized.startsWith('uploads/')) {
            return `${API_BASE_URL}/${normalized}`;
        }

        return `${API_BASE_URL}/uploads/${normalized}`;
    };

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
                    <button class="btn btn-check" data-company-action="view" type="button">ดูข้อมูล</button>
                    <button class="btn btn-check" data-company-action="manage" style="background:var(--i-cyan)" type="button">จัดการบัญชี</button>
                    <button class="btn btn-del" data-company-action="${blocked ? 'unblock' : 'block'}" type="button">${blocked ? 'ปลดบล็อค' : 'บล็อคบัญชี'}</button>
                </td>
            </tr>
        `;
    }).join('');
}

// ============================================================
// REDEMPTION HISTORY (Admin)
// ============================================================
async function loadRedemptions(page = 1) {
    try {
        const search = (document.getElementById('redemption-search')?.value || '').trim();
        const status = (document.getElementById('redemption-status-filter')?.value || '').trim();
        const dateFrom = (document.getElementById('redemption-date-from')?.value || '').trim();
        const dateTo = (document.getElementById('redemption-date-to')?.value || '').trim();
        const limit = 50;

        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (status) params.append('status', status);
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);
        params.append('page', String(page));
        params.append('limit', String(limit));

        setEmptyRow('redemptions-table', 7, 'กำลังโหลด...');

        const url = `${API_BASE_URL}/api/redemptions?${params.toString()}`;
        const response = await fetch(url, { headers: { ...getAuthHeaders() } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            console.error('Failed to load redemptions:', data);
            setEmptyRow('redemptions-table', 7, 'ไม่สามารถโหลดข้อมูลได้');
            return;
        }

        const rows = Array.isArray(data?.data) ? data.data : [];
        const pagination = data?.pagination || { page: 1, limit, total: rows.length, pages: 1 };
        renderRedemptions(rows, pagination);
    } catch (err) {
        console.error('Error loading redemptions:', err);
        setEmptyRow('redemptions-table', 7, 'เกิดข้อผิดพลาดขณะโหลดข้อมูล');
    }
}

function renderRedemptions(rows, pagination = {}) {
    const tbody = document.getElementById('redemptions-table');
    if (!tbody) return;

    if (!rows || rows.length === 0) {
        setEmptyRow('redemptions-table', 7, 'ไม่พบรายการแลกรางวัล');
        return;
    }

    tbody.innerHTML = rows.map((r) => {
        const id = r.redemption_id || r.id || '';
        const phone = escapeHtml(r.phone_number || r.phone || '-');
        const name = escapeHtml(r.user_name || r.full_name || '-');
        const reward = escapeHtml(r.reward_name || '-');
        const points = Number(r.points_redeemed ?? r.points ?? 0);
        const pointsDisplay = `${points >= 0 ? '+' : ''}${points}`;
        const redeemedAt = formatDate(r.redeemed_at || r.created_at || r.redeemedAt || r.createdAt);
        const status = escapeHtml(r.redemption_status || r.status || '-');
        const qr = escapeHtml(r.qr_code || r.code || '-');

        return `
        <tr>
            <td>${phone}<div class="user-subtext">${name}</div></td>
            <td>${reward}</td>
            <td style="text-align:right;">${pointsDisplay} แต้ม</td>
            <td>${redeemedAt}</td>
            <td>${status}</td>
            <td>${qr}</td>
            <td>
                <button class="btn btn-check" type="button" onclick="openRedemptionDetail('${id}')">ดู</button>
            </td>
        </tr>`;
    }).join('');
}

async function openRedemptionDetail(redemptionId) {
    if (!redemptionId) return;
    try {
        const payload = await fetchAuthJson(`${API_BASE_URL}/api/redemptions/${encodeURIComponent(redemptionId)}`);
        // Show modal with details (reuse action dialog for now)
        await openActionDialog({ title: 'รายละเอียดการแลกรางวัล', message: JSON.stringify(payload?.data || payload || {}, null, 2), confirmText: 'ปิด', showCancel: false, confirmClass: 'btn btn-check' });
    } catch (err) {
        console.error('Failed to open redemption detail:', err);
        await showActionDialogInfo('ไม่สามารถดึงรายละเอียดการแลกรางวัลได้');
    }
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

function loadAdsFromStorage() {
    try {
        const raw = localStorage.getItem(ADS_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function saveAdsToStorage() {
    localStorage.setItem(ADS_STORAGE_KEY, JSON.stringify(adDrafts));
}

function renderAdsTable() {
    const tbody = document.getElementById('ads-table');
    if (!tbody) return;

    if (!adDrafts || adDrafts.length === 0) {
        setEmptyRow('ads-table', 5, 'ยังไม่มีโฆษณาที่สร้างไว้');
        return;
    }

    tbody.innerHTML = adDrafts.map((ad) => `
        <tr data-ad-id="${ad.id}">
            <td>${escapeHtml(ad.title)}</td>
            <td>${escapeHtml(getAdTargetLabel(ad.targetPage))}</td>
            <td>${escapeHtml(ad.startDate)} - ${escapeHtml(ad.endDate)}</td>
            <td><span class="badge ${ad.active ? 'bg-success' : 'badge-neutral'}">${ad.active ? 'กำลังแสดงผล' : 'ปิดใช้งาน'}</span></td>
            <td>
                <button class="btn btn-check" data-ad-action="toggle" type="button">${ad.active ? 'ปิดโฆษณา' : 'เปิดโฆษณา'}</button>
                <button class="btn btn-del" data-ad-action="delete" type="button">ลบ</button>
            </td>
        </tr>
    `).join('');
}

function renderAds(rows = []) {
    if (Array.isArray(rows) && rows.length > 0) {
        adDrafts = rows.map((row) => ({
            id: row.id || row.ad_id || Date.now() + Math.floor(Math.random() * 1000),
            title: row.title || row.ad_title || 'ไม่ได้ระบุหัวข้อ',
            targetPage: row.targetPage || row.target_page || 'home_feed',
            startDate: row.startDate || row.start_date || '-',
            endDate: row.endDate || row.end_date || '-',
            copy: row.copy || row.message || '',
            active: Boolean(row.active ?? row.is_active ?? true)
        }));
        saveAdsToStorage();
    } else if (!adDrafts.length) {
        adDrafts = loadAdsFromStorage();
    }

    renderAdsTable();
}

function resetAdForm() {
    const adTitle = document.getElementById('ad-title');
    const adTargetPage = document.getElementById('ad-target-page');
    const adStartDate = document.getElementById('ad-start-date');
    const adEndDate = document.getElementById('ad-end-date');
    const adCopy = document.getElementById('ad-copy');

    if (adTitle) adTitle.value = '';
    if (adTargetPage) adTargetPage.value = 'home_feed';
    if (adStartDate) adStartDate.value = '';
    if (adEndDate) adEndDate.value = '';
    if (adCopy) adCopy.value = '';
}

function saveAdDraft() {
    const title = (document.getElementById('ad-title')?.value || '').trim();
    const targetPage = document.getElementById('ad-target-page')?.value || 'home_feed';
    const startDate = document.getElementById('ad-start-date')?.value || '';
    const endDate = document.getElementById('ad-end-date')?.value || '';
    const copy = (document.getElementById('ad-copy')?.value || '').trim();

    if (!title || !startDate || !endDate || !copy) {
        alert('กรุณากรอกข้อมูลโฆษณาให้ครบทุกช่อง');
        return;
    }

    if (new Date(startDate) > new Date(endDate)) {
        alert('วันสิ้นสุดต้องไม่ก่อนวันเริ่มต้น');
        return;
    }

    adDrafts.unshift({
        id: Date.now(),
        title,
        targetPage,
        startDate,
        endDate,
        copy,
        active: true
    });

    saveAdsToStorage();
    renderAdsTable();
    resetAdForm();
}

function handleAdTableAction(action, adId) {
    const adIndex = adDrafts.findIndex((ad) => String(ad.id) === String(adId));
    if (adIndex < 0) return;

    if (action === 'delete') {
        adDrafts.splice(adIndex, 1);
        saveAdsToStorage();
        renderAdsTable();
        return;
    }

    if (action === 'toggle') {
        adDrafts[adIndex].active = !adDrafts[adIndex].active;
        saveAdsToStorage();
        renderAdsTable();
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
            ? '<span style="color:#dc3545; font-weight:bold;"><i class="fas fa-ban"></i> Blocked</span>' 
            : '<span style="color:#28a745; font-weight:bold;"><i class="fas fa-check-circle"></i> Active</span>';
        
        return `
            <tr style="${rank <= 3 ? 'background: rgba(255,215,0,0.1); font-weight: bold;' : ''}">
                <td style="font-size:1.2rem;">${rankBadge}</td>
                <td>${escapeHtml(row.name)}</td>
                <td>${escapeHtml(row.phone)}</td>
                <td><b>${formatNumber(row.totalPoints)}</b></td>
                <td>${formatNumber(row.streak)} วัน</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn btn-sm" onclick="editUserPoints(${row.userId})" title="แก้ไขแต้ม">
                        <i class="fas fa-edit"></i> แก้ไข
                    </button>
                    <button class="btn btn-sm" onclick="viewPointsHistory(${row.userId})" title="ดูประวัติแต้ม">
                        <i class="fas fa-history"></i> ประวัติ
                    </button>
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
    if (modal) modal.style.display = 'flex';
    
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
    if (modal) modal.style.display = 'none';
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

    // Always lock axis labels by selected mode to prevent stale weekday labels on DAU view.
    const labels = (currentActivityView === 'week' && activity.labels && activity.labels.length === 7)
        ? activity.labels
        : defaultLabels;
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
    
    if (view === 'today') {
        if (todayBtn) todayBtn.classList.add('active');
        if (weekBtn) weekBtn.classList.remove('active');
        if (monthBtn) monthBtn.classList.remove('active');
        currentActivityView = 'today';
        if (fullDashboardActivity && fullDashboardActivity.today) {
            updateChart(fullDashboardActivity.today);
        }
    } else if (view === 'week') {
        if (todayBtn) todayBtn.classList.remove('active');
        if (weekBtn) weekBtn.classList.add('active');
        if (monthBtn) monthBtn.classList.remove('active');
        currentActivityView = 'week';
        if (fullDashboardActivity && fullDashboardActivity.week) {
            updateChart(fullDashboardActivity.week);
        }
    } else if (view === 'month') {
        if (todayBtn) todayBtn.classList.remove('active');
        if (weekBtn) weekBtn.classList.remove('active');
        if (monthBtn) monthBtn.classList.add('active');
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

        // Store activity data for Today/Week/Month views
        fullDashboardActivity = {
            today: data.activity || {},
            week: data.activityWeekly || {},
            month: data.activityMonthly || {}
        };

        if (!fullDashboardActivity.week || Object.keys(fullDashboardActivity.week).length === 0) {
            fullDashboardActivity.week = {
                labels: ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'],
                usersSeries: Array(7).fill(0)
            };
        }

        if (!fullDashboardActivity.month || Object.keys(fullDashboardActivity.month).length === 0) {
            fullDashboardActivity.month = {
                labels: Array.from({ length: 30 }, (_, i) => String(i + 1)),
                usersSeries: Array(30).fill(0)
            };
        }

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
        setEmptyRow('ads-table', 5, 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ');
        setEmptyRow('points-table', 4, 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ');
        setEmptyRow('security-table', 3, 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ');
    }
}

window.navTo = navTo;
window.switchActivityView = switchActivityView;

document.addEventListener('DOMContentLoaded', async () => {
    const loginForm = document.getElementById('admin-login-form');
    const logoutBtn = document.getElementById('logout-btn');
    const requestOtpBtn = document.getElementById('request-otp-btn');
    const saveAdBtn = document.getElementById('save-ad-btn');
    const resetAdBtn = document.getElementById('reset-ad-btn');
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
    if (saveAdBtn) saveAdBtn.addEventListener('click', saveAdDraft);
    if (resetAdBtn) resetAdBtn.addEventListener('click', resetAdForm);
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

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closePostDetailModal();
            closeUserDetailModal();
            closeActionDialog(false);
        }
    });

    // Bind reward form close button if exists
    const rewardFormContainer = document.getElementById('reward-create-form');
    if (rewardFormContainer) {
        // Form will be loaded when navigating to reward-catalog page
    }

    initChart(['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'], [0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]);
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
    }
}

function closeCreateRewardForm() {
    const form = document.getElementById('reward-create-form');
    if (form) {
        form.style.display = 'none';
        form.dataset.isEditing = 'false';
        delete form.dataset.rewardId;
        
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
        const points = parseInt(document.getElementById('reward-points')?.value || 0);
        const category = getRewardCategoryValue();
        const imageInput = document.getElementById('reward-image');
        const imageFile = imageInput?.files[0];
        const description = document.getElementById('reward-description')?.value?.trim() || '';
        const expiry_date = document.getElementById('reward-expiry')?.value || '';
        const is_active = document.getElementById('reward-active')?.checked ?? true;
        const campaign_start_date = document.getElementById('reward-campaign-start')?.value || '';
        const campaign_end_date = document.getElementById('reward-campaign-end')?.value || '';
        const user_limit = parseInt(document.getElementById('reward-user-limit')?.value || -1) || -1;
        const usage_instructions = document.getElementById('reward-usage-instructions')?.value?.trim() || '';
        const validity_hours = parseInt(document.getElementById('reward-validity-hours')?.value || 1) || 1;

        console.log('Form data:', { name, points, category, imageFile, description, is_active, campaign_start_date, campaign_end_date, user_limit, usage_instructions, validity_hours });

        if (!name || !points || isNaN(points) || points < 1) {
            alert('กรุณากรอกชื่อรางวัลและจำนวนแต้มให้ถูกต้อง');
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
        loadRewardsCatalog();
    } catch (err) {
        console.error('Save reward error:', err);
        alert('เกิดข้อผิดพลาดในการบันทึก: ' + err.message);
    }
}

async function loadRewardsCatalog() {
    const tableBody = document.getElementById('rewards-list-table');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> กำลังโหลด...</td></tr>';

    try {
        console.log('Loading rewards from:', `${API_BASE_URL}/api/admin/rewards?limit=100`);
        const response = await fetch(`${API_BASE_URL}/api/admin/rewards?limit=100`, {
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

        if (rewards.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">ไม่มีรางวัลอยู่ในระบบ</td></tr>';
            return;
        }

        tableBody.innerHTML = rewards.map(reward => `
            <tr style="border-top: 1px solid var(--border); transition: background 0.15s;" onmouseover="this.style.background='var(--bg-card-alt)'" onmouseout="this.style.background=''">
                <td style="text-align: center; padding: 1rem;">
                    ${reward.image_url ? `<img src="${reward.image_url}" style="width: 45px; height: 45px; border-radius: 6px; object-fit: cover; border: 1px solid var(--border);">` : '<div style="width: 45px; height: 45px; display: flex; align-items: center; justify-content: center; background: var(--bg-card-alt); border-radius: 6px; border: 1px solid var(--border);"><i class="fas fa-image" style="color: var(--text-muted);"></i></div>'}
                </td>
                <td style="text-align: left; padding: 1rem;">
                    <strong style="color: var(--text-primary); font-weight: 600;">${reward.reward_name}</strong>
                    ${reward.description ? `<br><small style="color: var(--text-secondary); display: block; margin-top: 0.3rem; line-height: 1.4;">${reward.description}</small>` : ''}
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
                    <span style="padding: 0.35rem 0.7rem; border-radius: 6px; font-size: 0.85rem; font-weight: 500; ${reward.is_active ? 'background: rgba(16,185,129,0.15); color: var(--green);' : 'background: rgba(239,68,68,0.15); color: var(--red);'}">
                        ${reward.is_active ? '<i class="fas fa-check-circle"></i> เปิดใช้' : '<i class="fas fa-times-circle"></i> ปิด'}
                    </span>
                </td>
                <td style="text-align: center; padding: 1rem;">
                    <div style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
                        <button class="btn btn-ghost" onclick="editReward(${reward.reward_id})" style="padding: 0.35rem 0.7rem; font-size: 0.85rem; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--text-secondary); cursor: pointer; transition: 0.15s;" onmouseover="this.style.background='var(--bg-card-alt)'; this.style.color='var(--blue)';" onmouseout="this.style.background='transparent'; this.style.color='var(--text-secondary)';">
                            <i class="fas fa-edit"></i> แก้ไข
                        </button>
                        <button class="btn btn-del" onclick="deleteReward(${reward.reward_id})" style="padding: 0.35rem 0.7rem; font-size: 0.85rem; border: 1px solid rgba(239,68,68,0.3); border-radius: 6px; background: rgba(239,68,68,0.1); color: var(--red); cursor: pointer; transition: 0.15s;" onmouseover="this.style.background='rgba(239,68,68,0.2)';" onmouseout="this.style.background='rgba(239,68,68,0.1)';">
                            <i class="fas fa-trash"></i> ลบ
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Load rewards error:', err);
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--red);">เกิดข้อผิดพลาดในการโหลดข้อมูล</td></tr>';
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

        await loadRewardCategories(reward.category || '');
        showCreateRewardForm();
    } catch (err) {
        console.error('Load reward detail error:', err);
        alert('เกิดข้อผิดพลาดในการโหลดข้อมูล: ' + err.message);
    }
}

async function updateReward(rewardId) {
    console.log('updateReward() called for ID:', rewardId);
    
    const name = document.getElementById('reward-name')?.value?.trim() || '';
    const points = parseInt(document.getElementById('reward-points')?.value || 0);
    const category = getRewardCategoryValue();
    const imageInput = document.getElementById('reward-image');
    const imageFile = imageInput?.files[0];
    const description = document.getElementById('reward-description')?.value?.trim() || '';
    const expiry_date = document.getElementById('reward-expiry')?.value || '';
    const is_active = document.getElementById('reward-active')?.checked ?? true;
    const campaign_start_date = document.getElementById('reward-campaign-start')?.value || '';
    const campaign_end_date = document.getElementById('reward-campaign-end')?.value || '';
    const user_limit = parseInt(document.getElementById('reward-user-limit')?.value || -1) || -1;
    const usage_instructions = document.getElementById('reward-usage-instructions')?.value?.trim() || '';
    const validity_hours = parseInt(document.getElementById('reward-validity-hours')?.value || 1) || 1;

    if (!name || !points || isNaN(points) || points < 1) {
        alert('กรุณากรอกชื่อรางวัลและจำนวนแต้มให้ถูกต้อง');
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
        // Navigate to Promo Code Manager page
        navTo('promo-codes', document.querySelector('[data-page="promo-codes"]'));
        
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
                                    <td style="text-align: left; padding: 1rem; font-family: monospace; font-weight: 500;">${code.code || code.promo_code}</td>
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

    const selected = rewardSelect.options[rewardSelect.selectedIndex];
    if (!rewardSelect.value) {
        infoDiv.style.display = 'none';
        return;
    }

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

    infoDiv.style.display = 'block';
}

async function loadRewardUploadHistory(rewardId) {
    const historyContent = document.getElementById('promo-upload-history-content');
    if (!historyContent) return;

    historyContent.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังโหลด...';

    try {
        const response = await fetch(`${API_BASE_URL}/api/admin/campaigns`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error('ไม่สามารถโหลดประวัติได้');

        const data = await response.json();
        const campaigns = data.data || [];
        const rewardCampaigns = campaigns.filter(c => c.reward_id == rewardId);
        
        let allBatches = [];
        rewardCampaigns.forEach(campaign => {
            const batches = campaign.batches || [];
            allBatches = allBatches.concat(batches);
        });

        if (allBatches.length === 0) {
            historyContent.innerHTML = '<span style="color: var(--text-muted);">ยังไม่มีการอัพโหลดโค้ดสำหรับรางวัลนี้</span>';
            return;
        }

        historyContent.innerHTML = allBatches.map((batch, i) => {
            const uploadDate = batch.uploaded_at
                ? new Date(batch.uploaded_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : '-';
            const count = batch.codes?.length || 0;
            const usedCount = batch.codes?.filter(c => c.is_used).length || 0;
            return `
                <div style="display: flex; align-items: center; gap: 1.5rem; padding: 0.6rem 0.8rem; background: var(--bg-card); border-radius: 6px; margin-bottom: 0.4rem; border: 1px solid var(--border);">
                    <div style="min-width: 80px; font-weight: 600; color: var(--text-primary);">ชุดที่ ${i + 1}</div>
                    <div style="color: var(--text-secondary);">อัพโหลด: <strong>${uploadDate}</strong></div>
                    <div style="color: var(--blue); font-weight: 600;">${count} โค้ด</div>
                    <div style="color: var(--text-secondary);">ใช้แล้ว: <span style="color: ${usedCount > 0 ? 'var(--green)' : 'var(--text-muted);'};\">${usedCount}</span></div>
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

        if (resultDiv) resultDiv.style.display = 'block';

        if (response.ok && result.success) {
            if (resultDiv) resultDiv.style.background = 'rgba(16,185,129,0.1)';
            if (messageDiv) messageDiv.innerHTML = `<span style="color: var(--green); font-weight: 600;"><i class="fas fa-check-circle"></i> อัพโหลดสำเร็จ!</span>`;
            if (detailsDiv) detailsDiv.innerHTML = `
                รางวัล: <strong>${rewardName}</strong><br>
                อัพโหลดสำเร็จ: <strong style="color:var(--green);">${result.successCount}</strong> โค้ด
                ${result.errorCount > 0 ? ` | ล้มเหลว: <strong style="color:var(--red);">${result.errorCount}</strong> โค้ด` : ''}
                <br>วันที่อัพโหลด: ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                ${result.errors?.length > 0 ? `<br><details><summary style="cursor:pointer; color:var(--red);">ดูรายการที่ผิดพลาด (${result.errors.length})</summary><ul style="margin-top:0.5rem;">${result.errors.map(e => `<li>${e.code}: ${e.error}</li>`).join('')}</ul></details>` : ''}
            `;
            // Reload reward info
            await loadRewardsForUpload();
            // Reselect the same reward
            const sel = document.getElementById('promo-reward-select');
            if (sel) { sel.value = rewardSelect.value; showRewardDetails(); }
            if (fileInput) fileInput.value = '';
        } else {
            if (resultDiv) resultDiv.style.background = 'rgba(239,68,68,0.1)';
            if (messageDiv) messageDiv.innerHTML = `<span style="color: var(--red); font-weight: 600;"><i class="fas fa-times-circle"></i> อัพโหลดไม่สำเร็จ</span>`;
            if (detailsDiv) detailsDiv.innerHTML = result.error || 'เกิดข้อผิดพลาด';
        }
    } catch (error) {
        console.error('Upload to reward error:', error);
        if (resultDiv) { resultDiv.style.display = 'block'; resultDiv.style.background = 'rgba(239,68,68,0.1)'; }
        if (messageDiv) messageDiv.innerHTML = `<span style="color: var(--red);"><i class="fas fa-times-circle"></i> ${error.message}</span>`;
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
        const codes = data.data || [];

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
                            <td style="text-align: left; padding: 1rem; font-family: monospace; font-weight: 500;">${code.code || code.promo_code}</td>
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
    const csvContent = 'code,description,expiry_date\nPROMO001,ส่วนลด 50 บาท,2026-12-31\nPROMO002,ส่วนลด 100 บาท,\nPROMO003,,\n';
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
                <td style="text-align: left; padding: 0.75rem; font-weight: 500; color: var(--blue);">
                    <code style="background: var(--bg-card-alt); padding: 0.3rem 0.6rem; border-radius: 4px; font-family: monospace; font-weight: 600;">${code.code}</code>
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

    // Load rewards on initial page load (if user is already on promo-codes page)
    const promoPagesDiv = document.getElementById('page-promo-codes');
    if (promoPagesDiv && promoPagesDiv.classList.contains('active')) {
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
async function loadVerifierRewardCodes(rewardId) {
    if (!rewardId) {
        document.getElementById('verifier-batches-container').innerHTML = '<div style="padding: 3rem; text-align: center; color: var(--text-muted);"><i class="fas fa-mouse-pointer" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>เลือกรางวัลด้านบนเพื่อดูรายการโค้ด</div>';
        document.getElementById('verifier-stats').innerHTML = '';
        const detailPanel = document.getElementById('verifier-campaign-detail');
        if (detailPanel) detailPanel.style.display = 'none';
        return;
    }

    try {
        // Get all campaigns for this reward to get their codes
        const response = await fetch(`${API_BASE_URL}/api/admin/campaigns?reward_id=${rewardId}`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) throw new Error('ไม่สามารถโหลดรายละเอียดรางวัลได้');

        const data = await response.json();
        const campaigns = data.data || [];

        // Show campaign detail panel
        const detailPanel = document.getElementById('verifier-campaign-detail');
        const rewardSelect = document.getElementById('verifier-reward-select');
        const selected = rewardSelect.options[rewardSelect.selectedIndex];
        
        if (detailPanel && selected) {
            detailPanel.style.display = 'block';
            detailPanel.innerHTML = `
                <div style="padding: 1rem; background: var(--bg-card); border-radius: 8px; border: 1px solid var(--border);">
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; font-size: 0.9rem;">
                        <div style="padding: 0.75rem; background: var(--bg-card-alt); border-radius: 6px;">
                            <span style="color: var(--text-secondary); font-size: 0.85rem;">รางวัล:</span>
                            <div style="font-weight: 600; color: var(--text-primary); margin-top: 0.3rem;">${selected.dataset.rewardName}</div>
                        </div>
                        <div style="padding: 0.75rem; background: var(--bg-card-alt); border-radius: 6px;">
                            <span style="color: var(--text-secondary); font-size: 0.85rem;">แต้มที่ต้อง:</span>
                            <div style="font-weight: 600; color: var(--blue); margin-top: 0.3rem;">${selected.dataset.requiredPoints}</div>
                        </div>
                    </div>
                </div>
            `;
        }

        // Collect all codes from all campaigns of this reward
        let allCodes = [];
        campaigns.forEach(campaign => {
            if (campaign.batches && Array.isArray(campaign.batches)) {
                campaign.batches.forEach(batch => {
                    if (batch.codes && Array.isArray(batch.codes)) {
                        allCodes = allCodes.concat(batch.codes);
                    }
                });
            }
        });

        // Calculate stats
        const stats = {
            total: allCodes.length,
            available: allCodes.filter(c => c.status === 'available').length,
            used: allCodes.filter(c => c.status === 'used').length,
            expired: allCodes.filter(c => c.status === 'expired').length
        };

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

        document.getElementById('verifier-stats').innerHTML = statsHtml;

        // Render codes
        const codesHtml = allCodes.map((code, idx) => {
            let statusColor = 'var(--green)';
            let statusBg = 'rgba(16,185,129,0.15)';
            let statusLabel = 'พร้อมใช้';

            if (code.status === 'used') {
                statusColor = 'var(--blue)';
                statusBg = 'rgba(59,130,246,0.15)';
                statusLabel = 'ใช้แล้ว';
            } else if (code.status === 'expired') {
                statusColor = 'var(--red)';
                statusBg = 'rgba(239,68,68,0.15)';
                statusLabel = 'หมดอายุ';
            }

            return `
                <div style="display: grid; grid-template-columns: 200px 1fr 150px 150px 150px auto; gap: 1rem; align-items: center; padding: 0.75rem; background: var(--bg-card); border-bottom: 1px solid var(--border); border-radius: 4px; margin-bottom: 0.5rem;">
                    <div style="font-family: 'Courier New', monospace; font-weight: 600; color: var(--text-primary);">${code.code}</div>
                    <div style="color: var(--text-secondary); font-size: 0.85rem;">${code.description || '-'}</div>
                    <div style="text-align: center; color: var(--text-secondary); font-size: 0.85rem;">${code.used_at ? new Date(code.used_at).toLocaleDateString('th-TH') : '-'}</div>
                    <div style="text-align: center; color: var(--text-secondary); font-size: 0.85rem;">${code.expiry_date ? new Date(code.expiry_date).toLocaleDateString('th-TH') : '-'}</div>
                    <div style="text-align: center; background: ${statusBg}; color: ${statusColor}; padding: 0.3rem 0.6rem; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">${statusLabel}</div>
                </div>
            `;
        }).join('');

        if (codesHtml) {
            const headerHtml = `
                <div style="display: grid; grid-template-columns: 200px 1fr 150px 150px 150px auto; gap: 1rem; padding: 0.75rem; background: var(--bg-card-alt); border-bottom: 2px solid var(--border); border-radius: 4px; margin-bottom: 0.5rem; font-weight: 600; color: var(--text-primary); font-size: 0.85rem;">
                    <div>โค้ด</div>
                    <div>รายละเอียด</div>
                    <div style="text-align: center;">วันที่ใช้</div>
                    <div style="text-align: center;">หมดอายุ</div>
                    <div style="text-align: center;">สถานะ</div>
                </div>
            `;
            document.getElementById('verifier-batches-container').innerHTML = headerHtml + codesHtml;
        } else {
            document.getElementById('verifier-batches-container').innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--text-muted);">ไม่มีโค้ดสำหรับรางวัลนี้</div>';
        }
    } catch (error) {
        console.error('Load codes error:', error);
        document.getElementById('verifier-batches-container').innerHTML = '<div style="padding: 2rem; text-align: center; color: var(--red);">เกิดข้อผิดพลาดในการโหลดโค้ด</div>';
    }
}

// ========== UTILITY FUNCTIONS FOR FILTERING ==========

function applyVerifierFilters() {
    const rewardId = document.getElementById('verifier-reward-select')?.value;
    const searchCode = document.getElementById('verifier-search')?.value || '';
    const statusFilter = document.getElementById('verifier-status-filter')?.value || '';

    if (!rewardId) {
        alert('กรุณาเลือกรางวัลก่อน');
        return;
    }

    // Reload with filters applied
    loadVerifierRewardCodes(rewardId);
}

function resetVerifierFilters() {
    const searchInput = document.getElementById('verifier-search');
    const statusFilter = document.getElementById('verifier-status-filter');
    const dateFrom = document.getElementById('verifier-used-from');
    const dateTo = document.getElementById('verifier-used-to');
    
    if (searchInput) searchInput.value = '';
    if (statusFilter) statusFilter.value = '';
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
    
    const rewardId = document.getElementById('verifier-reward-select')?.value;
    if (rewardId) loadVerifierRewardCodes(rewardId);
}

// Reset verifier filters
function resetVerifierFilters() {
    const campaignId = document.getElementById('verifier-campaign-select')?.value;
    const fields = ['verifier-search', 'verifier-used-from', 'verifier-used-to'];
    fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const statusFilter = document.getElementById('verifier-status-filter');
    if (statusFilter) statusFilter.value = '';
    if (campaignId) loadCampaignCodes(campaignId);
}

// Initialize verifier page
function initPromoVerifier() {
    loadRewardsForVerifier();
}
