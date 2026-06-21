/* ═══════════════════════════════════════════════════════════════════════════
   PROMO CODE VERIFIER V2 — Production Grade Functions
   Overrides/extends manual_override_functions.js
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function pvAdminId() {
    try {
        const p = JSON.parse(localStorage.getItem('elderspace_admin_profile') || '{}');
        return p.user_id || p.phone_number || 'admin';
    } catch { return 'admin'; }
}

function pvAdminName() {
    try {
        const p = JSON.parse(localStorage.getItem('elderspace_admin_profile') || '{}');
        return p.full_name || p.phone_number || 'Admin';
    } catch { return 'Admin'; }
}

function pvAuthHeaders() {
    const token = localStorage.getItem('elderspace_admin_token');
    return {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
}

function pvFmt(v) {
    if (!v) return '-';
    const d = new Date(v);
    if (isNaN(d)) return v;
    return d.toLocaleDateString('th-TH', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function pvFmtDate(v) {
    if (!v) return '-';
    const d = new Date(v);
    if (isNaN(d)) return v;
    return d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
}

function pvToast(msg, type = 'info') {
    const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', warning: 'fa-triangle-exclamation', info: 'fa-circle-info' };
    const icon = icons[type] || icons.info;
    const id = 'pvt-' + Date.now();
    const el = document.createElement('div');
    el.id = id;
    el.className = `toast toast-${type}`;
    el.style.cssText = 'display:flex;align-items:center;gap:8px;';
    el.innerHTML = `<i class="fas ${icon}"></i><span>${msg}</span>`;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.4s'; setTimeout(() => el.remove(), 400); }, 3200);
}

function pvSetBtnLoading(btn, loading) {
    if (!btn) return;
    if (loading) { btn.classList.add('pv-btn-loading'); btn.disabled = true; }
    else { btn.classList.remove('pv-btn-loading'); btn.disabled = false; }
}

function pvCloseAllPortals() {
    ['pv-detail-overlay','pv-detail-drawer-el',
     'pv-modal-overlay-el','pv-modal-el',
     'pv-audit-overlay','pv-audit-drawer-el',
     'pv-qr-overlay','pv-qr-modal-el'].forEach(id => {
        document.getElementById(id)?.remove();
    });
}

// Render status badge (same logic, returns HTML string)
function pvStatusBadge(status) {
    const raw = String(status || '').toLowerCase();
    const norm = (raw === 'available' || raw === 'active' || raw === 'ready') ? 'active'
               : (raw === 'used' || raw === 'manual_redeemed' || raw === 'redeemed') ? 'redeemed' : raw;
    const MAP = {
        active:    { label: 'พร้อมใช้งาน', cls: 'vsb-ready',     icon: 'fa-circle-check' },
        ready:     { label: 'พร้อมใช้งาน', cls: 'vsb-ready',     icon: 'fa-circle-check' },
        redeemed:  { label: 'ใช้งานแล้ว',  cls: 'vsb-redeemed',  icon: 'fa-circle-check' },
        replaced:  { label: 'ถูกแทนที่',   cls: 'vsb-cancelled', icon: 'fa-arrow-right-arrow-left' },
        reserved:  { label: 'จองแล้ว',     cls: 'vsb-reserved',  icon: 'fa-clock' },
        expired:   { label: 'หมดอายุ',     cls: 'vsb-expired',   icon: 'fa-circle-xmark' },
        cancelled: { label: 'ยกเลิกแล้ว', cls: 'vsb-cancelled', icon: 'fa-ban' },
        refunded:  { label: 'คืนแต้มแล้ว', cls: 'vsb-refunded',  icon: 'fa-rotate-left' },
    };
    const m = MAP[norm] || { label: norm || 'ไม่ระบุ', cls: 'vsb-unknown', icon: 'fa-circle-info' };
    return `<span class="verifier-status-badge ${m.cls}"><i class="fas ${m.icon}"></i> ${m.label}</span>`;
}

function pvInfoRow(label, value) {
    return `<div class="pv-info-row"><span class="pv-info-label">${label}</span><span class="pv-info-value">${value || '-'}</span></div>`;
}

function pvSkeletonInfoGroup(rows = 5) {
    return `<div class="pv-sk-info-group">${Array(rows).fill('').map(() =>
        `<div class="pv-sk-info-row"><span class="pv-skeleton pv-sk-row"></span><span class="pv-skeleton pv-sk-row"></span></div>`
    ).join('')}</div>`;
}

// ─── OVERRIDE: renderVerifierActionButtons ─────────────────────────────────
// This overrides the function defined in script.js

function renderVerifierActionButtons(code) {
    const codeId = Number(code?.promo_code_id) || 0;
    const status = String(code?.status || code?.current_status || '').toLowerCase();
    const isUsed = status === 'redeemed' || status === 'used' || status === 'manual_redeemed';
    const isCancelled = status === 'cancelled';
    const isExpired   = status === 'expired';
    const isDisabled  = isUsed || isCancelled || isExpired;

    return `
        <div class="verifier-action-group-v2">
            <button class="verifier-action-btn verify" type="button"
                title="${isDisabled ? 'ไม่สามารถยืนยันได้' : 'ยืนยันการใช้งาน'}"
                ${isDisabled ? 'disabled style="opacity:0.45;cursor:not-allowed;"' : `onclick="pvShowConfirmModal(${codeId})"`}>
                <i class="fas fa-circle-check"></i><span>ยืนยันการใช้งาน</span>
            </button>
        </div>
    `;
}

function pvToggleDropdown(event, codeId) {
    event.stopPropagation();
    const menu = document.getElementById(`pvdm-${codeId}`);
    if (!menu) return;
    const isOpen = menu.classList.contains('open');
    pvCloseDropdowns();
    if (!isOpen) {
        const btn = event.currentTarget;
        const rect = btn.getBoundingClientRect();
        const menuW = 240;
        let left = rect.right - menuW;
        if (left < 4) left = 4;
        menu.style.top  = (rect.bottom + 4) + 'px';
        menu.style.left = left + 'px';
        menu.classList.add('open');
    }
}

function pvCloseDropdowns() {
    document.querySelectorAll('.verifier-dropdown-menu.open').forEach(m => m.classList.remove('open'));
}

document.addEventListener('click', pvCloseDropdowns);

// ═══════════════════════════════════════════════════════════════════════════
// MODAL 1 — DETAIL DRAWER (Right Side Panel)
// ═══════════════════════════════════════════════════════════════════════════

async function pvShowDetailDrawer(codeId) {
    // Remove old if open
    document.getElementById('pv-detail-overlay')?.remove();
    document.getElementById('pv-detail-drawer-el')?.remove();

    // Overlay
    const overlay = document.createElement('div');
    overlay.id = 'pv-detail-overlay';
    overlay.className = 'pv-detail-overlay';
    overlay.onclick = pvCloseDetailDrawer;
    document.body.appendChild(overlay);

    // Drawer skeleton
    const drawer = document.createElement('div');
    drawer.id = 'pv-detail-drawer-el';
    drawer.className = 'pv-detail-drawer';
    drawer.innerHTML = `
        <div class="pv-drawer-hero">
            <button class="pv-drawer-close" onclick="pvCloseDetailDrawer()" title="ปิด"><i class="fas fa-times"></i></button>
            <div class="pv-drawer-hero-code"><span class="pv-skeleton pv-sk-title" style="width:180px;height:22px;"></span></div>
            <div class="pv-drawer-hero-badges"><span class="pv-skeleton" style="width:90px;height:22px;border-radius:6px;"></span></div>
            <div class="pv-drawer-hero-sub"><span class="pv-skeleton" style="width:140px;height:14px;border-radius:4px;"></span></div>
            <div class="pv-drawer-hero-btns">
                <span class="pv-skeleton" style="width:90px;height:28px;border-radius:7px;"></span>
                <span class="pv-skeleton" style="width:80px;height:28px;border-radius:7px;"></span>
            </div>
        </div>
        <div class="pv-drawer-tabs">
            <button class="pv-tab-btn active"><i class="fas fa-circle-info"></i> ข้อมูล</button>
            <button class="pv-tab-btn"><i class="fas fa-timeline"></i> Timeline</button>
            <button class="pv-tab-btn"><i class="fas fa-list-check"></i> Audit</button>
            <button class="pv-tab-btn"><i class="fas fa-gear"></i> จัดการ</button>
        </div>
        <div class="pv-drawer-body">
            ${pvSkeletonInfoGroup(5)}
            ${pvSkeletonInfoGroup(4)}
        </div>
    `;
    document.body.appendChild(drawer);

    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/promo-codes/${codeId}/detail`, {
            headers: pvAuthHeaders()
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const code     = json.data?.code     || {};
        const auditLog = json.data?.auditLog  || [];
        const user     = json.data?.assignedUser || null;
        // Use backend-provided timeline; it already includes synthetic events
        const timeline = json.data?.timeline  || [];

        pvRenderDetailDrawer(drawer, codeId, code, timeline, auditLog, user);
    } catch (err) {
        console.error('[pvShowDetailDrawer]', err);
        // Try DOM fallback
        const row = document.querySelector(`.verifier-row[data-pv-id="${codeId}"]`);
        const fallback = {
            promo_code_id: codeId,
            code: row?.querySelector('.verifier-code-value')?.textContent?.trim() || `#${codeId}`,
            reward_name: row?.dataset.rewardName || row?.querySelector('.verifier-reward-name')?.textContent?.trim() || '-',
            reward_points: Number(row?.dataset.rewardPoints || 0),
            description: row?.dataset.description || null,
            status: row?.dataset.status || 'unknown',
            used_by_phone: row?.dataset.usedPhone || null,
            used_at: row?.dataset.usedAt || null,
            created_at: row?.dataset.createdAt || null,
            expiry_date: row?.dataset.expiry || null,
        };
        pvRenderDetailDrawer(drawer, codeId, fallback, [], [], null);
        pvToast('โหลดข้อมูลบางส่วนไม่ได้ — แสดงข้อมูลจำกัด', 'warning');
    }
}

function pvRenderDetailDrawer(drawer, codeId, code, timeline, auditLog, user) {
    const hasManual = String(code.override_flag || '').toLowerCase() === 'manual_redeemed';

    drawer.innerHTML = `
        <!-- HERO -->
        <div class="pv-drawer-hero">
            <button class="pv-drawer-close" onclick="pvCloseDetailDrawer()" title="ปิด"><i class="fas fa-times"></i></button>
            <div class="pv-drawer-hero-code">${code.code || '-'}</div>
            <div class="pv-drawer-hero-badges">
                ${pvStatusBadge(code.status || code.current_status)}
                ${hasManual ? '<span class="badge-manual-hero"><i class="fas fa-bolt"></i> MANUAL</span>' : ''}
            </div>
            <div class="pv-drawer-hero-sub">
                <span>${code.reward_name || '-'}</span>
                <span class="pv-hero-sep">·</span>
                <span>${code.reward_points || 0} แต้ม</span>
                ${code.expiry_date ? `<span class="pv-hero-sep">·</span><span>หมดอายุ ${pvFmtDate(code.expiry_date)}</span>` : ''}
            </div>
            <div class="pv-drawer-hero-btns">
                <button class="pv-hero-btn" onclick="pvCopyCode('${code.code || ''}')">
                    <i class="fas fa-copy"></i> Copy Code
                </button>
                <button class="pv-hero-btn blue" onclick="pvShowQRModal('${code.code || ''}', ${codeId})">
                    <i class="fas fa-qrcode"></i> เปิด QR
                </button>
                <button class="pv-hero-btn" onclick="pvExportCodeLog(${codeId})">
                    <i class="fas fa-download"></i> Export Log
                </button>
            </div>
        </div>

        <!-- TABS -->
        <div class="pv-drawer-tabs" id="pvdt-tabs-${codeId}">
            <button class="pv-tab-btn active" data-pvtab="info" onclick="pvSwitchDrawerTab('${codeId}','info',this)">
                <i class="fas fa-circle-info"></i> ข้อมูล
            </button>
            <button class="pv-tab-btn" data-pvtab="timeline" onclick="pvSwitchDrawerTab('${codeId}','timeline',this)">
                <i class="fas fa-timeline"></i> Timeline
            </button>
            <button class="pv-tab-btn" data-pvtab="audit" onclick="pvSwitchDrawerTab('${codeId}','audit',this)">
                <i class="fas fa-list-check"></i> Audit
            </button>
            <button class="pv-tab-btn" data-pvtab="actions" onclick="pvSwitchDrawerTab('${codeId}','actions',this)">
                <i class="fas fa-gear"></i> จัดการ
            </button>
        </div>

        <!-- BODY -->
        <div class="pv-drawer-body">

            <!-- TAB: INFO -->
            <div class="pv-tab-panel active" data-pvpanel="info">
                <div class="pv-info-group">
                    <div class="pv-info-group-title"><i class="fas fa-tag"></i> ข้อมูลโค้ด</div>
                    ${pvInfoRow('รหัสโค้ด', `<code class="pv-code-mono">${code.code || '-'}</code>`)}
                    ${pvInfoRow('สถานะ', pvStatusBadge(code.status || code.current_status))}
                    ${pvInfoRow('ประเภทรางวัล', code.reward_type || '-')}
                    ${pvInfoRow('รายละเอียด', code.reward_name || code.description || '-')}
                    ${pvInfoRow('แต้มที่ใช้', `${code.reward_points || 0} แต้ม`)}
                    ${pvInfoRow('Campaign', code.campaign_name || '-')}
                    ${pvInfoRow('Batch', code.batch_id || code.batch_name || '-')}
                    ${pvInfoRow('วันที่สร้าง', pvFmt(code.created_at))}
                    ${pvInfoRow('วันหมดอายุ', code.expiry_date ? pvFmtDate(code.expiry_date) : 'ไม่มีกำหนด')}
                    ${code.override_flag ? pvInfoRow('Override Flag', `<span class="badge-manual-inline">${code.override_flag}</span>`) : ''}
                    ${code.override_reason ? pvInfoRow('เหตุผล Override', code.override_reason) : ''}
                </div>

                <div class="pv-info-group">
                    <div class="pv-info-group-title"><i class="fas fa-user"></i> ข้อมูลผู้ใช้</div>
                    ${user ? `
                        ${pvInfoRow('ชื่อ', user.full_name || '-')}
                        ${pvInfoRow('เบอร์โทร', user.phone_number || '-')}
                        ${pvInfoRow('User ID', user.user_id || '-')}
                        ${pvInfoRow('วันที่แลก', pvFmt(code.used_at))}
                        ${pvInfoRow('IP', user.last_ip || code.device_ip || '-')}
                        ${pvInfoRow('Device', user.device || code.device_info || '-')}
                        ${pvInfoRow('App Version', user.app_version || '-')}
                    ` : `
                        <div class="pv-drawer-empty">
                            <i class="fas fa-user-slash"></i>
                            <p>ยังไม่มีผู้ใช้ที่ผูกกับโค้ดนี้</p>
                        </div>
                    `}
                </div>

                ${auditLog.length > 0 ? `
                <div class="pv-info-group">
                    <div class="pv-info-group-title"><i class="fas fa-shield"></i> Audit ล่าสุด</div>
                    ${auditLog.slice(0, 3).map(log => `
                        <div style="padding:8px 0; border-bottom:1px solid #f9fafb;">
                            <div style="font-size:12.5px; font-weight:600; color:#0f172a; margin-bottom:3px;">
                                ${log.action_label || log.action || '-'}
                            </div>
                            <div style="font-size:11.5px; color:#6b7280; display:flex; gap:10px; flex-wrap:wrap;">
                                <span><i class="fas fa-user-shield" style="font-size:10px;"></i> ${log.admin_name || '-'}</span>
                                <span><i class="fas fa-clock" style="font-size:10px;"></i> ${pvFmt(log.action_timestamp)}</span>
                                ${log.override_reason ? `<span><i class="fas fa-comment-dots" style="font-size:10px;"></i> ${log.override_reason}</span>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
                ` : ''}
            </div>

            <!-- TAB: TIMELINE -->
            <div class="pv-tab-panel" data-pvpanel="timeline">
                ${pvRenderTimeline(timeline)}
            </div>

            <!-- TAB: AUDIT -->
            <div class="pv-tab-panel" data-pvpanel="audit">
                ${pvRenderAuditTimeline(auditLog)}
            </div>

            <!-- TAB: ACTIONS -->
            <div class="pv-tab-panel" data-pvpanel="actions">
                <div class="pv-actions-list">
                    <button class="pv-action-item" type="button" onclick="pvShowConfirmModal(${codeId})">
                        <div class="pv-ai-icon green"><i class="fas fa-circle-check"></i></div>
                        <div class="pv-ai-body">
                            <div class="pv-ai-title">ยืนยันการใช้งาน</div>
                            <div class="pv-ai-desc">บันทึกว่าโค้ดถูกใช้งานแล้วพร้อม Audit Log</div>
                        </div>
                        <i class="fas fa-chevron-right pv-ai-arrow"></i>
                    </button>
                    <button class="pv-action-item" type="button" onclick="pvShowReplaceModal(${codeId})">
                        <div class="pv-ai-icon blue"><i class="fas fa-arrow-right-arrow-left"></i></div>
                        <div class="pv-ai-body">
                            <div class="pv-ai-title">ออกโค้ดใหม่แทน</div>
                            <div class="pv-ai-desc">สร้างโค้ดใหม่ทดแทน เช่น QR สแกนไม่ผ่าน</div>
                        </div>
                        <i class="fas fa-chevron-right pv-ai-arrow"></i>
                    </button>
                    <button class="pv-action-item" type="button" onclick="pvShowAuditDrawer(${codeId})">
                        <div class="pv-ai-icon gray"><i class="fas fa-list-check"></i></div>
                        <div class="pv-ai-body">
                            <div class="pv-ai-title">ดูประวัติ</div>
                            <div class="pv-ai-desc">ดู Audit Log ทั้งหมดพร้อม Export</div>
                        </div>
                        <i class="fas fa-chevron-right pv-ai-arrow"></i>
                    </button>

                    <div class="pv-danger-zone">
                        <div class="pv-danger-zone-label"><i class="fas fa-triangle-exclamation"></i> Danger Zone</div>
                        <button class="pv-action-item danger" type="button" onclick="pvShowCancelCodeModal(${codeId})">
                            <div class="pv-ai-icon red"><i class="fas fa-ban"></i></div>
                            <div class="pv-ai-body">
                                <div class="pv-ai-title">ยกเลิกโค้ด</div>
                                <div class="pv-ai-desc">ยกเลิกถาวร ไม่สามารถใช้งานได้อีก</div>
                            </div>
                            <i class="fas fa-chevron-right pv-ai-arrow"></i>
                        </button>
                    </div>
                </div>
            </div>

        </div>
    `;
}

function pvCloseDetailDrawer() {
    document.getElementById('pv-detail-overlay')?.remove();
    document.getElementById('pv-detail-drawer-el')?.remove();
}

function pvSwitchDrawerTab(codeId, tabName, btn) {
    const drawer = document.getElementById('pv-detail-drawer-el');
    if (!drawer) return;
    drawer.querySelectorAll('.pv-tab-btn').forEach(b => b.classList.remove('active'));
    drawer.querySelectorAll('.pv-tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    drawer.querySelector(`[data-pvpanel="${tabName}"]`)?.classList.add('active');
}

function pvRenderTimeline(events) {
    if (!events?.length) return `<div class="pv-drawer-empty"><i class="fas fa-inbox"></i><p>ยังไม่มีเหตุการณ์ที่บันทึกไว้</p></div>`;
    const EVENT_ICONS = { created:'plus-circle', used:'check-circle', failed:'times-circle', manual_override:'bolt', expired:'hourglass-end', cancelled:'ban', refunded:'rotate-left' };
    const DOT_COLORS  = { created:'dot-green', used:'dot-blue', failed:'dot-red', manual_override:'dot-purple', expired:'dot-red', cancelled:'dot-gray', refunded:'dot-teal' };
    return `<div class="audit-timeline pv-timeline">${events.map((ev, i) => {
        const isLast = i === events.length - 1;
        const icon = EVENT_ICONS[ev.event_type] || 'circle-info';
        const dot  = DOT_COLORS[ev.event_type]  || 'dot-gray';
        return `<div class="atl-item${isLast?' atl-last':''}">
            <div class="atl-spine">
                <div class="atl-dot ${dot}"><i class="fas fa-${icon}"></i></div>
                ${isLast ? '' : '<div class="atl-line"></div>'}
            </div>
            <div class="atl-body">
                <div class="atl-action">${ev.event_title || ev.event_type || '-'}</div>
                <div class="atl-time">${pvFmt(ev.event_timestamp)}</div>
                ${ev.event_description ? `<div class="atl-meta">${ev.event_description}</div>` : ''}
                ${ev.actor_name ? `<div class="atl-meta"><i class="fas fa-user"></i> ${ev.actor_name}</div>` : ''}
            </div>
        </div>`;
    }).join('')}</div>`;
}

function pvRenderAuditTimeline(auditLog) {
    if (!auditLog?.length) return `<div class="pv-drawer-empty"><i class="fas fa-list-check"></i><p>ยังไม่มีรายการ Audit Log</p></div>`;
    const AM = {
        force_redeem: { label:'ใช้งานแทนลูกค้า', dot:'dot-purple', icon:'fa-bolt' },
        reset_status: { label:'เปลี่ยนสถานะ',    dot:'dot-blue',   icon:'fa-rotate' },
        cancel_code:  { label:'ยกเลิกโค้ด',       dot:'dot-red',    icon:'fa-ban' },
        refund:       { label:'คืนแต้ม',           dot:'dot-teal',   icon:'fa-rotate-left' },
        delete_code:  { label:'ลบโค้ด',            dot:'dot-red',    icon:'fa-trash' },
    };
    return `<div class="audit-timeline pv-timeline">${auditLog.map((log, i) => {
        const isLast = i === auditLog.length - 1;
        const am = AM[log.action] || { label: log.action || 'แก้ไข', dot:'dot-gray', icon:'fa-circle' };
        const reason = [log.override_reason, log.override_reason_custom].filter(Boolean).join(' · ');
        const statusChange = (log.old_status || log.new_status)
            ? `<div class="atl-status-row"><span class="atl-status-pill">${log.old_status||'?'}</span><i class="fas fa-arrow-right atl-arrow"></i><span class="atl-status-pill atl-status-pill--new">${log.new_status||'?'}</span></div>`
            : '';
        return `<div class="atl-item${isLast?' atl-last':''}">
            <div class="atl-spine">
                <div class="atl-dot ${am.dot}"><i class="fas ${am.icon}"></i></div>
                ${isLast ? '' : '<div class="atl-line"></div>'}
            </div>
            <div class="atl-body">
                <div class="atl-action">${am.label}</div>
                <div class="atl-time">${pvFmt(log.action_timestamp)}</div>
                ${statusChange}
                ${log.admin_name ? `<div class="atl-meta"><i class="fas fa-user-shield"></i> ${log.admin_name}${log.admin_phone?` · ${log.admin_phone}`:''}</div>` : ''}
                ${reason ? `<div class="atl-meta"><i class="fas fa-comment-dots"></i> ${reason}</div>` : ''}
                ${log.admin_notes ? `<div class="atl-meta atl-note"><i class="fas fa-note-sticky"></i> ${log.admin_notes}</div>` : ''}
                ${log.device_ip ? `<div class="atl-ip">IP ${log.device_ip}</div>` : ''}
            </div>
        </div>`;
    }).join('')}</div>`;
}

function pvCopyCode(code) {
    if (!code || code === '-') return;
    navigator.clipboard?.writeText(code)
        .then(() => pvToast(`คัดลอก "${code}" แล้ว`, 'success'))
        .catch(() => pvToast('ไม่สามารถคัดลอกได้', 'error'));
}

async function pvExportCodeLog(codeId) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/override/audit-log/export?format=json&promo_code_id=${codeId}`, {
            headers: pvAuthHeaders()
        });
        if (!res.ok) throw new Error();
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `audit-log-${codeId}.json`;
        a.click(); URL.revokeObjectURL(url);
        pvToast('ℹ️ Export สำเร็จ', 'info');
    } catch {
        pvToast('ไม่สามารถ Export ได้', 'error');
    }
}

// ─── QR Modal ────────────────────────────────────────────────────────────────

function pvShowQRModal(codeValue, codeId) {
    document.getElementById('pv-qr-overlay')?.remove();
    document.getElementById('pv-qr-modal-el')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'pv-qr-overlay';
    overlay.className = 'pv-modal-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) pvCloseQRModal(); };
    document.body.appendChild(overlay);

    const modal = document.createElement('div');
    modal.id = 'pv-qr-modal-el';
    modal.className = 'pv-modal narrow';
    modal.innerHTML = `
        <div class="pv-modal-header">
            <h2><i class="fas fa-qrcode"></i> QR Code</h2>
            <button class="pv-modal-close" onclick="pvCloseQRModal()"><i class="fas fa-times"></i></button>
        </div>
        <div class="pv-qr-body">
            <div class="pv-qr-code-label">${codeValue}</div>
            <div class="pv-qr-code-sub">สแกน QR เพื่อยืนยันการใช้งาน</div>
            <div id="pv-qr-box"></div>
            <button class="pv-btn pv-btn-ghost pv-btn-sm" onclick="pvCloseQRModal()">ปิด</button>
        </div>
    `;
    overlay.appendChild(modal);

    // Generate QR
    setTimeout(() => {
        const box = document.getElementById('pv-qr-box');
        if (!box) return;
        if (typeof QRCode !== 'undefined') {
            new QRCode(box, {
                text: codeValue,
                width: 200, height: 200,
                colorDark: '#0f172a', colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
        } else {
            box.innerHTML = `<div style="padding:30px 20px; background:#f8fafc; border-radius:8px; font-family:monospace; font-size:14px; color:#0f172a;">${codeValue}</div>`;
        }
    }, 100);
}

function pvCloseQRModal() {
    document.getElementById('pv-qr-overlay')?.remove();
    document.getElementById('pv-qr-modal-el')?.remove();
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL 2 — MANUAL REDEEM (Override improved version)
// ═══════════════════════════════════════════════════════════════════════════

async function pvShowManualRedeemModal(codeId) {
    // Use same ID pattern as original so close functions work
    document.getElementById('pv-manual-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'pv-manual-overlay';
    overlay.className = 'pv-modal-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) pvCloseManualModal(); };
    document.body.appendChild(overlay);

    const modal = document.createElement('div');
    modal.className = 'pv-modal wide';
    modal.innerHTML = `
        <div class="pv-modal-header">
            <h2><i class="fas fa-bolt" style="color:#f97316;"></i> ยืนยันการใช้งานแทนลูกค้า</h2>
            <button class="pv-modal-close" onclick="pvCloseManualModal()"><i class="fas fa-times"></i></button>
        </div>
        <div class="pv-modal-body">
            <div id="pv-manual-code-card" class="pv-code-card">
                ${pvSkeletonInfoGroup(3)}
            </div>
            <div class="pv-warn-card">
                <i class="fas fa-triangle-exclamation"></i>
                <div>
                    <strong>คำเตือน:</strong> การดำเนินการนี้จะเปลี่ยนสถานะโค้ดเป็น
                    <span class="verifier-status-badge vsb-manual" style="font-size:11px;padding:1px 7px;">ใช้งานโดยแอดมิน</span>
                    และถูกบันทึกลง Audit Log พร้อม IP และอุปกรณ์ของคุณ
                </div>
            </div>
            <div class="pv-form-group">
                <label class="pv-form-label">เหตุผลการ Override <span class="req">*</span></label>
                <select id="pv-manual-reason" class="pv-form-ctrl" required>
                    <option value="">-- เลือกเหตุผล --</option>
                    <option value="qr_failed">🔴 QR ใช้งานไม่ได้</option>
                    <option value="app_issue">⚠️ ลูกค้าแอพมีปัญหา</option>
                    <option value="scan_failed">📱 สแกนไม่ผ่าน</option>
                    <option value="system_down">💥 ระบบล่ม</option>
                    <option value="branch_redeem">🏪 Redeem หน้าสาขา</option>
                    <option value="manual_compensation">💰 Manual compensation</option>
                    <option value="other">❓ อื่นๆ</option>
                </select>
            </div>
            <div class="pv-form-group" id="pv-manual-other-wrap" style="display:none;">
                <label class="pv-form-label">ระบุเหตุผลเพิ่มเติม</label>
                <input type="text" class="pv-form-ctrl" id="pv-manual-other" placeholder="กรอกเหตุผล...">
            </div>
            <div class="pv-form-group">
                <label class="pv-form-label">หมายเหตุเพิ่มเติม</label>
                <textarea id="pv-manual-note" class="pv-form-ctrl" placeholder="ระบุรายละเอียดเพิ่มเติม..." rows="3"></textarea>
            </div>
            <div class="pv-checkbox-wrap">
                <input type="checkbox" id="pv-manual-confirm">
                <label for="pv-manual-confirm">ฉันยืนยันว่าตรวจสอบข้อมูลแล้ว และยืนยันการดำเนินการนี้</label>
            </div>
        </div>
        <div class="pv-modal-footer">
            <button class="pv-btn pv-btn-ghost" onclick="pvCloseManualModal()">ยกเลิก</button>
            <button class="pv-btn pv-btn-orange" id="pv-manual-submit-btn" onclick="pvConfirmManualRedeem(${codeId})">
                <i class="fas fa-bolt"></i> ยืนยันการใช้งานแทน
            </button>
        </div>
    `;
    overlay.appendChild(modal);

    // Show/hide other reason
    document.getElementById('pv-manual-reason').addEventListener('change', (e) => {
        document.getElementById('pv-manual-other-wrap').style.display = e.target.value === 'other' ? 'block' : 'none';
    });

    // Load code data
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/promo-codes/${codeId}/detail`, {
            headers: pvAuthHeaders()
        });
        if (!res.ok) throw new Error();
        const j = await res.json();
        const c = j.data?.code || {};
        const u = j.data?.assignedUser || null;
        document.getElementById('pv-manual-code-card').innerHTML = `
            <div class="pv-cc-item"><label>รหัสโค้ด</label><span style="font-family:monospace;letter-spacing:0.04em;">${c.code || '-'}</span></div>
            <div class="pv-cc-item"><label>สถานะปัจจุบัน</label><span>${pvStatusBadge(c.status || c.current_status)}</span></div>
            <div class="pv-cc-item"><label>รางวัล</label><span>${c.reward_name || '-'}</span></div>
            <div class="pv-cc-item"><label>แต้ม</label><span>${c.reward_points || 0} แต้ม</span></div>
            ${u ? `<div class="pv-cc-item"><label>ผู้ใช้</label><span>${u.full_name || u.phone_number || '-'}</span></div>` : ''}
            ${c.used_at ? `<div class="pv-cc-item"><label>วันที่แลก</label><span>${pvFmt(c.used_at)}</span></div>` : ''}
        `;
    } catch {
        document.getElementById('pv-manual-code-card').innerHTML = `<div class="pv-cc-item full"><label>โค้ด #${codeId}</label><span>โหลดข้อมูลไม่ได้</span></div>`;
    }
}

function pvCloseManualModal() {
    document.getElementById('pv-manual-overlay')?.remove();
}

async function pvConfirmManualRedeem(codeId) {
    const reason    = document.getElementById('pv-manual-reason')?.value;
    const otherText = document.getElementById('pv-manual-other')?.value;
    const note      = document.getElementById('pv-manual-note')?.value;
    const confirmed = document.getElementById('pv-manual-confirm')?.checked;
    const btn       = document.getElementById('pv-manual-submit-btn');

    if (!reason)    { pvToast('กรุณาเลือกเหตุผล', 'warning'); return; }
    if (!confirmed) { pvToast('กรุณายืนยันว่าตรวจสอบแล้ว', 'warning'); return; }

    pvSetBtnLoading(btn, true);

    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/override/force-redeem`, {
            method: 'POST',
            headers: pvAuthHeaders(),
            body: JSON.stringify({
                promo_code_id: codeId,
                override_reason: reason,
                override_reason_custom: reason === 'other' ? otherText : undefined,
                admin_notes: note,
                admin_id: pvAdminId(),
                device_ip: await pvGetClientIP(),
                user_agent: navigator.userAgent
            })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || err.message || `HTTP ${res.status}`);
        }
        pvToast('✅ ยืนยันการใช้งานแทนสำเร็จ', 'success');
        pvToast('ℹ️ บันทึกลง Audit Log แล้ว', 'info');
        pvCloseManualModal();
        pvRefreshTable();
    } catch (err) {
        pvToast(`⚠️ ${err.message || 'เกิดข้อผิดพลาด'}`, 'error');
        pvSetBtnLoading(btn, false);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL 3 — CHANGE STATUS (Visual Status Cards)
// ═══════════════════════════════════════════════════════════════════════════

async function pvShowChangeStatusModal(codeId) {
    document.getElementById('pv-status-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'pv-status-overlay';
    overlay.className = 'pv-modal-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) pvCloseStatusModal(); };
    document.body.appendChild(overlay);

    const STATUS_CARDS = [
        { v: 'ready',           label: 'พร้อมใช้งาน',     desc: 'รีเซ็ตให้กลับมาใช้ได้ใหม่' },
        { v: 'redeemed',        label: 'ใช้งานแล้ว',       desc: 'ทำเครื่องหมายว่าถูกใช้งาน' },
        { v: 'manual_redeemed', label: 'ใช้งานโดยแอดมิน', desc: 'บันทึกการแทนลูกค้า' },
        { v: 'expired',         label: 'หมดอายุ',          desc: 'โค้ดหมดอายุใช้ไม่ได้' },
        { v: 'cancelled',       label: 'ยกเลิกแล้ว',      desc: 'ยกเลิกการใช้งาน' },
    ];

    const modal = document.createElement('div');
    modal.className = 'pv-modal wide';
    modal.innerHTML = `
        <div class="pv-modal-header">
            <h2><i class="fas fa-sliders" style="color:#3b82f6;"></i> เปลี่ยนสถานะโค้ด</h2>
            <button class="pv-modal-close" onclick="pvCloseStatusModal()"><i class="fas fa-times"></i></button>
        </div>
        <div class="pv-modal-body">
            <div id="pv-status-code-card" class="pv-code-card">
                ${pvSkeletonInfoGroup(2)}
            </div>
            <div class="pv-form-group">
                <label class="pv-form-label">เลือกสถานะใหม่ <span class="req">*</span></label>
                <div class="pv-status-cards" id="pv-status-cards">
                    ${STATUS_CARDS.map(s => `
                        <div class="pv-status-card" data-status="${s.v}" onclick="pvSelectStatusCard(this,'${s.v}')">
                            <div class="pv-sc-dot"></div>
                            <div class="pv-sc-text">
                                <span class="pv-sc-label">${s.label}</span>
                                <span class="pv-sc-desc">${s.desc}</span>
                            </div>
                            <i class="fas fa-check-circle pv-sc-check"></i>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="pv-form-group">
                <label class="pv-form-label">เหตุผล <span class="req">*</span></label>
                <select id="pv-status-reason" class="pv-form-ctrl" required>
                    <option value="">-- เลือกเหตุผล --</option>
                    <option value="qr_failed">🔴 QR ใช้งานไม่ได้</option>
                    <option value="app_issue">⚠️ แอพมีปัญหา</option>
                    <option value="system_down">💥 ระบบล่ม</option>
                    <option value="manual_compensation">💰 Manual compensation</option>
                    <option value="customer_request">👤 ลูกค้าร้องขอ</option>
                    <option value="admin_correction">🛠 แก้ไขโดยแอดมิน</option>
                    <option value="other">❓ อื่นๆ</option>
                </select>
            </div>
            <div class="pv-form-group">
                <label class="pv-form-label">หมายเหตุ</label>
                <textarea id="pv-status-note" class="pv-form-ctrl" placeholder="ระบุรายละเอียดเพิ่มเติม..." rows="3"></textarea>
            </div>
            <div class="pv-toggle-row">
                <div>
                    <div class="pv-toggle-label">คืนแต้มอัตโนมัติ</div>
                    <div class="pv-toggle-sub">คืนแต้มให้ผู้ใช้เมื่อเปลี่ยนสถานะ</div>
                </div>
                <label class="pv-switch">
                    <input type="checkbox" id="pv-status-refund-toggle">
                    <span class="pv-switch-track"></span>
                </label>
            </div>
        </div>
        <div class="pv-modal-footer">
            <button class="pv-btn pv-btn-ghost" onclick="pvCloseStatusModal()">ยกเลิก</button>
            <button class="pv-btn pv-btn-primary" id="pv-status-submit-btn" onclick="pvConfirmChangeStatus(${codeId})">
                <i class="fas fa-check"></i> ยืนยันการเปลี่ยนสถานะ
            </button>
        </div>
    `;
    overlay.appendChild(modal);

    // Load current status
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/promo-codes/${codeId}/detail`, {
            headers: pvAuthHeaders()
        });
        if (!res.ok) throw new Error();
        const j = await res.json();
        const c = j.data?.code || {};
        document.getElementById('pv-status-code-card').innerHTML = `
            <div class="pv-cc-item"><label>รหัสโค้ด</label><span style="font-family:monospace;">${c.code || '-'}</span></div>
            <div class="pv-cc-item"><label>สถานะปัจจุบัน</label><span>${pvStatusBadge(c.status || c.current_status)}</span></div>
            <div class="pv-cc-item"><label>รางวัล</label><span>${c.reward_name || '-'}</span></div>
            <div class="pv-cc-item"><label>แต้ม</label><span>${c.reward_points || 0} แต้ม</span></div>
        `;
    } catch {
        document.getElementById('pv-status-code-card').innerHTML = `<div class="pv-cc-item full"><label>โค้ด #${codeId}</label><span>โหลดข้อมูลไม่ได้</span></div>`;
    }
}

function pvSelectStatusCard(card, value) {
    document.querySelectorAll('#pv-status-cards .pv-status-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
}

function pvCloseStatusModal() {
    document.getElementById('pv-status-overlay')?.remove();
}

async function pvConfirmChangeStatus(codeId) {
    const newStatus = document.querySelector('#pv-status-cards .pv-status-card.selected')?.dataset.status;
    const reason    = document.getElementById('pv-status-reason')?.value;
    const note      = document.getElementById('pv-status-note')?.value;
    const refund    = document.getElementById('pv-status-refund-toggle')?.checked;
    const btn       = document.getElementById('pv-status-submit-btn');

    if (!newStatus) { pvToast('กรุณาเลือกสถานะใหม่', 'warning'); return; }
    if (!reason)    { pvToast('กรุณาเลือกเหตุผล', 'warning'); return; }

    pvSetBtnLoading(btn, true);

    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/override/reset-status`, {
            method: 'POST',
            headers: pvAuthHeaders(),
            body: JSON.stringify({
                promo_code_id: codeId,
                new_status: newStatus,
                override_reason: reason,
                admin_notes: note,
                auto_refund: refund,
                admin_id: pvAdminId(),
                device_ip: await pvGetClientIP(),
                user_agent: navigator.userAgent
            })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || err.message || `HTTP ${res.status}`);
        }
        pvToast('✅ เปลี่ยนสถานะสำเร็จ', 'success');
        pvToast('ℹ️ บันทึกลง Audit Log แล้ว', 'info');
        pvCloseStatusModal();
        pvRefreshTable();
    } catch (err) {
        pvToast(`⚠️ ${err.message || 'เกิดข้อผิดพลาด'}`, 'error');
        pvSetBtnLoading(btn, false);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL 4 — REFUND POINTS
// ═══════════════════════════════════════════════════════════════════════════

async function pvShowRefundModal(codeId) {
    document.getElementById('pv-refund-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'pv-refund-overlay';
    overlay.className = 'pv-modal-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) pvCloseRefundModal(); };
    document.body.appendChild(overlay);

    const modal = document.createElement('div');
    modal.className = 'pv-modal';
    modal.innerHTML = `
        <div class="pv-modal-header">
            <h2><i class="fas fa-rotate-left" style="color:#16a34a;"></i> คืนแต้ม</h2>
            <button class="pv-modal-close" onclick="pvCloseRefundModal()"><i class="fas fa-times"></i></button>
        </div>
        <div class="pv-modal-body">
            <div id="pv-refund-code-card" class="pv-code-card">
                ${pvSkeletonInfoGroup(3)}
            </div>
            <div class="pv-danger-card-msg">
                <i class="fas fa-triangle-exclamation"></i>
                <div><strong>คำเตือน:</strong> การคืนแต้มไม่สามารถย้อนกลับได้ กรุณาตรวจสอบข้อมูลให้ถูกต้องก่อนดำเนินการ</div>
            </div>
            <div class="pv-form-group">
                <label class="pv-form-label">จำนวนแต้มที่คืน <span class="req">*</span></label>
                <input type="number" id="pv-refund-points" class="pv-form-ctrl" placeholder="0" min="1">
            </div>
            <div class="pv-form-group">
                <label class="pv-form-label">เหตุผล <span class="req">*</span></label>
                <select id="pv-refund-reason" class="pv-form-ctrl" required>
                    <option value="">-- เลือกเหตุผล --</option>
                    <option value="system_error">ระบบมีปัญหา</option>
                    <option value="wrong_redemption">แลกรางวัลผิดพลาด</option>
                    <option value="product_unavailable">สินค้าไม่พร้อม</option>
                    <option value="customer_complaint">ลูกค้าร้องเรียน</option>
                    <option value="admin_correction">แอดมินแก้ไข</option>
                    <option value="other">อื่นๆ</option>
                </select>
            </div>
            <div class="pv-form-group">
                <label class="pv-form-label">หมายเหตุ</label>
                <textarea id="pv-refund-note" class="pv-form-ctrl" placeholder="ระบุรายละเอียดเพิ่มเติม..." rows="3"></textarea>
            </div>
        </div>
        <div class="pv-modal-footer">
            <button class="pv-btn pv-btn-ghost" onclick="pvCloseRefundModal()">ยกเลิก</button>
            <button class="pv-btn pv-btn-danger" id="pv-refund-submit-btn" onclick="pvConfirmRefund(${codeId})">
                <i class="fas fa-rotate-left"></i> ยืนยันการคืนแต้ม
            </button>
        </div>
    `;
    overlay.appendChild(modal);

    // Load code data
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/promo-codes/${codeId}/detail`, {
            headers: pvAuthHeaders()
        });
        if (!res.ok) throw new Error();
        const j = await res.json();
        const c = j.data?.code || {};
        const u = j.data?.assignedUser || null;
        document.getElementById('pv-refund-code-card').innerHTML = `
            <div class="pv-cc-item"><label>ผู้ใช้</label><span>${u?.full_name || u?.phone_number || '-'}</span></div>
            <div class="pv-cc-item"><label>แต้มที่ใช้</label><span>${c.reward_points || 0} แต้ม</span></div>
            <div class="pv-cc-item"><label>รางวัล</label><span>${c.reward_name || '-'}</span></div>
            <div class="pv-cc-item"><label>วันที่แลก</label><span>${pvFmt(c.used_at)}</span></div>
        `;
        // Auto-fill points
        const pointsInput = document.getElementById('pv-refund-points');
        if (pointsInput && c.reward_points) pointsInput.value = c.reward_points;
    } catch {
        document.getElementById('pv-refund-code-card').innerHTML = `<div class="pv-cc-item full"><label>โค้ด #${codeId}</label><span>โหลดข้อมูลไม่ได้</span></div>`;
    }
}

function pvCloseRefundModal() {
    document.getElementById('pv-refund-overlay')?.remove();
}

async function pvConfirmRefund(codeId) {
    const points = parseInt(document.getElementById('pv-refund-points')?.value, 10);
    const reason = document.getElementById('pv-refund-reason')?.value;
    const note   = document.getElementById('pv-refund-note')?.value;
    const btn    = document.getElementById('pv-refund-submit-btn');

    if (!points || points < 1) { pvToast('กรุณาระบุจำนวนแต้ม', 'warning'); return; }
    if (!reason)                { pvToast('กรุณาเลือกเหตุผล', 'warning'); return; }

    pvSetBtnLoading(btn, true);

    try {
        const res = await fetch(`${API_BASE_URL}/api/points/refund`, {
            method: 'POST',
            headers: pvAuthHeaders(),
            body: JSON.stringify({
                promo_code_id: codeId,
                points: points,
                reason: reason,
                note: note,
                admin_id: pvAdminId()
            })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || err.message || `HTTP ${res.status}`);
        }
        pvToast('✅ คืนแต้มสำเร็จ', 'success');
        pvToast('ℹ️ บันทึกลง Audit Log แล้ว', 'info');
        pvCloseRefundModal();
        pvRefreshTable();
    } catch (err) {
        pvToast(`⚠️ ${err.message || 'ไม่สามารถคืนแต้มได้'}`, 'error');
        pvSetBtnLoading(btn, false);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL 5 — AUDIT LOG DRAWER (Full Height)
// ═══════════════════════════════════════════════════════════════════════════

async function pvShowAuditDrawer(codeId) {
    document.getElementById('pv-audit-overlay')?.remove();
    document.getElementById('pv-audit-drawer-el')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'pv-audit-overlay';
    overlay.className = 'pv-audit-overlay';
    overlay.onclick = pvCloseAuditDrawer;
    document.body.appendChild(overlay);

    const drawer = document.createElement('div');
    drawer.id = 'pv-audit-drawer-el';
    drawer.className = 'pv-audit-drawer';
    drawer.innerHTML = `
        <div class="pv-audit-hdr">
            <h2><i class="fas fa-list-check"></i> Audit Log — <span id="pv-audit-code-label">#${codeId}</span></h2>
            <div class="pv-audit-hdr-actions">
                <button class="pv-export-btn" onclick="pvExportAuditCSV(${codeId})">
                    <i class="fas fa-download"></i> Export CSV
                </button>
                <button class="pv-audit-hdr-close" onclick="pvCloseAuditDrawer()"><i class="fas fa-times"></i></button>
            </div>
        </div>
        <div class="pv-audit-toolbar">
            <input class="pv-audit-search" id="pv-audit-search" type="text" placeholder="ค้นหา action, admin...">
            <select class="pv-audit-filter-sel" id="pv-audit-action-filter" onchange="pvFilterAuditTable()">
                <option value="">ทุก Action</option>
                <option value="force_redeem">ใช้งานแทน</option>
                <option value="reset_status">เปลี่ยนสถานะ</option>
                <option value="cancel_code">ยกเลิก</option>
                <option value="refund">คืนแต้ม</option>
                <option value="delete_code">ลบโค้ด</option>
            </select>
        </div>
        <div class="pv-audit-body" id="pv-audit-body">
            <div style="padding:40px; text-align:center; color:#9ca3af;">
                <i class="fas fa-spinner fa-spin" style="font-size:24px; display:block; margin-bottom:10px;"></i>
                กำลังโหลด Audit Log...
            </div>
        </div>
    `;
    document.body.appendChild(drawer);

    // Search handler
    document.getElementById('pv-audit-search').addEventListener('input', pvFilterAuditTable);

    // Load data
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/promo-codes/${codeId}/audit`, {
            headers: pvAuthHeaders()
        });
        if (!res.ok) {
            // Try alternate endpoint
            const res2 = await fetch(`${API_BASE_URL}/api/admin/promo-codes/${codeId}/detail`, {
                headers: pvAuthHeaders()
            });
            if (!res2.ok) throw new Error();
            const j2 = await res2.json();
            window._pvAuditAll = j2.data?.auditLog || [];
        } else {
            const j = await res.json();
            window._pvAuditAll = j.data || j.logs || j || [];
        }
        pvRenderAuditTable(window._pvAuditAll);

        // Update code label
        const codeLabel = document.getElementById('pv-audit-code-label');
        if (codeLabel && window._pvAuditAll?.[0]?.code) {
            codeLabel.textContent = window._pvAuditAll[0].code;
        }
    } catch {
        document.getElementById('pv-audit-body').innerHTML = `
            <div class="pv-audit-empty">
                <i class="fas fa-inbox" style="font-size:28px; opacity:0.4; display:block; margin-bottom:10px;"></i>
                <p style="font-size:13px; color:#64748b;">ไม่มีข้อมูล Audit Log สำหรับโค้ดนี้</p>
            </div>
        `;
    }
}

function pvCloseAuditDrawer() {
    document.getElementById('pv-audit-overlay')?.remove();
    document.getElementById('pv-audit-drawer-el')?.remove();
    window._pvAuditAll = null;
}

function pvRenderAuditTable(logs) {
    const body = document.getElementById('pv-audit-body');
    if (!body) return;
    if (!logs?.length) {
        body.innerHTML = `<div class="pv-audit-empty"><i class="fas fa-inbox" style="font-size:28px; opacity:0.4; display:block; margin-bottom:10px;"></i><p style="font-size:13px; color:#64748b;">ยังไม่มีรายการ Audit Log</p></div>`;
        return;
    }
    const ACTION_LABELS = {
        force_redeem: 'ใช้งานแทนลูกค้า', reset_status: 'เปลี่ยนสถานะ',
        cancel_code: 'ยกเลิกโค้ด', refund: 'คืนแต้ม', delete_code: 'ลบโค้ด',
        reassign: 'โอนสิทธิ์', extend_expiry: 'ต่ออายุ'
    };
    body.innerHTML = `
        <table class="pv-audit-tbl">
            <thead>
                <tr>
                    <th></th>
                    <th>เวลา</th>
                    <th>Action</th>
                    <th>Admin</th>
                    <th>Before</th>
                    <th>After</th>
                    <th>เหตุผล</th>
                    <th>IP</th>
                </tr>
            </thead>
            <tbody id="pv-audit-tbody">
                ${logs.map((log, i) => {
                    const actionKey = String(log.action || '').toLowerCase();
                    const label = ACTION_LABELS[actionKey] || log.action || '-';
                    const reason = [log.override_reason, log.override_reason_custom].filter(Boolean).join(' · ') || '-';
                    return `
                        <tr class="pv-audit-data-row" data-action="${actionKey}" data-admin="${(log.admin_name||'').toLowerCase()}" data-reason="${reason.toLowerCase()}">
                            <td>
                                <button class="pv-audit-expand-btn" onclick="pvToggleAuditExpand(${i})">
                                    <i class="fas fa-chevron-right" id="pv-audit-icon-${i}"></i>
                                </button>
                            </td>
                            <td style="white-space:nowrap; font-size:12px;">${pvFmt(log.action_timestamp)}</td>
                            <td><span class="pv-audit-action-pill ${actionKey}">${label}</span></td>
                            <td style="font-size:12px;">${log.admin_name || '-'}<br><span style="color:#9ca3af;font-size:11px;">${log.admin_phone || ''}</span></td>
                            <td><small style="color:#6b7280;">${log.old_status || '-'}</small></td>
                            <td><small style="font-weight:600;">${log.new_status || '-'}</small></td>
                            <td style="max-width:140px; font-size:12px; color:#6b7280;">${reason}</td>
                            <td style="font-size:11px; color:#9ca3af; white-space:nowrap;">${log.device_ip || '-'}</td>
                        </tr>
                        <tr class="pv-audit-expand-row" id="pv-audit-expand-${i}">
                            <td colspan="8">
                                <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px,1fr)); gap:8px; font-size:12px;">
                                    ${log.branch_name ? `<div><strong>สาขา:</strong> ${log.branch_name}</div>` : ''}
                                    ${log.admin_notes ? `<div><strong>หมายเหตุ:</strong> ${log.admin_notes}</div>` : ''}
                                    ${log.user_agent  ? `<div style="grid-column:1/-1;"><strong>User Agent:</strong> <span style="color:#9ca3af;font-size:11px;">${log.user_agent}</span></div>` : ''}
                                </div>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

function pvToggleAuditExpand(idx) {
    const row  = document.getElementById(`pv-audit-expand-${idx}`);
    const icon = document.getElementById(`pv-audit-icon-${idx}`);
    if (!row) return;
    const open = row.classList.toggle('open');
    if (icon) icon.className = open ? 'fas fa-chevron-down' : 'fas fa-chevron-right';
}

function pvFilterAuditTable() {
    const search = (document.getElementById('pv-audit-search')?.value || '').toLowerCase();
    const action = document.getElementById('pv-audit-action-filter')?.value || '';
    document.querySelectorAll('.pv-audit-data-row').forEach(row => {
        const matchAction = !action || row.dataset.action === action;
        const matchSearch = !search ||
            (row.dataset.admin || '').includes(search) ||
            (row.dataset.action || '').includes(search) ||
            (row.dataset.reason || '').includes(search);
        row.style.display = (matchAction && matchSearch) ? '' : 'none';
    });
}

async function pvExportAuditCSV(codeId) {
    const logs = window._pvAuditAll;
    if (!logs?.length) { pvToast('ไม่มีข้อมูลที่จะ Export', 'warning'); return; }

    const headers = ['เวลา','Action','Admin','Admin Phone','Before','After','เหตุผล','IP','หมายเหตุ'];
    const rows = logs.map(l => [
        pvFmt(l.action_timestamp), l.action || '', l.admin_name || '', l.admin_phone || '',
        l.old_status || '', l.new_status || '',
        [l.override_reason, l.override_reason_custom].filter(Boolean).join(' · '),
        l.device_ip || '', l.admin_notes || ''
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

    const csv = '﻿' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `audit-log-${codeId}-${Date.now()}.csv`;
    a.click(); URL.revokeObjectURL(url);
    pvToast('✅ Export CSV สำเร็จ', 'success');
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL 6 — USAGE HISTORY (Activity Feed)
// ═══════════════════════════════════════════════════════════════════════════

async function pvShowHistoryModal(codeId) {
    document.getElementById('pv-hist-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'pv-hist-overlay';
    overlay.className = 'pv-modal-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) pvCloseHistoryModal(); };
    document.body.appendChild(overlay);

    const modal = document.createElement('div');
    modal.className = 'pv-modal wide tall';
    modal.innerHTML = `
        <div class="pv-modal-header">
            <h2><i class="fas fa-clock-rotate-left" style="color:#6d28d9;"></i> ประวัติการใช้งาน</h2>
            <button class="pv-modal-close" onclick="pvCloseHistoryModal()"><i class="fas fa-times"></i></button>
        </div>
        <div class="pv-modal-body">
            <div id="pv-hist-feed" class="pv-hist-feed">
                <div style="padding:30px; text-align:center; color:#9ca3af;">
                    <i class="fas fa-spinner fa-spin" style="font-size:22px; display:block; margin-bottom:8px;"></i>
                    กำลังโหลดประวัติ...
                </div>
            </div>
        </div>
        <div class="pv-modal-footer">
            <button class="pv-btn pv-btn-ghost" onclick="pvCloseHistoryModal()">ปิด</button>
        </div>
    `;
    overlay.appendChild(modal);

    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/promo-codes/${codeId}/history`, {
            headers: pvAuthHeaders()
        });
        let historyItems = [];
        if (res.ok) {
            const j = await res.json();
            historyItems = j.data || j.history || j || [];
        }

        const feed = document.getElementById('pv-hist-feed');
        if (!feed) return;

        if (!historyItems.length) {
            feed.innerHTML = `<div class="pv-empty-state"><i class="fas fa-inbox"></i><p>ยังไม่มีประวัติการใช้งาน</p></div>`;
            return;
        }

        const SCAN_ICONS = {
            qr_scan:      { icon: 'fa-qrcode',       cls: 'blue'   },
            manual:       { icon: 'fa-hand',          cls: 'orange' },
            auto_verify:  { icon: 'fa-circle-check',  cls: 'green'  },
            failed:       { icon: 'fa-circle-xmark',  cls: 'red'    },
            expired:      { icon: 'fa-clock',         cls: 'gray'   },
        };

        feed.innerHTML = historyItems.map(item => {
            const scanType = String(item.scan_type || 'qr_scan').toLowerCase();
            const meta = SCAN_ICONS[scanType] || SCAN_ICONS.qr_scan;
            const resultCls = item.scan_result === 'success' ? 'success' : item.scan_result === 'failed' ? 'fail' : 'pending';
            return `
                <div class="pv-hist-item">
                    <div class="pv-hist-icon ${meta.cls}"><i class="fas ${meta.icon}"></i></div>
                    <div class="pv-hist-body">
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px; flex-wrap:wrap;">
                            <span class="pv-hist-result ${resultCls}">
                                <i class="fas ${resultCls === 'success' ? 'fa-check' : resultCls === 'fail' ? 'fa-times' : 'fa-clock'}"></i>
                                ${item.scan_result || '-'}
                            </span>
                            <span class="pv-hist-title" style="margin-bottom:0;">${item.scan_type ? item.scan_type.replace(/_/g,' ').toUpperCase() : 'QR SCAN'}</span>
                        </div>
                        <div class="pv-hist-meta">
                            ${item.location ? `<span class="pv-hist-meta-item"><i class="fas fa-location-dot"></i>${item.location}</span>` : ''}
                            ${item.device   ? `<span class="pv-hist-meta-item"><i class="fas fa-mobile-screen"></i>${item.device}</span>` : ''}
                            ${item.app_version ? `<span class="pv-hist-meta-item"><i class="fas fa-code-branch"></i>v${item.app_version}</span>` : ''}
                        </div>
                    </div>
                    <div class="pv-hist-time">${pvFmt(item.scan_time || item.used_at || item.created_at)}</div>
                </div>
            `;
        }).join('');
    } catch (err) {
        const feed = document.getElementById('pv-hist-feed');
        if (feed) feed.innerHTML = `<div class="pv-empty-state"><i class="fas fa-exclamation-circle" style="color:#ef4444;"></i><p>ไม่สามารถโหลดประวัติได้</p></div>`;
    }
}

function pvCloseHistoryModal() {
    document.getElementById('pv-hist-overlay')?.remove();
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL 7 — CANCEL CODE
// ═══════════════════════════════════════════════════════════════════════════

async function pvShowCancelCodeModal(codeId) {
    document.getElementById('pv-cancel-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'pv-cancel-overlay';
    overlay.className = 'pv-modal-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) pvCloseCancelModal(); };
    document.body.appendChild(overlay);

    const modal = document.createElement('div');
    modal.className = 'pv-modal narrow';
    modal.innerHTML = `
        <div class="pv-modal-header">
            <h2><i class="fas fa-ban" style="color:#ef4444;"></i> ยกเลิกโค้ด</h2>
            <button class="pv-modal-close" onclick="pvCloseCancelModal()"><i class="fas fa-times"></i></button>
        </div>
        <div class="pv-modal-body">
            <div id="pv-cancel-code-card" class="pv-code-card">${pvSkeletonInfoGroup(2)}</div>
            <div class="pv-danger-card-msg">
                <i class="fas fa-ban"></i>
                <div><strong>การยกเลิกโค้ดเป็นการถาวร</strong> โค้ดนี้จะไม่สามารถใช้งานได้อีก และจะถูกบันทึกลง Audit Log</div>
            </div>
            <div class="pv-form-group">
                <label class="pv-form-label">เหตุผล <span class="req">*</span></label>
                <select id="pv-cancel-reason" class="pv-form-ctrl" required>
                    <option value="">-- เลือกเหตุผล --</option>
                    <option value="fraud">ตรวจพบการทุจริต</option>
                    <option value="duplicate">โค้ดซ้ำ</option>
                    <option value="expired_campaign">Campaign สิ้นสุด</option>
                    <option value="customer_request">ลูกค้าร้องขอ</option>
                    <option value="admin_action">การดำเนินการแอดมิน</option>
                    <option value="other">อื่นๆ</option>
                </select>
            </div>
            <div class="pv-form-group">
                <label class="pv-form-label">หมายเหตุ</label>
                <textarea id="pv-cancel-note" class="pv-form-ctrl" placeholder="ระบุรายละเอียด..." rows="2"></textarea>
            </div>
        </div>
        <div class="pv-modal-footer">
            <button class="pv-btn pv-btn-ghost" onclick="pvCloseCancelModal()">ยกเลิก</button>
            <button class="pv-btn pv-btn-danger" id="pv-cancel-submit-btn" onclick="pvConfirmCancelCode(${codeId})">
                <i class="fas fa-ban"></i> ยืนยันการยกเลิกโค้ด
            </button>
        </div>
    `;
    overlay.appendChild(modal);

    // Load code info
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/promo-codes/${codeId}/detail`, { headers: pvAuthHeaders() });
        if (!res.ok) throw new Error();
        const j = await res.json();
        const c = j.data?.code || {};
        document.getElementById('pv-cancel-code-card').innerHTML = `
            <div class="pv-cc-item"><label>รหัสโค้ด</label><span style="font-family:monospace;">${c.code || '-'}</span></div>
            <div class="pv-cc-item"><label>สถานะ</label><span>${pvStatusBadge(c.status || c.current_status)}</span></div>
        `;
    } catch {
        document.getElementById('pv-cancel-code-card').innerHTML = `<div class="pv-cc-item full"><label>โค้ด #${codeId}</label><span></span></div>`;
    }
}

function pvCloseCancelModal() {
    document.getElementById('pv-cancel-overlay')?.remove();
}

async function pvConfirmCancelCode(codeId) {
    const reason = document.getElementById('pv-cancel-reason')?.value;
    const note   = document.getElementById('pv-cancel-note')?.value;
    const btn    = document.getElementById('pv-cancel-submit-btn');

    if (!reason) { pvToast('กรุณาเลือกเหตุผล', 'warning'); return; }

    pvSetBtnLoading(btn, true);

    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/promo-codes/${codeId}/cancel`, {
            method: 'POST',
            headers: pvAuthHeaders(),
            body: JSON.stringify({
                reason, note, admin_id: pvAdminId(),
                device_ip: await pvGetClientIP(), user_agent: navigator.userAgent
            })
        });
        if (!res.ok) {
            // Fallback: try override/reset-status
            const res2 = await fetch(`${API_BASE_URL}/api/admin/override/reset-status`, {
                method: 'POST',
                headers: pvAuthHeaders(),
                body: JSON.stringify({ promo_code_id: codeId, new_status: 'cancelled', override_reason: reason, admin_notes: note, admin_id: pvAdminId() })
            });
            if (!res2.ok) throw new Error(`HTTP ${res.status}`);
        }
        pvToast('✅ ยกเลิกโค้ดสำเร็จ', 'success');
        pvCloseCancelModal();
        pvRefreshTable();
    } catch (err) {
        pvToast(`⚠️ ${err.message || 'เกิดข้อผิดพลาด'}`, 'error');
        pvSetBtnLoading(btn, false);
    }
}

// ─── DELETE CODE ─────────────────────────────────────────────────────────────

async function pvShowDeleteCodeModal(codeId) {
    document.getElementById('pv-delete-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'pv-delete-overlay';
    overlay.className = 'pv-modal-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) pvCloseDeleteModal(); };
    document.body.appendChild(overlay);

    const modal = document.createElement('div');
    modal.className = 'pv-modal narrow';
    modal.innerHTML = `
        <div class="pv-modal-header">
            <h2><i class="fas fa-trash" style="color:#ef4444;"></i> ลบโค้ด</h2>
            <button class="pv-modal-close" onclick="pvCloseDeleteModal()"><i class="fas fa-times"></i></button>
        </div>
        <div class="pv-modal-body">
            <div class="pv-danger-card-msg">
                <i class="fas fa-triangle-exclamation"></i>
                <div>
                    <strong>การลบโค้ดเป็นการถาวรและไม่สามารถย้อนกลับได้</strong><br>
                    ข้อมูลโค้ดและประวัติทั้งหมดจะถูกลบออกจากระบบ
                </div>
            </div>
            <div class="pv-form-group">
                <label class="pv-form-label">เหตุผลการลบ <span class="req">*</span></label>
                <textarea id="pv-delete-reason" class="pv-form-ctrl" placeholder="ระบุเหตุผล..." rows="2" required></textarea>
            </div>
            <div class="pv-checkbox-wrap">
                <input type="checkbox" id="pv-delete-confirm">
                <label for="pv-delete-confirm">ฉันเข้าใจและยืนยันการลบโค้ดนี้ออกจากระบบถาวร</label>
            </div>
        </div>
        <div class="pv-modal-footer">
            <button class="pv-btn pv-btn-ghost" onclick="pvCloseDeleteModal()">ยกเลิก</button>
            <button class="pv-btn pv-btn-danger" id="pv-delete-submit-btn" onclick="pvConfirmDeleteCode(${codeId})">
                <i class="fas fa-trash"></i> ลบโค้ด
            </button>
        </div>
    `;
    overlay.appendChild(modal);
}

function pvCloseDeleteModal() {
    document.getElementById('pv-delete-overlay')?.remove();
}

async function pvConfirmDeleteCode(codeId) {
    const reason    = document.getElementById('pv-delete-reason')?.value?.trim();
    const confirmed = document.getElementById('pv-delete-confirm')?.checked;
    const btn       = document.getElementById('pv-delete-submit-btn');

    if (!reason)    { pvToast('กรุณาระบุเหตุผล', 'warning'); return; }
    if (!confirmed) { pvToast('กรุณายืนยันการลบ', 'warning'); return; }

    pvSetBtnLoading(btn, true);

    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/promo-codes/${codeId}`, {
            method: 'DELETE',
            headers: pvAuthHeaders(),
            body: JSON.stringify({ reason, admin_id: pvAdminId() })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        pvToast('✅ ลบโค้ดสำเร็จ', 'success');
        pvCloseDeleteModal();
        pvRefreshTable();
    } catch (err) {
        pvToast(`⚠️ ${err.message || 'ไม่สามารถลบโค้ดได้'}`, 'error');
        pvSetBtnLoading(btn, false);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════════════════════════════════

async function pvGetClientIP() {
    try {
        const r = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
        const d = await r.json();
        return d.ip || '';
    } catch { return ''; }
}

function pvRefreshTable() {
    const rewardId = verifierPageState?.rewardId;
    if (rewardId && typeof loadVerifierRewardCodes === 'function') {
        loadVerifierRewardCodes(rewardId, verifierPageState?.page || 1);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL — CONFIRM REDEMPTION (ยืนยันการใช้งาน)
// Simple 3-step: load info → optional note → confirm
// ═══════════════════════════════════════════════════════════════════════════

async function pvShowConfirmModal(codeId) {
    document.getElementById('pv-confirm-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'pv-confirm-overlay';
    overlay.className = 'pv-modal-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    const modal = document.createElement('div');
    modal.className = 'pv-modal';
    modal.innerHTML = `
        <div class="pv-modal-header">
            <h2><i class="fas fa-circle-check" style="color:#22c55e;"></i> ยืนยันการใช้งาน</h2>
            <button class="pv-modal-close" onclick="document.getElementById('pv-confirm-overlay')?.remove()"><i class="fas fa-times"></i></button>
        </div>
        <div class="pv-modal-body">
            <div id="pv-confirm-code-card" class="pv-code-card">${pvSkeletonInfoGroup(2)}</div>
            <div class="pv-form-group">
                <label class="pv-form-label">หมายเหตุ (ไม่บังคับ)</label>
                <textarea id="pv-confirm-note" class="pv-form-ctrl" placeholder="ระบุเหตุผลหรือรายละเอียด..." rows="3"></textarea>
            </div>
        </div>
        <div class="pv-modal-footer">
            <button class="pv-btn pv-btn-ghost" onclick="document.getElementById('pv-confirm-overlay')?.remove()">ยกเลิก</button>
            <button class="pv-btn pv-btn-primary" id="pv-confirm-submit-btn" onclick="pvDoConfirmCode(${codeId})">
                <i class="fas fa-circle-check"></i> ยืนยันการใช้งาน
            </button>
        </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/promo-codes/${codeId}/detail`, { headers: pvAuthHeaders() });
        if (!res.ok) throw new Error();
        const j = await res.json();
        const c = j.data?.code || {};
        document.getElementById('pv-confirm-code-card').innerHTML = `
            <div class="pv-cc-item"><label>รหัสโค้ด</label><span style="font-family:monospace;">${c.code || '-'}</span></div>
            <div class="pv-cc-item"><label>สถานะ</label><span>${pvStatusBadge(c.status || c.current_status)}</span></div>
            <div class="pv-cc-item"><label>รางวัล</label><span>${c.reward_name || '-'}</span></div>
            <div class="pv-cc-item"><label>แต้ม</label><span>${c.reward_points || 0} แต้ม</span></div>
        `;
    } catch {
        document.getElementById('pv-confirm-code-card').innerHTML = `<div class="pv-cc-item full"><label>โค้ด #${codeId}</label></div>`;
    }
}

async function pvDoConfirmCode(codeId) {
    const note = document.getElementById('pv-confirm-note')?.value;
    const btn  = document.getElementById('pv-confirm-submit-btn');
    pvSetBtnLoading(btn, true);
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/override/confirm`, {
            method: 'POST',
            headers: pvAuthHeaders(),
            body: JSON.stringify({ promo_code_id: codeId, note, device_ip: await pvGetClientIP() })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        pvToast('✅ ยืนยันการใช้งานสำเร็จ', 'success');
        document.getElementById('pv-confirm-overlay')?.remove();
        pvCloseDetailDrawer();
        pvRefreshTable();
    } catch (err) {
        pvToast(`⚠️ ${err.message || 'เกิดข้อผิดพลาด'}`, 'error');
        pvSetBtnLoading(btn, false);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL — REPLACE CODE (ออกโค้ดใหม่แทน)
// ═══════════════════════════════════════════════════════════════════════════

async function pvShowReplaceModal(codeId) {
    document.getElementById('pv-replace-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'pv-replace-overlay';
    overlay.className = 'pv-modal-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    const modal = document.createElement('div');
    modal.className = 'pv-modal';
    modal.innerHTML = `
        <div class="pv-modal-header">
            <h2><i class="fas fa-arrow-right-arrow-left" style="color:#3b82f6;"></i> ออกโค้ดใหม่แทน</h2>
            <button class="pv-modal-close" onclick="document.getElementById('pv-replace-overlay')?.remove()"><i class="fas fa-times"></i></button>
        </div>
        <div class="pv-modal-body">
            <div id="pv-replace-code-card" class="pv-code-card">${pvSkeletonInfoGroup(2)}</div>
            <div class="pv-warn-card">
                <i class="fas fa-triangle-exclamation"></i>
                <div>โค้ดเดิมจะถูกทำเครื่องหมาย <strong>ถูกแทนที่</strong> และระบบจะออกโค้ดใหม่พร้อมรางวัลเดิม</div>
            </div>
            <div class="pv-form-group">
                <label class="pv-form-label">เหตุผล <span class="req">*</span></label>
                <select id="pv-replace-reason" class="pv-form-ctrl" required>
                    <option value="">-- เลือกเหตุผล --</option>
                    <option value="qr_failed">QR ใช้งานไม่ได้</option>
                    <option value="scan_failed">สแกนไม่ผ่าน</option>
                    <option value="app_issue">แอพมีปัญหา</option>
                    <option value="damaged">โค้ดเสียหาย</option>
                    <option value="other">อื่นๆ</option>
                </select>
            </div>
            <div class="pv-form-group">
                <label class="pv-form-label">หมายเหตุ</label>
                <textarea id="pv-replace-note" class="pv-form-ctrl" placeholder="ระบุรายละเอียดเพิ่มเติม..." rows="2"></textarea>
            </div>
        </div>
        <div class="pv-modal-footer">
            <button class="pv-btn pv-btn-ghost" onclick="document.getElementById('pv-replace-overlay')?.remove()">ยกเลิก</button>
            <button class="pv-btn pv-btn-primary" id="pv-replace-submit-btn" onclick="pvDoReplaceCode(${codeId})">
                <i class="fas fa-arrow-right-arrow-left"></i> ออกโค้ดใหม่
            </button>
        </div>
    `;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/promo-codes/${codeId}/detail`, { headers: pvAuthHeaders() });
        if (!res.ok) throw new Error();
        const j = await res.json();
        const c = j.data?.code || {};
        document.getElementById('pv-replace-code-card').innerHTML = `
            <div class="pv-cc-item"><label>รหัสโค้ด</label><span style="font-family:monospace;">${c.code || '-'}</span></div>
            <div class="pv-cc-item"><label>รางวัล</label><span>${c.reward_name || '-'}</span></div>
        `;
    } catch {
        document.getElementById('pv-replace-code-card').innerHTML = `<div class="pv-cc-item full"><label>โค้ด #${codeId}</label></div>`;
    }
}

async function pvDoReplaceCode(codeId) {
    const reason = document.getElementById('pv-replace-reason')?.value;
    const note   = document.getElementById('pv-replace-note')?.value;
    const btn    = document.getElementById('pv-replace-submit-btn');

    if (!reason) { pvToast('กรุณาเลือกเหตุผล', 'warning'); return; }

    pvSetBtnLoading(btn, true);
    try {
        const res = await fetch(`${API_BASE_URL}/api/admin/override/replace`, {
            method: 'POST',
            headers: pvAuthHeaders(),
            body: JSON.stringify({ promo_code_id: codeId, issue_reason: reason, note, device_ip: await pvGetClientIP() })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `HTTP ${res.status}`);
        }
        const j = await res.json();
        pvToast(`✅ ออกโค้ดใหม่แล้ว: ${j.data?.new_code || ''}`, 'success');
        document.getElementById('pv-replace-overlay')?.remove();
        pvCloseDetailDrawer();
        pvRefreshTable();
    } catch (err) {
        pvToast(`⚠️ ${err.message || 'เกิดข้อผิดพลาด'}`, 'error');
        pvSetBtnLoading(btn, false);
    }
}

// ─── Backward compat aliases (keep existing calls working) ──────────────────
function showManualUseModal(codeId)      { pvShowConfirmModal(codeId); }
function showOverrideStatusModal(codeId) { pvShowChangeStatusModal(codeId); }
function closeManualUseModal()           { pvCloseManualModal(); }
function closeOverrideStatusModal()      { pvCloseStatusModal(); }
function showCodeDetailDrawer(codeId)    { pvShowDetailDrawer(codeId); }
function closeCodeDetailDrawer()         { pvCloseDetailDrawer(); }
function confirmCancelCode(codeId)       { pvShowCancelCodeModal(codeId); }
function toggleVerifierDropdown(e, id)   { pvToggleDropdown(e, id); }
function closeAllVerifierDropdowns()     { pvCloseDropdowns(); }
