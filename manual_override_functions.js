/**
 * Manual Override Functions for Promo Code Verifier
 * Handles UI and operations for manual code override/force redeem
 * Created: May 13, 2026
 */

// ═════════════════════════════════════════════════════════════════════════════════
// GLOBAL STATE & CONFIGURATION
// ═════════════════════════════════════════════════════════════════════════════════

const MANUAL_OVERRIDE_CONFIG = {
    reasons: [
        { code: 'qr_failed', label: '🔴 QR ใช้งานไม่ได้', severity: 'medium' },
        { code: 'app_issue', label: '⚠️ ลูกค้าแอพมีปัญหา', severity: 'medium' },
        { code: 'scan_failed', label: '📱 สแกนไม่ผ่าน', severity: 'low' },
        { code: 'system_down', label: '💥 ระบบล่ม', severity: 'high' },
        { code: 'branch_redeem', label: '🏪 Redeem หน้าสาขา', severity: 'low' },
        { code: 'manual_compensation', label: '💰 Manual compensation', severity: 'medium' },
        { code: 'other', label: '❓ อื่น ๆ', severity: 'low' }
    ],
    statusColors: {
        'ready': { bg: '#10b981', text: 'สีเขียว - พร้อมใช้', badge: '✓ Ready' },
        'reserved': { bg: '#3b82f6', text: 'สีฟ้า - จองแล้ว', badge: '⏳ Reserved' },
        'redeemed': { bg: '#06b6d4', text: 'สีน้ำเงิน - แลกแล้ว', badge: '✓ Redeemed' },
        'manual_redeemed': { bg: '#a855f7', text: 'สีม่วง - Manual แลก', badge: '⚙️ MANUAL' },
        'expired': { bg: '#ef4444', text: 'สีแดง - หมดอายุ', badge: '⏰ Expired' },
        'cancelled': { bg: '#6b7280', text: 'สีเทา - ยกเลิก', badge: '✕ Cancelled' },
        'refunded': { bg: '#6b7280', text: 'สีเทา - คืนเงิน', badge: '↩ Refunded' }
    }
};

let currentPromoCodeDetail = null;
let currentDetailDrawerOpen = false;

// ═════════════════════════════════════════════════════════════════════════════════
// 1. ADD ACTION COLUMN TO PROMO CODES TABLE
// ═════════════════════════════════════════════════════════════════════════════════

function renderPromoCodeTableWithActions(codes) {
    const tableBody = document.querySelector('table tbody');
    if (!tableBody) return;

    tableBody.innerHTML = codes.map((code, idx) => `
        <tr class="promo-code-row" data-code-id="${code.promo_code_id}">
            <td class="cell-code">
                <span class="code-value">${code.code}</span>
                ${code.override_flag === 'manual_redeemed' ? 
                    `<span class="badge-manual">MANUAL ⚙️</span>` : ''}
            </td>
            <td class="cell-reward">${code.reward_name || '-'}</td>
            <td class="cell-status">
                ${renderStatusBadge(code)}
            </td>
            <td class="cell-expiry">
                ${code.expiry_date ? formatDate(code.expiry_date) : 'ไม่มีกำหนด'}
            </td>
            <td class="cell-used">
                ${code.is_used === 1 ? formatDate(code.used_at) : '-'}
            </td>
            <td class="cell-actions">
                <div class="action-buttons">
                    ${renderActionButtons(code)}
                </div>
            </td>
        </tr>
    `).join('');
    
    // Attach event listeners
    attachActionButtonListeners();
}

function renderStatusBadge(code) {
    const raw = String(code?.current_status || code?.status || '').toLowerCase();
    const normalized = raw === 'available' ? 'ready' : raw === 'used' ? 'redeemed' : raw;
    const STATUS_META = {
        ready:           { label: 'พร้อมใช้งาน',     cls: 'sb-ready' },
        reserved:        { label: 'จองแล้ว',          cls: 'sb-reserved' },
        redeemed:        { label: 'ใช้งานแล้ว',       cls: 'sb-redeemed' },
        manual_redeemed: { label: 'ใช้งานโดยแอดมิน', cls: 'sb-manual' },
        expired:         { label: 'หมดอายุ',          cls: 'sb-expired' },
        cancelled:       { label: 'ยกเลิกแล้ว',      cls: 'sb-cancelled' },
        refunded:        { label: 'คืนแต้มแล้ว',     cls: 'sb-refunded' },
    };
    const meta = STATUS_META[normalized] || { label: normalized || 'ไม่ระบุสถานะ', cls: 'sb-unknown' };
    return `<span class="status-badge ${meta.cls}">${meta.label}</span>`;
}

// ── helper: single key/value row inside info-group ──────────────────────────
function _infoRow(label, value) {
    return `<div class="ig-row"><span class="ig-label">${label}</span><span class="ig-value">${value || '-'}</span></div>`;
}

