# Manual Code Override / Force Redeem System - Integration Guide

Created: May 13, 2026
Comprehensive guide for integrating the manual code override system into EldersSpace Admin Dashboard

---

## 📋 OVERVIEW

The Manual Code Override system enables admins to:
- ✅ Force redeem promo codes manually
- ✅ Reset code status (ready, cancelled, refunded, etc.)
- ✅ Track all manual actions with complete audit logs
- ✅ View detailed timelines of all code events
- ✅ Export audit logs for compliance
- ✅ Monitor override statistics

---

## 🗄️ DATABASE SETUP

### Step 1: Run Migration Script

```bash
cd eldersspace_backend
node scripts/add_manual_override_system.js
```

This will:
- Create `manual_override_audit_log` table
- Create `promo_code_timeline` table
- Create `admin_override_privileges` table
- Create `override_approval_queue` table
- Add reference tables for statuses and reasons
- Add columns to `promo_codes` table
- Create stored procedure `sp_log_manual_override`

### Step 2: Verify Tables

Run this SQL to verify all tables were created:

```sql
SHOW TABLES LIKE 'manual_override%';
SHOW TABLES LIKE 'promo_code%';
SHOW TABLES LIKE 'admin_override%';
SHOW TABLES LIKE 'override_approval%';
```

Expected output: 6 new tables + updated `promo_codes` table

---

## 🔧 BACKEND INTEGRATION

### Step 1: Already Done in server.js

The manual override routes are already registered in `server.js`:

```javascript
const manualOverrideRoute = require('./routes/manualOverride');
app.use('/api/admin', manualOverrideRoute);
```

### Step 2: Available Backend Endpoints

#### GET Endpoints

```
GET /api/admin/promo-codes/:promo_code_id/detail
├─ Get full code details with timeline and audit log
├─ Headers: Authorization Bearer Token
└─ Returns: { code, timeline, auditLog, statusHistory }

GET /api/admin/override/audit-log
├─ Query audit log with filters
├─ Query params: admin_id, action, override_reason, search_code, date_from, date_to, limit, offset
├─ Headers: Authorization Bearer Token
└─ Returns: { data: [...], total, limit, offset }

GET /api/admin/override/audit-log/export
├─ Export audit log as CSV or JSON
├─ Query params: format (csv|json), date_from, date_to, admin_id
├─ Headers: Authorization Bearer Token
└─ Returns: File download or JSON

GET /api/admin/override/statistics
├─ Get override statistics
├─ Headers: Authorization Bearer Token
└─ Returns: { total_overrides, today_overrides, by_action, by_reason, top_admins }
```

#### POST Endpoints (Action Routes)

```
POST /api/admin/override/force-redeem
├─ Force mark code as manually redeemed
├─ Body: {
│   promo_code_id: number,
│   override_reason: string (code),
│   override_reason_custom: string (optional),
│   admin_notes: string (optional),
│   branch_id: number (optional),
│   branch_name: string (optional),
│   staff_id: number (optional),
│   staff_name: string (optional),
│   device_ip: string,
│   user_agent: string
│ }
├─ Headers: Authorization Bearer Token
└─ Returns: { success, message, data }

POST /api/admin/override/reset-status
├─ Reset code status to ready, cancelled, refunded, or reserved
├─ Body: {
│   promo_code_id: number,
│   new_status: string (ready|cancelled|refunded|reserved),
│   override_reason: string (code),
│   override_reason_custom: string (optional),
│   admin_notes: string (optional),
│   branch_id: number (optional),
│   branch_name: string (optional),
│   device_ip: string,
│   user_agent: string
│ }
├─ Headers: Authorization Bearer Token
└─ Returns: { success, message, data }
```

---

## 💻 FRONTEND INTEGRATION

### Step 1: Add Script References to index.html

Add these script tags in `<head>` section AFTER existing scripts:

```html
<!-- Manual Override System -->
<link rel="stylesheet" href="manual_override_styles.css">
<script src="manual_override_functions.js"></script>
```

### Step 2: Update Promo Code Verifier Page

In `script.js`, update the `loadCampaignCodes()` function to use the new rendering:

**OLD CODE (find this section):**
```javascript
const tableBody = document.querySelector('table tbody');
if (!tableBody) return;

tableBody.innerHTML = codes.map((code, idx) => `
    <tr class="promo-code-row" data-code-id="${code.promo_code_id}">
        <td class="cell-code">${code.code}</td>
        <td class="cell-reward">${code.reward_name || '-'}</td>
        <td class="cell-status">${code.is_used === 1 ? 'Used' : (code.expiry_date && new Date(code.expiry_date) < new Date() ? 'Expired' : 'Available')}</td>
        ...
