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
    let status = code.override_flag === 'manual_redeemed' ? 'manual_redeemed' : 
                (code.is_used === 1 ? 'redeemed' : 
                (code.expiry_date && new Date(code.expiry_date) < new Date() ? 'expired' : 'ready'));
    
    const config = MANUAL_OVERRIDE_CONFIG.statusColors[status] || { bg: '#9ca3af', text: 'Unknown' };
    
    return `
        <span class="status-badge" style="background-color: ${config.bg}; color: white; padding: 4px 12px; border-radius: 20px; font-weight: 500; font-size: 12px;">
            ${config.badge}
        </span>
    `;
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
                        <h2>⚙️ Manual Use - Force Redeem</h2>
                        <button class="modal-close" onclick="closeManualUseModal()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    
                    <div class="modal-body">
                        <!-- Code Information Section -->
                        <div class="info-section">
                            <h3>📌 Promo Code Information</h3>
                            <div class="info-grid">
                                <div class="info-item">
                                    <label>Code</label>
                                    <span class="info-value">${code.code}</span>
                                </div>
                                <div class="info-item">
                                    <label>Status</label>
                                    ${renderStatusBadge(code)}
                                </div>
                                <div class="info-item">
                                    <label>Reward</label>
                                    <span class="info-value">${code.reward_name}</span>
                                </div>
                                <div class="info-item">
                                    <label>Points</label>
                                    <span class="info-value">${code.reward_points} pts</span>
                                </div>
                                <div class="info-item">
                                    <label>Campaign</label>
                                    <span class="info-value">${code.campaign_name || '-'}</span>
                                </div>
                                <div class="info-item">
                                    <label>Expiry Date</label>
                                    <span class="info-value">${code.expiry_date ? formatDate(code.expiry_date) : 'No limit'}</span>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Current Status Section -->
                        <div class="info-section">
                            <h3>📊 Current Status</h3>
                            <div class="status-detail">
                                <p><strong>Status:</strong> ${code.current_status}</p>
                                ${code.is_used === 1 ? `
                                    <p><strong>Used By:</strong> ${code.used_by_phone}</p>
                                    <p><strong>Used At:</strong> ${formatDateTime(code.used_at)}</p>
                                ` : ''}
                                ${code.override_flag ? `
                                    <p><strong>Override Flag:</strong> ${code.override_flag}</p>
                                    <p><strong>Override Reason:</strong> ${code.override_reason}</p>
                                ` : ''}
                            </div>
                        </div>
                        
                        <!-- Admin Override Form -->
                        <div class="form-section">
                            <h3>✋ Admin Override Action</h3>
                            
                            <div class="form-group">
                                <label>Reason for Override *</label>
                                <select id="override-reason" class="form-control" required>
                                    <option value="">-- Select Reason --</option>
                                    ${MANUAL_OVERRIDE_CONFIG.reasons.map(r => 
                                        `<option value="${r.code}">${r.label}</option>`
                                    ).join('')}
                                </select>
                            </div>
                            
                            <div class="form-group" id="custom-reason-group" style="display: none;">
                                <label>Custom Reason</label>
                                <textarea id="custom-reason-text" class="form-control" placeholder="Enter custom reason..." rows="2"></textarea>
                            </div>
                            
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Branch</label>
                                    <input type="text" id="override-branch" class="form-control" placeholder="Branch name">
                                </div>
                                <div class="form-group">
                                    <label>Staff Name</label>
                                    <input type="text" id="override-staff" class="form-control" placeholder="Staff name">
                                </div>
                            </div>
                            
                            <div class="form-group">
                                <label>Admin Notes</label>
                                <textarea id="override-notes" class="form-control" placeholder="Optional notes..." rows="3"></textarea>
                            </div>
                            
                            <!-- Security Warning -->
                            <div class="warning-box">
                                <p>
                                    <i class="fas fa-exclamation-triangle"></i>
                                    <strong>⚠️ Important:</strong> This action will be logged and cannot be undone. 
                                    All details including your IP, device, and reason will be recorded in audit log.
                                </p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="closeManualUseModal()">Cancel</button>
                        <button class="btn btn-danger" onclick="confirmForceRedeem(${codeId})">
                            <i class="fas fa-check"></i> Confirm Force Redeem
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
        `⚠️ WARNING: You are about to force redeem this code.\n\n` +
        `This action:\n` +
        `• Will mark code as manually redeemed\n` +
        `• CANNOT be undone\n` +
        `• Will be logged in audit trail\n` +
        `• Will record your IP and device\n\n` +
        `Are you absolutely sure?`
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
        
        showToast('✅ Code marked as manually redeemed successfully!', 'success');
        closeManualUseModal();
        
        // Reload promo codes list
        await loadCampaignCodes(currentSelectedCampaignId);
        
    } catch (error) {
        console.error('Error force redeeming code:', error);
        showToast('Failed to force redeem code', 'error');
    }
}