// ── helper: render audit log as vertical timeline ────────────────────────────
function _renderAuditTimeline(auditLog) {
    if (!auditLog || auditLog.length === 0) {
        return `<div class="drawer-empty"><i class="fas fa-inbox"></i><p>ยังไม่มีรายการ Audit Log</p></div>`;
    }
    const ACTION_META = {
        force_redeem:  { label: 'ใช้งานแทนลูกค้า', dot: 'dot-purple', icon: 'fa-bolt' },
        reset_status:  { label: 'เปลี่ยนสถานะ',    dot: 'dot-blue',   icon: 'fa-rotate' },
        cancel_code:   { label: 'ยกเลิกโค้ด',       dot: 'dot-red',    icon: 'fa-ban' },
        reassign:      { label: 'โอนสิทธิ์',         dot: 'dot-orange', icon: 'fa-right-left' },
        extend_expiry: { label: 'ต่ออายุ',           dot: 'dot-green',  icon: 'fa-calendar-plus' },
        refund:        { label: 'คืนแต้ม',           dot: 'dot-teal',   icon: 'fa-rotate-left' },
    };
    return `<div class="audit-timeline">${auditLog.map((log, idx) => {
        const am = ACTION_META[log.action] || { label: log.action || 'แก้ไข', dot: 'dot-gray', icon: 'fa-circle' };
        const isLast = idx === auditLog.length - 1;
        const statusChange = (log.old_status || log.new_status)
            ? `<div class="atl-status-row"><span class="atl-status-pill">${log.old_status || '?'}</span><i class="fas fa-arrow-right atl-arrow"></i><span class="atl-status-pill atl-status-pill--new">${log.new_status || '?'}</span></div>`
            : '';
        const reason = [log.override_reason, log.override_reason_custom].filter(Boolean).join(' · ');
        return `
            <div class="atl-item${isLast ? ' atl-last' : ''}">
                <div class="atl-spine">
                    <div class="atl-dot ${am.dot}"><i class="fas ${am.icon}"></i></div>
                    ${isLast ? '' : '<div class="atl-line"></div>'}
                </div>
                <div class="atl-body">
                    <div class="atl-action">${am.label}</div>
                    <div class="atl-time">${log.action_timestamp ? (typeof formatDateTime === 'function' ? formatDateTime(log.action_timestamp) : log.action_timestamp) : '-'}</div>
                    ${statusChange}
                    ${log.admin_name ? `<div class="atl-meta"><i class="fas fa-user-shield"></i> ${log.admin_name}${log.admin_phone ? ` · ${log.admin_phone}` : ''}</div>` : ''}
                    ${reason ? `<div class="atl-meta"><i class="fas fa-comment-dots"></i> ${reason}</div>` : ''}
                    ${log.branch_name ? `<div class="atl-meta"><i class="fas fa-location-dot"></i> ${log.branch_name}</div>` : ''}
                    ${log.admin_notes ? `<div class="atl-meta atl-note"><i class="fas fa-note-sticky"></i> ${log.admin_notes}</div>` : ''}
                    ${log.device_ip ? `<div class="atl-ip">IP ${log.device_ip}</div>` : ''}
                </div>
            </div>`;
    }).join('')}</div>`;
}

// ── helper: actions tab content ──────────────────────────────────────────────
function _renderActionsTab(codeId) {
    return `
        <div class="actions-tab">
            <div class="action-list-section">
                <button class="ali-item" onclick="showManualUseModal(${codeId})">
                    <div class="ali-icon ali-orange"><i class="fas fa-bolt"></i></div>
                    <div class="ali-body"><div class="ali-title">ใช้งานแทนลูกค้า</div><div class="ali-desc">บันทึกการใช้งานโดยแอดมินพร้อม Audit Log</div></div>
                    <i class="fas fa-chevron-right ali-chevron"></i>
                </button>
                <button class="ali-item" onclick="showOverrideStatusModal(${codeId})">
                    <div class="ali-icon ali-blue"><i class="fas fa-sliders"></i></div>
                    <div class="ali-body"><div class="ali-title">เปลี่ยนสถานะ</div><div class="ali-desc">เปลี่ยนสถานะโค้ดพร้อมบันทึกเหตุผล</div></div>
                    <i class="fas fa-chevron-right ali-chevron"></i>
                </button>
                <button class="ali-item" onclick="exportAuditLogForCode(${codeId})">
                    <div class="ali-icon ali-gray"><i class="fas fa-download"></i></div>
                    <div class="ali-body"><div class="ali-title">ส่งออก Audit Log</div><div class="ali-desc">ดาวน์โหลดประวัติการแก้ไขทั้งหมดเป็น JSON</div></div>
                    <i class="fas fa-chevron-right ali-chevron"></i>
                </button>
            </div>
            <div class="danger-zone">
                <div class="dz-header">Danger Zone</div>
                <button class="ali-item ali-item--danger" onclick="showOverrideStatusModal(${codeId})">
                    <div class="ali-icon ali-red"><i class="fas fa-ban"></i></div>
                    <div class="ali-body"><div class="ali-title">ยกเลิกโค้ด</div><div class="ali-desc">ยกเลิกถาวร ไม่สามารถใช้งานได้อีก</div></div>
                    <i class="fas fa-chevron-right ali-chevron"></i>
                </button>
            </div>
        </div>`;
}