```

**REPLACE WITH:**
```javascript
// Use new rendering function that includes action buttons
renderPromoCodeTableWithActions(codes);
```

### Step 3: Call Initialization Function

In `initPromoVerifier()` function (in script.js), add this at the end:

```javascript
async function initPromoVerifier() {
    // ... existing code ...
    
    // Enable manual override features
    enableManualOverrideFeatures();
}
```

### Step 4: Integration with Existing Table

The new system integrates with the existing promo codes table and adds:

**New Column:** Action Buttons (Verify, Manual Use, Override Status, View Detail)
- Position: Rightmost column
- Uses existing table structure
- Fully responsive

---

## 📊 AUDIT LOG TRACKING

### What Gets Logged

Every manual action creates an entry in `manual_override_audit_log`:

**Fields Logged:**
- Admin ID, Name, Phone
- Promo Code ID and Code Value
- Action Type (force_redeem, reset_status, cancel, etc.)
- Old Status → New Status
- Override Reason (from dropdown)
- Custom Reason (if "other" selected)
- Branch Name and Staff Name
- Admin Notes
- Device IP Address
- User Agent
- Timestamp (action_timestamp)
- Metadata (JSON - flexible for future additions)

### Timeline Events

When an admin action occurs, an event is created in `promo_code_timeline`:

```
Event Types: created, used, failed, manual_override, expired, cancelled, reassigned, extended, refunded

Timeline shows:
- Event Title
- Description
- Actor (admin name)
- Timestamp
- Status
- Metadata
```

### Querying Audit Log

**Get all overrides by admin:**
```javascript
GET /api/admin/override/audit-log?admin_id=123
```

**Get all QR failures that were overridden:**
```javascript
GET /api/admin/override/audit-log?override_reason=qr_failed
```

**Get today's overrides:**
```javascript
GET /api/admin/override/audit-log?date_from=2026-05-13&date_to=2026-05-13
```

**Export audit log:**
```javascript
GET /api/admin/override/audit-log/export?format=json&date_from=2026-05-01&date_to=2026-05-31
```

---

## 🔐 SECURITY & PERMISSIONS

### Authentication

All override endpoints require:
```javascript
Authorization: Bearer <admin_token>
```

Token validation is handled by `authenticateToken` middleware in routes.

### Admin Roles

System validates admin exists in `users` table. Future enhancement: Add permission levels in `admin_override_privileges` table.

### Current Permissions

- Any authenticated admin can perform:
  - Force redeem
  - Reset status
  - View audit logs
  - Export audit logs

### Future: Role-Based Access Control

The `admin_override_privileges` table is ready for implementing:
- `can_force_redeem` - Allow/deny force redeem
- `can_reset_status` - Allow/deny status reset
- `can_export_audit_log` - Allow/deny audit log export
- `max_daily_overrides` - Daily limit per admin
- `requires_approval` - High-risk actions need approval

### Security Best Practices

1. **Immutable Audit Log** - All logs are INSERT-only, cannot be deleted
2. **IP Tracking** - Client IP is recorded for each action
3. **User Agent** - Device information is stored
4. **Timestamps** - All actions are timestamped to the second
5. **No Reversal** - Actions cannot be undone (admins must create new override)
6. **Confirmation Dialog** - Admin must confirm high-risk actions
7. **Warning Messages** - Clear warnings before permanent actions

---

## 🎨 UI COMPONENTS

### 1. Action Buttons in Table

Each promo code row has 4 action buttons:

```
[Verify] [Manual Use] [Override Status] [View Detail]
  ↓         ↓            ↓                ↓
  Blue      Orange       Purple          Gray
  