// ═════════════════════════════════════════════════════════════════════════════════
// 4. OVERRIDE STATUS MODAL
// ═════════════════════════════════════════════════════════════════════════════════

async function showOverrideStatusModal(codeId) {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/admin/promo-codes/${codeId}/detail`,
            { headers: { 'Authorization': `Bearer ${localStorage.getItem(ADMIN_TOKEN_KEY)}` } }
        );
        
        if (!response.ok) throw new Error('Failed to load code details');
        const result = await response.json();
        const code = result.data.code;
        
        const modalHTML = `
            <div class="modal-overlay" id="override-status-modal-overlay">
                <div class="modal-content override-status-modal">
                    <div class="modal-header">
                        <h2>🔄 Override Status</h2>
                        <button class="modal-close" onclick="closeOverrideStatusModal()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    
                    <div class="modal-body">
                        <div class="info-section">
                            <h4>Code: <strong>${code.code}</strong></h4>
                            <p>Current Status: ${renderStatusBadge(code)}</p>
                        </div>
                        
                        <div class="form-section">
                            <h4>Select New Status</h4>
                            
                            <div class="status-options">
                                <label class="status-option">
                                    <input type="radio" name="new-status" value="ready"> 
                                    <span class="status-box" style="background: #10b981;">
                                        ✓ Ready (พร้อมใช้)
                                    </span>
                                </label>
                                <label class="status-option">
                                    <input type="radio" name="new-status" value="reserved">
                                    <span class="status-box" style="background: #3b82f6;">
                                        ⏳ Reserved (จองแล้ว)
                                    </span>
                                </label>
                                <label class="status-option">
                                    <input type="radio" name="new-status" value="cancelled">
                                    <span class="status-box" style="background: #6b7280;">
                                        ✕ Cancelled (ยกเลิก)
                                    </span>
                                </label>
                                <label class="status-option">
                                    <input type="radio" name="new-status" value="refunded">
                                    <span class="status-box" style="background: #6b7280;">
                                        ↩ Refunded (คืนเงิน)
                                    </span>
                                </label>
                            </div>
                            
                            <div class="form-group" style="margin-top: 20px;">
                                <label>Reason for Status Change *</label>
                                <select id="status-override-reason" class="form-control" required>
                                    <option value="">-- Select Reason --</option>
                                    ${MANUAL_OVERRIDE_CONFIG.reasons.map(r => 
                                        `<option value="${r.code}">${r.label}</option>`
                                    ).join('')}
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label>Notes</label>
                                <textarea id="status-override-notes" class="form-control" placeholder="Optional notes..." rows="3"></textarea>
                            </div>
                            
                            <div class="warning-box">
                                <p>
                                    <i class="fas fa-exclamation-triangle"></i>
                                    <strong>⚠️ Warning:</strong> This action will be permanently logged in audit trail.
                                </p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="modal-footer">
                        <button class="btn btn-secondary" onclick="closeOverrideStatusModal()">Cancel</button>
                        <button class="btn btn-warning" onclick="confirmStatusChange(${codeId})">
                            <i class="fas fa-sync"></i> Change Status
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
    } catch (error) {
        console.error('Error loading override status modal:', error);
        showToast('Failed to load code details', 'error');
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
        
        if (!response.ok) throw new Error('Failed to change status');
        
        showToast('✅ Code status changed successfully!', 'success');
        closeOverrideStatusModal();
        await loadCampaignCodes(currentSelectedCampaignId);
        
    } catch (error) {
        console.error('Error changing status:', error);
        showToast('Failed to change status', 'error');
    }
}