function renderActionButtons(code) {
    return `
        <div class="btn-group-sm" style="display: flex; gap: 6px;">
            <button class="btn-action verify-btn" data-code-id="${code.promo_code_id}" title="Verify & Use" data-action="verify">
                <i class="fas fa-check"></i> Verify
            </button>
            <button class="btn-action manual-use-btn" data-code-id="${code.promo_code_id}" title="Manual Use / Override" data-action="manual-use">
                <i class="fas fa-tools"></i> Manual
            </button>
            <button class="btn-action override-btn" data-code-id="${code.promo_code_id}" title="Override Status" data-action="override">
                <i class="fas fa-sync"></i> Override
            </button>
            <button class="btn-action detail-btn" data-code-id="${code.promo_code_id}" title="View Details & Audit Log" data-action="detail">
                <i class="fas fa-info-circle"></i> Detail
            </button>
        </div>
    `;
}

// ═════════════════════════════════════════════════════════════════════════════════
// 2. ATTACH ACTION BUTTON EVENT LISTENERS
// ═════════════════════════════════════════════════════════════════════════════════

function attachActionButtonListeners() {
    // Verify button
    document.querySelectorAll('.verify-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const codeId = btn.dataset.codeId;
            verifyPromoCode(codeId);
        });
    });
    
    // Manual Use button
    document.querySelectorAll('.manual-use-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const codeId = btn.dataset.codeId;
            showManualUseModal(codeId);
        });
    });
    
    // Override Status button
    document.querySelectorAll('.override-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const codeId = btn.dataset.codeId;
            showOverrideStatusModal(codeId);
        });
    });
    
    // Detail button
    document.querySelectorAll('.detail-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const codeId = btn.dataset.codeId;
            showCodeDetailDrawer(codeId);
        });
    });
}

// ═════════════════════════════════════════════════════════════════════════════════
// 3. MANUAL USE MODAL / DRAWER
// ═════════════════════════════════════════════════════════════════════════════════