- Verify: Validate QR code (existing functionality)
- Manual Use: Force redeem with detailed form
- Override Status: Change status to ready/cancelled/refunded
- View Detail: Open side drawer with full history
```

### 2. Manual Use Modal

Large modal dialog with sections:

```
┌─────────────────────────────────────────────────┐
│ ⚙️ Manual Use - Force Redeem        [X]         │
├─────────────────────────────────────────────────┤
│                                                 │
│ 📌 Promo Code Information                       │
│ ┌─────────────────────────────────────────────┐ │
│ │ Code: PROMO001          Status: Ready       │ │
│ │ Reward: 50 Points       Points: 50 pts      │ │
│ │ Campaign: May Campaign  Expiry: 31-May-26   │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ 📊 Current Status                               │
│ ┌─────────────────────────────────────────────┐ │
│ │ Status: Ready                               │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ ✋ Admin Override Action                        │
│ ┌─────────────────────────────────────────────┐ │
│ │ Reason for Override: [dropdown ↓]          │ │
│ │   - 🔴 QR ใช้งานไม่ได้                      │ │
│ │   - ⚠️ ลูกค้าแอพมีปัญหา                     │ │
│ │   - 📱 สแกนไม่ผ่าน                          │ │
│ │   - 💥 ระบบล่ม                              │ │
│ │   - 🏪 Redeem หน้าสาขา                     │ │
│ │   - 💰 Manual compensation                  │ │
│ │   - ❓ อื่น ๆ                                │ │
│ │                                             │ │
│ │ Branch: [text input]        Staff: [input]  │ │
│ │                                             │ │
│ │ Admin Notes: [textarea]                     │ │
│ │                                             │ │
│ │ ⚠️ WARNING: This action will be logged and  │ │
│ │    cannot be undone. All details including  │ │
│ │    your IP and device will be recorded.     │ │
│ └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│ [Cancel]              [Confirm Force Redeem]    │
└─────────────────────────────────────────────────┘
```

### 3. Code Detail Drawer

Right-side drawer with tabbed interface:

```
┌──────────────────────────────────────────────────┐
│ 📋 Code Detail & Audit Log           [X]        │
├────────────────────────────────────────────────  │
│ [Info] [Timeline] [Audit Log] [Actions]         │
├──────────────────────────────────────────────────┤
│                                                 │
│ TAB 1: INFO                                     │
│ ┌────────────────────────────────────────────┐  │
│ │ 🎁 Promo Information                       │  │
│ │ Code: PROMO001      Status: Manual Redeemed│ │
│ │ Reward: 50 Points   Points: 50 pts        │ │
│ │ Campaign: May       Created: 27-Apr 20:31 │ │
│ │ Expiry: 31-May-26   Used: 03-May 17:02    │ │
│ │                                            │  │
│ │ 👤 User Information                        │  │
│ │ Name: John Doe      Phone: 089-xxx-xxxx   │ │
│ │ User ID: 12345                             │  │
│ └────────────────────────────────────────────┘  │
│                                                 │
│ TAB 2: TIMELINE                                 │
│ ┌────────────────────────────────────────────┐  │
│ │ ● Created                    27/04 20:31   │  │
│ │ ● User Failed to Redeem      03/05 17:02  │  │
│ │ ● Manual Override by Admin   03/05 17:10  │  │
│ │   QR ใช้งานไม่ได้                           │  │
│ │ ● Marked Manual Redeemed     03/05 17:11  │  │
│ └────────────────────────────────────────────┘  │
│                                                 │
│ TAB 3: AUDIT LOG                                │
│ ┌────────────────────────────────────────────┐  │
│ │ [FORCE_REDEEM] 03-May 17:10                │  │
│ │ Admin: Admin Name (089-xxx-xxxx)           │  │
│ │ Status: Ready → Manual Redeemed            │  │
│ │ Reason: QR ใช้งานไม่ได้                    │  │
│ │ Branch: Branch Name                         │  │
│ │ IP: 192.168.1.1                            │  │
│ └────────────────────────────────────────────┘  │
│                                                 │
│ TAB 4: ACTIONS                                  │
│ ┌────────────────────────────────────────────┐  │
│ │ [Force Redeem] [Change Status] [Export]    │  │
│ └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

---

## 🚀 USAGE WORKFLOW

### Workflow 1: Redeem Code for Customer (QR Failed)

1. Admin sees code in "Ready" status
2. Clicks "Manual Use" button
3. Selects reason: "🔴 QR ใช้งานไม่ได้"
4. Enters branch and staff info
5. Clicks "Confirm Force Redeem"
6. System logs action and marks code as "Manual Redeemed"
7. Admin can view audit log anytime

### Workflow 2: Reset Code After Mistake

1. Admin opens code detail
2. Sees code was incorrectly marked as used
3. Clicks "Change Status"
4. Selects new status: "Ready"
5. Selects reason: "Manual compensation"
6. Confirms change
7. Code returns to "Ready" state (new timeline event created)

### Workflow 3: Investigate Suspicious Activity

1. Admin opens "Audit Log" page
2. Filters by reason: "qr_failed"
3. Sees all QR failures that were overridden
4. Identifies patterns
5. Can export log for further analysis

---

## 📱 API EXAMPLES

### Example 1: Force Redeem a Code

```bash
curl -X POST http://localhost:3000/api/admin/override/force-redeem \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin_token>" \
  -d '{
    "promo_code_id": 123,
    "override_reason": "qr_failed",
    "override_reason_custom": "QR code scanned multiple times but system failed to process",
    "admin_notes": "Customer called support team",
    "branch_id": 1,
    "branch_name": "Bangkok Central",
    "staff_id": 45,
    "staff_name": "Somchai Suwannapol",
    "device_ip": "192.168.1.100",
    "user_agent": "Mozilla/5.0..."
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Code marked as manual redeemed successfully",
  "data": {
    "promo_code_id": 123,
    "new_status": "manual_redeemed",
    "override_at": "2026-05-13T17:10:30Z"
  }
}
```

### Example 2: Get Audit Log