// ═════════════════════════════════════════════════════════════════════════════════
// 5. CODE DETAIL DRAWER WITH AUDIT LOG TIMELINE
// ═════════════════════════════════════════════════════════════════════════════════

async function showCodeDetailDrawer(codeId) {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/admin/promo-codes/${codeId}/detail`,
            { headers: { 'Authorization': `Bearer ${localStorage.getItem(ADMIN_TOKEN_KEY)}` } }
        );
        
        if (!response.ok) throw new Error('Failed to load code details');
        const result = await response.json();
        const code = result.data.code;
        const timeline = result.data.timeline || [];
        const auditLog = result.data.auditLog || [];
        
        const drawerHTML = `
            <div class="detail-drawer-overlay" id="detail-drawer-overlay" onclick="closeCodeDetailDrawer()"></div>
            <div class="detail-drawer" id="code-detail-drawer">
                <div class="drawer-header">
                    <h2>📋 Code Detail & Audit Log</h2>
                    <button class="drawer-close" onclick="closeCodeDetailDrawer()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="drawer-content">
                    <!-- TAB NAVIGATION -->
                    <div class="drawer-tabs">
                        <button class="tab-btn active" data-tab="info">
                            <i class="fas fa-info-circle"></i> Info
                        </button>
                        <button class="tab-btn" data-tab="timeline">
                            <i class="fas fa-history"></i> Timeline
                        </button>
                        <button class="tab-btn" data-tab="audit">
                            <i class="fas fa-list"></i> Audit Log
                        </button>
                        <button class="tab-btn" data-tab="actions">
                            <i class="fas fa-cog"></i> Actions
                        </button>
                    </div>
                    
                    <!-- TAB 1: INFORMATION -->
                    <div class="tab-content active" data-tab="info">
                        <div class="detail-section">
                            <h4>🎁 Promo Information</h4>
                            <div class="detail-grid">
                                <div class="detail-item">
                                    <label>Code</label>
                                    <span class="value">${code.code}</span>
                                </div>
                                <div class="detail-item">
                                    <label>Status</label>
                                    ${renderStatusBadge(code)}
                                </div>
                                <div class="detail-item">
                                    <label>Reward</label>
                                    <span class="value">${code.reward_name}</span>
                                </div>
                                <div class="detail-item">
                                    <label>Points</label>
                                    <span class="value">${code.reward_points} pts</span>
                                </div>
                                <div class="detail-item">
                                    <label>Campaign</label>
                                    <span class="value">${code.campaign_name || '-'}</span>
                                </div>
                                <div class="detail-item">
                                    <label>Created</label>
                                    <span class="value">${formatDateTime(code.created_at)}</span>
                                </div>
                                <div class="detail-item">
                                    <label>Expiry Date</label>
                                    <span class="value">${code.expiry_date ? formatDate(code.expiry_date) : 'No limit'}</span>
                                </div>
                                <div class="detail-item">
                                    <label>Used At</label>
                                    <span class="value">${code.used_at ? formatDateTime(code.used_at) : '-'}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="detail-section">
                            <h4>👤 User Information</h4>
                            ${result.data.assignedUser ? `
                                <div class="detail-grid">
                                    <div class="detail-item">
                                        <label>Name</label>
                                        <span class="value">${result.data.assignedUser.full_name || '-'}</span>
                                    </div>
                                    <div class="detail-item">
                                        <label>Phone</label>
                                        <span class="value">${result.data.assignedUser.phone_number}</span>
                                    </div>
                                    <div class="detail-item">
                                        <label>User ID</label>
                                        <span class="value">${result.data.assignedUser.user_id}</span>
                                    </div>
                                </div>
                            ` : `<p class="text-muted">No user assigned</p>`}
                        </div>
                    </div>
                    
                    <!-- TAB 2: TIMELINE -->
                    <div class="tab-content" data-tab="timeline">
                        <div class="timeline-container">
                            ${timeline.length > 0 ? timeline.map((event, idx) => `
                                <div class="timeline-item">
                                    <div class="timeline-marker">
                                        <i class="fas fa-${getTimelineIcon(event.event_type)}"></i>
                                    </div>
                                    <div class="timeline-content">
                                        <h5>${event.event_title}</h5>
                                        <p>${event.event_description || ''}</p>
                                        <small>
                                            ${formatDateTime(event.event_timestamp)}
                                            ${event.actor_name ? ` • by ${event.actor_name}` : ''}
                                        </small>
                                    </div>
                                </div>
                            `).join('') : '<p class="text-muted">No events recorded</p>'}
                        </div>
                    </div>
                    
                    <!-- TAB 3: AUDIT LOG -->
                    <div class="tab-content" data-tab="audit">
                        <div class="audit-log-container">
                            ${auditLog.length > 0 ? auditLog.map((log, idx) => `
                                <div class="audit-log-entry">
                                    <div class="audit-header">
                                        <span class="action-badge" style="background: ${getActionColor(log.action)};">
                                            ${log.action.toUpperCase()}
                                        </span>
                                        <span class="timestamp">${formatDateTime(log.action_timestamp)}</span>
                                    </div>
                                    <div class="audit-details">
                                        <p><strong>Admin:</strong> ${log.admin_name} (${log.admin_phone})</p>
                                        <p><strong>Status Change:</strong> ${log.old_status} → ${log.new_status}</p>
                                        <p><strong>Reason:</strong> ${log.override_reason} ${log.override_reason_custom ? `(${log.override_reason_custom})` : ''}</p>
                                        ${log.branch_name ? `<p><strong>Branch:</strong> ${log.branch_name}</p>` : ''}
                                        ${log.admin_notes ? `<p><strong>Notes:</strong> ${log.admin_notes}</p>` : ''}
                                        ${log.device_ip ? `<p class="text-muted"><small>IP: ${log.device_ip}</small></p>` : ''}
                                    </div>
                                </div>
                            `).join('') : '<p class="text-muted">No audit log entries</p>'}
                        </div>
                    </div>
                    
                    <!-- TAB 4: ADMIN ACTIONS -->
                    <div class="tab-content" data-tab="actions">
                        <div class="admin-actions-section">
                            <h4>⚙️ Available Actions</h4>
                            <div class="action-buttons-large">
                                <button class="btn btn-lg btn-danger" onclick="showManualUseModal(${codeId})">
                                    <i class="fas fa-tools"></i> Force Redeem
                                </button>
                                <button class="btn btn-lg btn-warning" onclick="showOverrideStatusModal(${codeId})">
                                    <i class="fas fa-sync"></i> Change Status
                                </button>
                                <button class="btn btn-lg btn-info" onclick="exportAuditLogForCode(${codeId})">
                                    <i class="fas fa-download"></i> Export Audit Log
                                </button>
                            </div>
                        </div>
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
        showToast('Failed to load code details', 'error');
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
        
        showToast('✅ Audit log exported successfully', 'success');
    } catch (error) {
        console.error('Error exporting audit log:', error);
        showToast('Failed to export audit log', 'error');
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
    showToast('Verify function - to be implemented', 'info');
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