async function showManualUseModal(codeId) {
    try {
        // Fetch code details
        const response = await fetch(
            `${API_BASE_URL}/api/admin/promo-codes/${codeId}/detail`,
            { headers: { 'Authorization': `Bearer ${localStorage.getItem(ADMIN_TOKEN_KEY)}` } }
        );
        
        if (!response.ok) throw new Error('Failed to load code details');
        const result = await response.json();
        const code = result.data.code;
        
        // Create modal HTML
        const modalHTML = `
            <div class="modal-overlay" id="manual-use-modal-overlay">
                <div class="modal-content manual-use-modal">
                    <div class="modal-header">
                        <h2>⚙️ ใช้งานแทนลูกค้า</h2>
                        <button class="modal-close" onclick="closeManualUseModal()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <div class="modal-body">
                        <!-- Code Information Section -->
                        <div class="info-section">
                            <h3>📌 ข้อมูลโค้ดส่วนลด</h3>
                            <div class="info-grid">
                                <div class="info-item">
                                    <label>รหัสโค้ด</label>
                                    <span class="info-value">${code.code}</span>
                                </div>
                                <div class="info-item">
                                    <label>สถานะปัจจุบัน</label>
                                    ${renderStatusBadge(code)}
                                </div>
                                <div class="info-item">
                                    <label>ชื่อรางวัล</label>
                                    <span class="info-value">${code.reward_name}</span>
                                </div>
                                <div class="info-item">
                                    <label>แต้มที่ได้รับ</label>
                                    <span class="info-value">${code.reward_points} แต้ม</span>
                                </div>
                                <div class="info-item">
                                    <label>แคมเปญ</label>
                                    <span class="info-value">${code.campaign_name || '-'}</span>
                                </div>
                                <div class="info-item">
                                    <label>วันหมดอายุ</label>
                                    <span class="info-value">${code.expiry_date ? formatDate(code.expiry_date) : 'ไม่มีกำหนด'}</span>
                                </div>
                            </div>
                        </div>

                        <!-- Current Status Section -->
                        <div class="info-section">
                            <h3>📊 สถานะล่าสุด</h3>
                            <div class="status-detail">
                                <p><strong>สถานะ:</strong> ${renderStatusBadge(code)}</p>
                                ${code.is_used === 1 ? `
                                    <p><strong>ใช้งานโดย:</strong> ${code.used_by_phone}</p>
                                    <p><strong>ใช้งานเมื่อ:</strong> ${formatDateTime(code.used_at)}</p>
                                ` : ''}
                                ${code.override_flag ? `
                                    <p><strong>แฟล็กแก้ไข:</strong> ${code.override_flag}</p>
                                    <p><strong>เหตุผลการแก้ไข:</strong> ${code.override_reason || '-'}</p>
                                ` : ''}
                            </div>
                        </div>

                        <!-- Admin Override Form -->
                        <div class="form-section">
                            <h3>✋ ข้อมูลการดำเนินการโดยแอดมิน</h3>

                            <div class="form-group">
                                <label>เหตุผลในการใช้งานแทน *</label>
                                <select id="override-reason" class="form-control" required>
                                    <option value="">-- เลือกเหตุผล --</option>
                                    ${MANUAL_OVERRIDE_CONFIG.reasons.map(r =>
                                        `<option value="${r.code}">${r.label}</option>`
                                    ).join('')}
                                </select>
                            </div>

                            <div class="form-group" id="custom-reason-group" style="display: none;">
                                <label>ระบุเหตุผลเพิ่มเติม</label>
                                <textarea id="custom-reason-text" class="form-control" placeholder="กรอกเหตุผลเพิ่มเติม..." rows="2"></textarea>
                            </div>

                            <div class="form-row">
                                <div class="form-group">
                                    <label>สาขา</label>
                                    <input type="text" id="override-branch" class="form-control" placeholder="ชื่อสาขา">
                                </div>
                                <div class="form-group">
                                    <label>ชื่อพนักงาน</label>
                                    <input type="text" id="override-staff" class="form-control" placeholder="ชื่อพนักงาน">
                                </div>
                            </div>

                            <div class="form-group">
                                <label>หมายเหตุ</label>
                                <textarea id="override-notes" class="form-control" placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)..." rows="3"></textarea>
                            </div>

                            <!-- Security Warning -->
                            <div class="warning-box">
                                <p>
                                    <i class="fas fa-exclamation-triangle"></i>
                                    <strong>⚠️ สำคัญ:</strong> การดำเนินการนี้จะถูกบันทึกและไม่สามารถยกเลิกได้
                                    ข้อมูลทั้งหมด รวมถึง IP, อุปกรณ์ และเหตุผล จะถูกบันทึกใน Audit Log
                                </p>
                            </div>
                        </div>
                    </div>

                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="closeManualUseModal()">ยกเลิก</button>
                        <button class="btn btn-danger" onclick="confirmForceRedeem(${codeId})">
                            <i class="fas fa-check"></i> ยืนยันการใช้งานแทนลูกค้า
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Insert modal into DOM
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Attach event listeners
        document.getElementById('override-reason').addEventListener('change', (e) => {
            const customReasonGroup = document.getElementById('custom-reason-group');
            customReasonGroup.style.display = e.target.value === 'other' ? 'block' : 'none';
        });
        
    } catch (error) {
        console.error('Error loading manual use modal:', error);
        showToast('Failed to load code details', 'error');
    }
}

function closeManualUseModal() {
    const modal = document.getElementById('manual-use-modal-overlay');
    if (modal) modal.remove();
}

async function confirmForceRedeem(codeId) {
    const reason = document.getElementById('override-reason')?.value;
    const customReason = document.getElementById('custom-reason-text')?.value;
    const branch = document.getElementById('override-branch')?.value;
    const staff = document.getElementById('override-staff')?.value;
    const notes = document.getElementById('override-notes')?.value;
    
    if (!reason) {
        showToast('Please select override reason', 'warning');
        return;
    }
    
    // Show confirmation dialog
    const confirmed = confirm(
        `⚠️ คำเตือน: คุณกำลังจะใช้งานโค้ดนี้แทนลูกค้า\n\n` +
        `การดำเนินการนี้จะ:\n` +
        `• เปลี่ยนสถานะโค้ดเป็น "ใช้งานโดยแอดมิน"\n` +
        `• ไม่สามารถยกเลิกได้\n` +
        `• ถูกบันทึกลงใน Audit Log\n` +
        `• บันทึก IP และอุปกรณ์ของคุณ\n\n` +
        `แน่ใจหรือไม่ที่จะดำเนินการต่อ?`
    );
    
    if (!confirmed) return;
    
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/admin/override/force-redeem`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem(ADMIN_TOKEN_KEY)}`
                },
                body: JSON.stringify({
                    promo_code_id: codeId,
                    override_reason: reason,
                    override_reason_custom: customReason,
                    admin_notes: notes,
                    branch_id: null,
                    branch_name: branch,
                    staff_id: null,
                    staff_name: staff,
                    device_ip: await getClientIP(),
                    user_agent: navigator.userAgent
                })
            }
        );
        
        if (!response.ok) throw new Error('Failed to force redeem');
        
        showToast('✅ ดำเนินการใช้งานโค้ดแทนลูกค้าสำเร็จ!', 'success');
        closeManualUseModal();
        
        // Reload promo codes list
        await loadCampaignCodes(currentSelectedCampaignId);
        
    } catch (error) {
        console.error('Error force redeeming code:', error);
        showToast('เกิดข้อผิดพลาด ไม่สามารถใช้งานโค้ดแทนลูกค้าได้', 'error');
    }
}

// ═════════════════════════════════════════════════════════════════════════════════
// 4. OVERRIDE STATUS MODAL
// ═════════════════════════════════════════════════════════════════════════════════

async function loadPromoCodeDetail(codeId) {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/admin/promo-codes/${codeId}/detail`,
            { headers: { 'Authorization': `Bearer ${localStorage.getItem(ADMIN_TOKEN_KEY)}` } }
        );

        if (response.status === 401) {
            if (typeof clearAuthSession === 'function') {
                clearAuthSession();
            }
            if (typeof showLogin === 'function') {
                showLogin('Session expired. Please sign in again.');
            }
            throw new Error('Session expired. Please sign in again.');
        }

        if (!response.ok) {
            // Try to extract a helpful message from server response
            try {
                const err = await response.json();
                const msg = err?.error || err?.message || 'Failed to load code details';
                throw new Error(msg);
            } catch (e) {
                // If parsing fails, fall through to DOM fallback below
                throw new Error('api_error');
            }
        }

        return await response.json();
    } catch (err) {
        // If fetching failed (network / server error), attempt a graceful DOM fallback
        try {
            // Try to find a promo-code-row with the code id
            let codeText = null;
            let rewardName = '-';
            let currentStatus = 'unknown';
            let createdAt = null;
            let usedAt = null;
            let rewardPoints = 0;

            const promoRow = document.querySelector(`.promo-code-row[data-code-id="${codeId}"]`);
            if (promoRow) {
                codeText = promoRow.querySelector('.code-value')?.textContent?.trim() || null;
                rewardName = promoRow.querySelector('.cell-reward')?.textContent?.trim() || rewardName;
                currentStatus = promoRow.querySelector('.cell-status')?.textContent?.trim() || currentStatus;
                createdAt = promoRow.querySelector('.cell-expiry')?.textContent?.trim() || createdAt;
                usedAt = promoRow.querySelector('.cell-used')?.textContent?.trim() || usedAt;
            } else {
                // Try to locate a verifier-row by searching for a button with an onclick containing the id
                const btn = Array.from(document.querySelectorAll('[onclick]')).find(el => (el.getAttribute('onclick') || '').includes(`(${codeId})`));
                if (btn) {
                    const vRow = btn.closest('.verifier-row') || btn.closest('tr');
                    if (vRow) {
                        codeText = vRow.querySelector('.verifier-code-value')?.textContent?.trim() || codeText;
                        rewardName = vRow.querySelector('.verifier-code-sub')?.textContent?.trim() || rewardName;
                        currentStatus = vRow.querySelector('.verifier-cell.status')?.textContent?.trim() || currentStatus;
                    }
                }
            }

            // Build a minimal response structure so modals can open
            const fallback = {
                data: {
                    code: {
                        promo_code_id: codeId,
                        code: codeText || (`#${codeId}`),
                        reward_name: rewardName,
                        current_status: currentStatus,
                        expiry_date: null,
                        is_used: 0,
                        reward_points: rewardPoints,
                        created_at: createdAt,
                        used_at: usedAt
                    },
                    timeline: [],
                    auditLog: [],
                    assignedUser: null
                }
            };

            showToast('Server error — showing limited local info', 'warning');
            return fallback;
        } catch (fallbackErr) {
            // Final fallback: rethrow original error message to be handled by caller
            throw err;
        }
    }
}