```bash
curl -X GET "http://localhost:3000/api/admin/override/audit-log?admin_id=45&date_from=2026-05-01&date_to=2026-05-31&limit=50" \
  -H "Authorization: Bearer <admin_token>"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "audit_log_id": 1,
      "code": "PROMO001",
      "action": "force_redeem",
      "old_status": "ready",
      "new_status": "manual_redeemed",
      "override_reason": "qr_failed",
      "admin_name": "Somchai",
      "admin_phone": "089-xxx-xxxx",
      "branch_name": "Bangkok Central",
      "admin_notes": "Customer support",
      "action_timestamp": "2026-05-13T17:10:30Z"
    },
    ...
  ],
  "total": 15,
  "limit": 50,
  "offset": 0
}
```

### Example 3: Export Audit Log

```bash
# Export as JSON
curl -X GET "http://localhost:3000/api/admin/override/audit-log/export?format=json&date_from=2026-05-01&date_to=2026-05-31" \
  -H "Authorization: Bearer <admin_token>" \
  -o audit-log-export.json

# Export as CSV
curl -X GET "http://localhost:3000/api/admin/override/audit-log/export?format=csv&date_from=2026-05-01&date_to=2026-05-31" \
  -H "Authorization: Bearer <admin_token>" \
  -o audit-log-export.csv
```

---

## ✅ VERIFICATION CHECKLIST

### Database
- [ ] Tables created successfully
- [ ] Columns added to promo_codes table
- [ ] Reference tables populated with status and reason values
- [ ] Stored procedure sp_log_manual_override exists

### Backend
- [ ] Controllers registered in server.js
- [ ] All endpoints responding correctly
- [ ] Authentication working (Bearer token)
- [ ] Database transactions working (rollback on error)
- [ ] Audit log being created for each action

### Frontend
- [ ] CSS file linked in index.html
- [ ] JavaScript file linked in index.html
- [ ] Action buttons visible in promo codes table
- [ ] Manual Use modal opens correctly
- [ ] Override Status modal opens correctly
- [ ] Detail drawer opens and shows tabs
- [ ] Timeline displays correctly
- [ ] Audit log displays correctly

### Functionality
- [ ] Can force redeem a code
- [ ] Audit log entry created for each action
- [ ] Timeline event created for each action
- [ ] Can reset code status
- [ ] Can view audit log filtered by criteria
- [ ] Can export audit log as JSON/CSV
- [ ] Warning dialogs show before destructive actions
- [ ] Toast notifications appear for success/error

---

## 🔧 TROUBLESHOOTING

### Issue: Tables not created

**Solution:**
```bash
# Check if migration ran
node scripts/add_manual_override_system.js

# Manually verify
SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE 'manual_override%';
```

### Issue: API returns 401 Unauthorized

**Solution:**
- Ensure admin token is valid
- Check token is in Authorization header as `Bearer <token>`
- Verify admin user exists in users table

### Issue: UI buttons not showing

**Solution:**
- Verify manual_override_styles.css is linked in index.html
- Verify manual_override_functions.js is linked in index.html
- Check browser console for JavaScript errors
- Verify loadCampaignCodes() calls renderPromoCodeTableWithActions()

### Issue: Audit log not being created

**Solution:**
- Verify stored procedure sp_log_manual_override exists
- Check database transaction is committing
- Verify admin_id is being passed correctly
- Check application logs for SQL errors

---

## 📚 QUICK REFERENCE

### Status Values
- `ready` - Code is available to use
- `reserved` - Code has been assigned/reserved
- `redeemed` - Code used normally via QR
- `manual_redeemed` - Code used via manual override (PURPLE badge)
- `expired` - Code expiry date passed
- `cancelled` - Code cancelled by admin
- `refunded` - Points refunded to user

### Override Reasons
- `qr_failed` - QR code scanning failed
- `app_issue` - Customer app had issues
- `scan_failed` - Scan didn't work
- `system_down` - System was down
- `branch_redeem` - Redeemed at branch counter
- `manual_compensation` - Manual compensation
- `other` - Other reason (requires custom text)

### Action Types
- `force_redeem` - Force mark code as manually redeemed
- `reset_status` - Change code status
- `cancel_code` - Cancel a code
- `reassign` - Reassign code to different user
- `extend_expiry` - Extend code expiry date
- `refund` - Refund points

---

## 📞 SUPPORT

For issues or questions:
1. Check troubleshooting section above
2. Review API endpoint documentation
3. Check application logs: `eldersspace_backend/logs/`
4. Check browser console for frontend errors
5. Verify database connection

---

## 📝 CHANGELOG

### Version 1.0 (May 13, 2026)
- Initial release
- Force redeem functionality
- Status reset functionality
- Audit log system
- Timeline tracking
- Export functionality
- Web UI components