async function showOverrideStatusModal(codeId) {
    try {
        const result = await loadPromoCodeDetail(codeId);
        const code = result.data.code;
        
        const modalHTML = `
            <div class="modal-overlay" id="override-status-modal-overlay">
                <div class="modal-content override-status-modal">
                    <div class="modal-header">
                        <h2>🔄 เปลี่ยนสถานะโค้ด</h2>
                        <button class="modal-close" onclick="closeOverrideStatusModal()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <div class="modal-body">
                        <div class="info-section">
                            <h4>รหัสโค้ด: <strong>${code.code}</strong></h4>
                            <p>สถานะปัจจุบัน: ${renderStatusBadge(code)}</p>
                        </div>

                        <div class="form-section">
                            <h4>เลือกสถานะใหม่</h4>

                            <div class="status-radio-list">
                                ${[
                                    { v: 'ready',           label: 'พร้อมใช้งาน',     desc: 'รีเซ็ตโค้ดให้กลับมาใช้งานได้',          cls: 'srl-green'  },
                                    { v: 'reserved',        label: 'จองแล้ว',          desc: 'โค้ดถูกจองไว้ยังไม่ได้ใช้งาน',          cls: 'srl-orange' },
                                    { v: 'redeemed',        label: 'ใช้งานแล้ว',       desc: 'ทำเครื่องหมายว่าถูกใช้งานปกติแล้ว',     cls: 'srl-blue'   },
                                    { v: 'manual_redeemed', label: 'ใช้งานโดยแอดมิน', desc: 'บันทึกว่าแอดมินใช้งานแทนลูกค้า',        cls: 'srl-purple' },
                                    { v: 'expired',         label: 'หมดอายุ',          desc: 'โค้ดหมดอายุ ไม่สามารถใช้งานได้',        cls: 'srl-red'    },
                                    { v: 'cancelled',       label: 'ยกเลิกแล้ว',      desc: 'ยกเลิกการใช้งานโค้ดนี้',                cls: 'srl-gray'   },
                                    { v: 'refunded',        label: 'คืนแต้มแล้ว',     desc: 'คืนแต้มให้ผู้ใช้เรียบร้อยแล้ว',        cls: 'srl-gray'   },
                                ].map(s => `
                                    <label class="srl-item ${s.cls}">
                                        <input type="radio" name="new-status" value="${s.v}">
                                        <div class="srl-dot"></div>
                                        <div class="srl-text">
                                            <span class="srl-label">${s.label}</span>
                                            <span class="srl-desc">${s.desc}</span>
                                        </div>
                                        <div class="srl-check"><i class="fas fa-check"></i></div>
                                    </label>`).join('')}
                            </div>

                            <div class="form-group" style="margin-top: 20px;">
                                <label>เหตุผลในการเปลี่ยนสถานะ *</label>
                                <select id="status-override-reason" class="form-control" required>
                                    <option value="">-- เลือกเหตุผล --</option>
                                    ${MANUAL_OVERRIDE_CONFIG.reasons.map(r =>
                                        `<option value="${r.code}">${r.label}</option>`
                                    ).join('')}
                                </select>
                            </div>

                            <div class="form-group">
                                <label>หมายเหตุ</label>
                                <textarea id="status-override-notes" class="form-control" placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)..." rows="3"></textarea>
                            </div>

                            <div class="warning-box">
                                <p>
                                    <i class="fas fa-exclamation-triangle"></i>
                                    <strong>⚠️ คำเตือน:</strong> การดำเนินการนี้จะถูกบันทึกใน Audit Log อย่างถาวร
                                </p>
                            </div>
                        </div>
                    </div>

                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="closeOverrideStatusModal()">ยกเลิก</button>
                        <button class="btn btn-warning" onclick="confirmStatusChange(${codeId})">
                            <i class="fas fa-sync"></i> ยืนยันการเปลี่ยนสถานะ
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
    } catch (error) {
        console.error('Error loading override status modal:', error);
        const message = error?.message === 'Session expired. Please sign in again.'
            ? 'Session expired. Please sign in again.'
            : 'Failed to load code details';
        showToast(message, error?.message === 'Session expired. Please sign in again.' ? 'warning' : 'error');
    }
}

function closeOverrideStatusModal() {
    const modal = document.getElementById('override-status-modal-overlay');
    if (modal) modal.remove();
}

async function confirmStatusChange(codeId) {
    const newStatus = document.querySelector('input[name="new-status"]:checked')?.value;
    const reason = document.getElementById('status-override-reason')?.value;
    const notes = document.getElementById('status-override-notes')?.value;
    
    if (!newStatus) {
        showToast('Please select new status', 'warning');
        return;
    }
    
    if (!reason) {
        showToast('Please select reason', 'warning');
        return;
    }
    
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/admin/override/reset-status`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem(ADMIN_TOKEN_KEY)}`
                },
                body: JSON.stringify({
                    promo_code_id: codeId,
                    new_status: newStatus,
                    override_reason: reason,
                    admin_notes: notes,
                    device_ip: await getClientIP(),
                    user_agent: navigator.userAgent
                })
            }
        );
        
        if (!response.ok) {
            // try to extract server error message
            let errMsg = 'Failed to change status';
            try {
                const payload = await response.json();
                errMsg = payload?.error || payload?.message || errMsg;
            } catch (_) {
                try {
                    const text = await response.text();
                    if (text) errMsg = text;
                } catch (_) {}
            }
            throw new Error(errMsg);
        }

        showToast('✅ เปลี่ยนสถานะโค้ดสำเร็จ!', 'success');
        closeOverrideStatusModal();
        await loadCampaignCodes(currentSelectedCampaignId);
        
    } catch (error) {
        console.error('Error changing status:', error);
        showToast(error?.message || 'Failed to change status', 'error');
    }
}

// ═════════════════════════════════════════════════════════════════════════════════
// 5. CODE DETAIL DRAWER WITH AUDIT LOG TIMELINE
// ═════════════════════════════════════════════════════════════════════════════════

async function showCodeDetailDrawer(codeId) {
    try {
        const result = await loadPromoCodeDetail(codeId);
        const code = result.data.code;
        const timeline = result.data.timeline || [];
        const auditLog = result.data.auditLog || [];
        
        const assignedUser = result.data.assignedUser;
        const hasManual = String(code.override_flag || '').toLowerCase() === 'manual_redeemed';

        const drawerHTML = `
            <div class="detail-drawer-overlay" id="detail-drawer-overlay" onclick="closeCodeDetailDrawer()"></div>
            <div class="detail-drawer" id="code-detail-drawer">

                <!-- ── HERO SUMMARY HEADER ─────────────────────────────── -->
                <div class="drawer-hero">
                    <button class="drawer-hero-close" onclick="closeCodeDetailDrawer()" title="ปิด">
                        <i class="fas fa-times"></i>
                    </button>
                    <div class="drawer-hero-code">${code.code || '-'}</div>
                    <div class="drawer-hero-badges">
                        ${renderStatusBadge(code)}
                        ${hasManual ? '<span class="badge-manual-hero"><i class="fas fa-bolt"></i> MANUAL</span>' : ''}
                    </div>
                    <div class="drawer-hero-sub">
                        <span>${code.reward_name || '-'}</span>
                        <span class="hero-dot">·</span>
                        <span>${code.reward_points || 0} แต้ม</span>
                        ${code.expiry_date ? `<span class="hero-dot">·</span><span>หมดอายุ ${formatDate(code.expiry_date)}</span>` : ''}
                    </div>
                </div>

                <!-- ── TAB NAVIGATION ──────────────────────────────────── -->
                <div class="drawer-tabs">
                    <button class="tab-btn active" data-tab="info"><i class="fas fa-circle-info"></i> ข้อมูล</button>
                    <button class="tab-btn" data-tab="timeline"><i class="fas fa-timeline"></i> ประวัติ</button>
                    <button class="tab-btn" data-tab="audit"><i class="fas fa-list-check"></i> Audit Log</button>
                    <button class="tab-btn" data-tab="actions"><i class="fas fa-gear"></i> จัดการ</button>
                </div>

                <div class="drawer-content">

                    <!-- TAB 1: INFO ───────────────────────────────────── -->
                    <div class="tab-content active" data-tab="info">

                        <div class="info-group">
                            <div class="ig-title">รายละเอียดโค้ด</div>
                            ${_infoRow('รหัสโค้ด', `<code class="code-mono">${code.code || '-'}</code>`)}
                            ${_infoRow('สถานะ', renderStatusBadge(code))}
                            ${_infoRow('ชื่อรางวัล', code.reward_name || '-')}
                            ${_infoRow('แต้มที่ได้รับ', `${code.reward_points || 0} แต้ม`)}
                            ${_infoRow('แคมเปญ', code.campaign_name || '-')}
                            ${_infoRow('วันที่สร้าง', code.created_at ? formatDateTime(code.created_at) : '-')}
                            ${_infoRow('วันหมดอายุ', code.expiry_date ? formatDate(code.expiry_date) : 'ไม่มีกำหนด')}
                            ${_infoRow('วันที่ใช้งาน', code.used_at ? formatDateTime(code.used_at) : '-')}
                            ${code.override_flag ? _infoRow('Override Flag', `<span class="badge-manual-inline">${code.override_flag}</span>`) : ''}
                            ${code.override_reason ? _infoRow('เหตุผล Override', code.override_reason) : ''}
                        </div>

                        <div class="info-group">
                            <div class="ig-title">ข้อมูลผู้ใช้</div>
                            ${assignedUser ? `
                                ${_infoRow('ชื่อ', assignedUser.full_name || '-')}
                                ${_infoRow('เบอร์โทร', assignedUser.phone_number || '-')}
                                ${_infoRow('รหัสผู้ใช้', assignedUser.user_id || '-')}
                                ${assignedUser.member_level ? _infoRow('ระดับสมาชิก', assignedUser.member_level) : ''}
                                ${assignedUser.total_points != null ? _infoRow('แต้มรวม', `${assignedUser.total_points} แต้ม`) : ''}
                            ` : `<p class="drawer-empty-sm">ยังไม่มีผู้ใช้ที่ผูกกับโค้ดนี้</p>`}
                        </div>

                    </div>

                    <!-- TAB 2: TIMELINE ──────────────────────────────── -->
                    <div class="tab-content" data-tab="timeline">
                        ${timeline.length > 0 ? `<div class="audit-timeline">${timeline.map((ev, idx) => {
                            const isLast = idx === timeline.length - 1;
                            return `
                                <div class="atl-item${isLast ? ' atl-last' : ''}">
                                    <div class="atl-spine">
                                        <div class="atl-dot dot-blue"><i class="fas fa-${getTimelineIcon(ev.event_type)}"></i></div>
                                        ${isLast ? '' : '<div class="atl-line"></div>'}
                                    </div>
                                    <div class="atl-body">
                                        <div class="atl-action">${ev.event_title || '-'}</div>
                                        <div class="atl-time">${ev.event_timestamp ? formatDateTime(ev.event_timestamp) : '-'}</div>
                                        ${ev.event_description ? `<div class="atl-meta">${ev.event_description}</div>` : ''}
                                        ${ev.actor_name ? `<div class="atl-meta"><i class="fas fa-user"></i> ${ev.actor_name}</div>` : ''}
                                    </div>
                                </div>`;
                        }).join('')}</div>` : `<div class="drawer-empty"><i class="fas fa-inbox"></i><p>ยังไม่มีเหตุการณ์ที่บันทึกไว้</p></div>`}
                    </div>

                    <!-- TAB 3: AUDIT LOG ─────────────────────────────── -->
                    <div class="tab-content" data-tab="audit">
                        ${_renderAuditTimeline(auditLog)}
                    </div>

                    <!-- TAB 4: ACTIONS ───────────────────────────────── -->
                    <div class="tab-content" data-tab="actions">
                        ${_renderActionsTab(codeId)}
                    </div>

                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', drawerHTML);
        
        // Attach tab listeners
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;
                switchTab(tabName);
            });
        });
        
        currentDetailDrawerOpen = true;
        currentPromoCodeDetail = { codeId, code, timeline, auditLog };
        
    } catch (error) {
        console.error('Error loading code detail drawer:', error);
        const message = error?.message === 'Session expired. Please sign in again.'
            ? 'Session expired. Please sign in again.'
            : 'Failed to load code details';
        showToast(message, error?.message === 'Session expired. Please sign in again.' ? 'warning' : 'error');
    }
}

function closeCodeDetailDrawer() {
    const drawer = document.getElementById('code-detail-drawer');
    const overlay = document.getElementById('detail-drawer-overlay');
    if (drawer) drawer.remove();
    if (overlay) overlay.remove();
    currentDetailDrawerOpen = false;
}

function switchTab(tabName) {
    // Remove active from all tabs
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // Add active to selected tab
    document.querySelector(`[data-tab="${tabName}"].tab-btn`)?.classList.add('active');
    document.querySelector(`[data-tab="${tabName}"].tab-content`)?.classList.add('active');
}

function getTimelineIcon(eventType) {
    const icons = {
        'created': 'plus-circle',
        'used': 'check-circle',
        'failed': 'times-circle',
        'manual_override': 'tools',
        'expired': 'hourglass-end',
        'cancelled': 'ban',
        'reassigned': 'exchange-alt',
        'extended': 'plus',
        'refunded': 'undo'
    };
    return icons[eventType] || 'info-circle';
}

function getActionColor(action) {
    const colors = {
        'force_redeem': '#ef4444',
        'reset_status': '#f59e0b',
        'cancel_code': '#6b7280',
        'reassign': '#3b82f6',
        'extend_expiry': '#10b981',
        'refund': '#8b5cf6'
    };
    return colors[action] || '#6b7280';
}

async function exportAuditLogForCode(codeId) {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/admin/override/audit-log/export?format=json&promo_code_id=${codeId}`,
            { headers: { 'Authorization': `Bearer ${localStorage.getItem(ADMIN_TOKEN_KEY)}` } }
        );
        
        if (!response.ok) throw new Error('Failed to export');
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-log-code-${codeId}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        showToast('✅ ส่งออก Audit Log สำเร็จ', 'success');
    } catch (error) {
        console.error('Error exporting audit log:', error);
        showToast('เกิดข้อผิดพลาด ไม่สามารถส่งออก Audit Log ได้', 'error');
    }
}

// ═════════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═════════════════════════════════════════════════════════════════════════════════

function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

async function getClientIP() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip || 'unknown';
    } catch {
        return 'unknown';
    }
}

function verifyPromoCode(codeId) {
    if (typeof showCodeDetailDrawer === 'function') {
        showCodeDetailDrawer(codeId);
        return;
    }

    showToast('กำลังเปิดรายละเอียดโค้ด', 'info');
}

function showToast(message, type = 'info') {
    const toastHTML = `
        <div class="toast toast-${type}">
            ${message}
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', toastHTML);
    
    const toast = document.querySelector('.toast:last-child');
    setTimeout(() => toast?.remove(), 3000);
}

// ═════════════════════════════════════════════════════════════════════════════════
// INITIALIZATION & INTEGRATION
// ═════════════════════════════════════════════════════════════════════════════════

// Call this in initPromoVerifier() to enable manual override features
function enableManualOverrideFeatures() {
    console.log('✅ Manual override features enabled');
    // Features are automatically enabled when rendering promo code table
}
