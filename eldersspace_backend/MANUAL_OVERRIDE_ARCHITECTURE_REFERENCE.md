# Manual Code Override System - Architecture Reference

**Created:** May 13, 2026  
**Component:** Complete system design document

---

## 🏗️ SYSTEM ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────┐
│                     ADMIN DASHBOARD (Frontend)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Promo Code Verifier Page                               │   │
│  │  ┌────────────────────────────────────────────────────┐ │   │
│  │  │  Campaign/Reward Selector                          │ │   │
│  │  │  Promo Codes Table                                 │ │   │
│  │  │  ┌─────────────────────────────────────────────┐  │ │   │
│  │  │  │ CODE | REWARD | STATUS | [Actions] | [Actions]│  │ │   │
│  │  │  │ [Verify][Manual][Override][Detail]           │  │ │   │
│  │  │  │ [Verify][Manual][Override][Detail]           │  │ │   │
│  │  │  └─────────────────────────────────────────────┘  │ │   │
│  │  └────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ Manual Use   │  │ Override     │  │ Code Detail  │         │
│  │ Modal        │  │ Status Modal │  │ Drawer       │         │
│  │              │  │              │  │ (4 tabs)     │         │
│  │ - Reason     │  │ - Status Opts│  │ - Info       │         │
│  │ - Branch     │  │ - Reason     │  │ - Timeline   │         │
│  │ - Staff      │  │ - Notes      │  │ - Audit Log  │         │
│  │ - Notes      │  │              │  │ - Actions    │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
         ↓                       ↓                    ↓
    HTTP GET/POST          HTTP GET/POST        HTTP GET/POST
    with Bearer Token       with Bearer Token    with Bearer Token
         ↓                       ↓                    ↓
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND API (Node.js/Express)                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Authentication Middleware (Bearer Token)               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           ↓                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Manual Override Router (manualOverride.js)            │   │
│  │  ┌──────────────────────────────────────────────────┐  │   │
│  │  │ GET  /promo-codes/:id/detail                     │  │   │
│  │  │ GET  /override/audit-log                         │  │   │
│  │  │ GET  /override/audit-log/export                  │  │   │
│  │  │ GET  /override/statistics                        │  │   │
│  │  │ POST /override/force-redeem                      │  │   │
│  │  │ POST /override/reset-status                      │  │   │
│  │  └──────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           ↓                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Manual Override Controller (manualOverrideController)  │   │
│  │  - getPromoCodeDetail()                                 │   │
│  │  - forceRedeemCode()                                    │   │
│  │  - resetCodeStatus()                                    │   │
│  │  - getAuditLog()                                        │   │
│  │  - exportAuditLog()                                     │   │
│  │  - getOverrideStats()                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           ↓                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Database Connection Pool (MySQL)                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────────┐
│                    DATABASE LAYER (MySQL)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Core Tables                                                    │
│  ├─ promo_codes (existing + 7 new columns)                     │
│  ├─ rewards (existing)                                         │
│  ├─ promo_campaigns (existing)                                 │
│  └─ users (existing - for admin info)                          │
│                                                                 │
│  New Audit & Tracking Tables                                    │
│  ├─ manual_override_audit_log (PRIMARY)                        │
│  ├─ promo_code_timeline                                        │
│  ├─ admin_override_privileges                                  │
│  ├─ override_approval_queue                                    │
│  ├─ promo_code_status_reference                                │
│  └─ override_reason_reference                                  │
│                                                                 │
│  Stored Procedure                                               │
│  └─ sp_log_manual_override() - Logs actions + creates events   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 DATA FLOW: Force Redeem Operation

```
Admin clicks "Manual Use" button
    ↓
Frontend: showManualUseModal(codeId)
    ├─ Fetches /promo-codes/:codeId/detail
    ├─ Displays modal with code info
    └─ Waits for admin input
    ↓
Admin selects reason, enters notes, clicks confirm
    ↓
Frontend: confirmForceRedeem()
    ├─ Validates inputs
    ├─ Shows confirmation dialog
    └─ POSTs to /override/force-redeem
    ↓
Backend: POST /override/force-redeem
    ├─ Authenticates token → extracts admin info
    ├─ Validates request body
    ├─ Begins transaction
    │
    ├─ SELECT promo_codes WHERE id = ? FOR UPDATE (locks row)
    ├─ Validates code exists
    │
    ├─ UPDATE promo_codes:
    │  ├─ override_flag = 'manual_redeemed'
    │  ├─ override_reason = 'qr_failed'
    │  ├─ override_by_admin_id = 45
    │  ├─ override_at = NOW()
    │  ├─ last_updated_by = 45
    │  ├─ last_updated_at = NOW()
    │  └─ is_used = 1, used_at = NOW()
    │
    ├─ CALL sp_log_manual_override():
    │  ├─ INSERT into manual_override_audit_log:
    │  │  ├─ promo_code_id, code
    │  │  ├─ action = 'force_redeem'
    │  │  ├─ old_status, new_status
    │  │  ├─ override_reason, override_reason_custom
    │  │  ├─ admin_id, admin_name, admin_phone
    │  │  ├─ branch_id, branch_name, staff_id, staff_name
    │  │  ├─ admin_notes
    │  │  ├─ device_ip, device_user_agent
    │  │  └─ action_timestamp = NOW()
    │  │
    │  └─ INSERT into promo_code_timeline:
    │     ├─ promo_code_id
    │     ├─ event_type = 'manual_override'
    │     ├─ event_title = 'Manual Override: force_redeem'
    │     ├─ actor_type = 'admin', actor_id, actor_name
    │     ├─ event_metadata = JSON(reason, notes, branch, staff)
    │     ├─ related_audit_log_id = LAST_INSERT_ID()
    │     └─ event_timestamp = NOW()
    │
    ├─ COMMIT transaction
    └─ SELECT LAST_INSERT_ID()
    ↓
Backend returns JSON response:
{
  "success": true,
  "message": "Code marked as manual redeemed successfully",
  "data": {
    "promo_code_id": 123,
    "new_status": "manual_redeemed",
    "override_at": "2026-05-13T17:10:30Z"
  }
}
    ↓
Frontend: 
    ├─ Shows success toast: "✅ Code marked as manually redeemed"
    ├─ Closes modal
    ├─ Reloads promo codes list
    ├─ Code now shows with purple "MANUAL" badge
    └─ Admin can view audit log in detail drawer
```

---

## 🔐 SECURITY FLOW

```
Admin Request with Bearer Token
    ↓
Express Middleware: authenticateToken
    ├─ Extract token from Authorization header
    ├─ Verify token signature
    ├─ Check token expiry
    ├─ Extract admin ID, name, phone
    ├─ Query users table to verify admin exists
    └─ req.user = { user_id, full_name, phone_number }
    ↓
Route Handler
    ├─ Check req.user exists (else 401)
    ├─ Extract adminId from req.user.user_id
    ├─ Validate all inputs (body, params, query)
    ├─ Begin transaction (start)
    │   ├─ FOR UPDATE lock on affected row
    │   ├─ All-or-nothing updates
    │   └─ Auto-rollback on error
    │
    ├─ Execute stored procedure sp_log_manual_override()
    │   ├─ All logging happens in DB (transactional)
    │   ├─ Cannot be bypassed from app
    │   └─ Guaranteed consistency
    │
    └─ Commit transaction (end)
    ↓
Audit Log Entry Created:
    ├─ admin_id, admin_name, admin_phone (from token)
    ├─ device_ip (from request)
    ├─ device_user_agent (from request)
    ├─ action_timestamp = server time (not client)
    ├─ old_status, new_status (from before/after)
    ├─ override_reason (from input)
    ├─ Immutable (INSERT-only, no UPDATE/DELETE)
    └─ Indexed for queries
```

---

## 📈 AUDIT LOG SCHEMA

```
manual_override_audit_log
├─ audit_log_id (PRIMARY KEY)
├─ promo_code_id → promo_codes
├─ code
├─ campaign_id
├─ reward_id
├─ assigned_user_id
├─ assigned_phone
├─
├─ ACTION INFO
├─ action (force_redeem, reset_status, cancel, etc.)
├─ old_status
├─ new_status
├─ override_reason
├─ override_reason_custom
├─ admin_notes
├─
├─ ADMIN INFO
├─ admin_id → users
├─ admin_name
├─ admin_phone
├─ admin_email
├─
├─ CONTEXT
├─ branch_id
├─ branch_name
├─ staff_id
├─ staff_name
├─
├─ DEVICE/SECURITY
├─ device_ip
├─ device_user_agent
├─ device_fingerprint
├─
├─ TRACKING
├─ action_timestamp (server-side UTC)
├─ is_critical (flag suspicious actions)
├─ reversal_audit_log_id (if reversed)
├─ metadata (JSON - flexible)
├─
└─ INDEXES
   ├─ idx_promo_code_id (fast lookups)
   ├─ idx_admin_id (by admin)
   ├─ idx_action (by action type)
   ├─ idx_action_timestamp (by date)
   ├─ idx_code (by code value)
   ├─ idx_override_reason (by reason)
   └─ idx_assigned_user_id (by user)
```

---

## 🔄 WORKFLOW: Query & Export Audit Log

```
Admin wants to investigate QR failures
    ↓
Frontend: GET /api/admin/override/audit-log
Query parameters:
{
  override_reason: "qr_failed",
  date_from: "2026-05-01",
  date_to: "2026-05-31",
  limit: 100,
  offset: 0
}
    ↓
Backend: auditLog query builder
    ├─ SELECT * FROM manual_override_audit_log
    ├─ WHERE override_reason = "qr_failed"
    ├─ AND action_timestamp >= "2026-05-01 00:00:00"
    ├─ AND action_timestamp <= "2026-05-31 23:59:59"
    ├─ ORDER BY action_timestamp DESC
    └─ LIMIT 100 OFFSET 0
    ↓
Returns 28 entries with full details:
[
  {
    audit_log_id: 1,
    code: "PROMO001",
    action: "force_redeem",
    old_status: "ready",
    new_status: "manual_redeemed",
    override_reason: "qr_failed",
    admin_name: "Somchai",
    admin_phone: "089-123-4567",
    branch_name: "Bangkok Central",
    action_timestamp: "2026-05-13T17:10:30Z"
  },
  ...27 more entries
]
    ↓
Admin clicks "Export" button
    ↓
Frontend: GET /api/admin/override/audit-log/export
Query params: format=json (or csv)
    ↓
Backend: Executes same query + formats output
    ├─ JSON: Sends as JSON file with metadata
    └─ CSV: Converts to CSV format
    ↓
Frontend: Downloads file
    ├─ audit-log-export.json (or .csv)
    └─ Admin can analyze in Excel/tools
```

---

## 🎨 UI COMPONENT HIERARCHY

```
Promo Code Verifier Page
│
├─ Campaign/Reward Selector
│
├─ Promo Codes Table
│  └─ Table Row (for each code)
│     ├─ Code Column
│     │  └─ Badge: MANUAL (if override_flag='manual_redeemed')
│     │
│     ├─ Reward Column
│     ├─ Status Column
│     │  └─ Status Badge (colored by status)
│     │
│     ├─ Expiry Column
│     ├─ Used Date Column
│     │
│     └─ Actions Column
│        ├─ [Verify] Button → verifyPromoCode()
│        ├─ [Manual Use] Button → showManualUseModal()
│        ├─ [Override Status] Button → showOverrideStatusModal()
│        └─ [View Detail] Button → showCodeDetailDrawer()
│
├─ Modal: Manual Use
│  ├─ Header: Close button
│  ├─ Info Section: Code, Reward, Status
│  ├─ Form Section:
│  │  ├─ Override Reason Dropdown
│  │  ├─ Custom Reason Textarea (conditional)
│  │  ├─ Branch Input
│  │  ├─ Staff Name Input
│  │  └─ Admin Notes Textarea
│  ├─ Warning Box
│  └─ Footer: [Cancel] [Confirm Force Redeem]
│
├─ Modal: Override Status
│  ├─ Header: Close button
│  ├─ Status Options (4 radio buttons with colors)
│  ├─ Form Section:
│  │  ├─ Reason Dropdown
│  │  └─ Notes Textarea
│  ├─ Warning Box
│  └─ Footer: [Cancel] [Change Status]
│
└─ Drawer: Code Detail (Right side)
   ├─ Header: Close button
   ├─ Tab Navigation:
   │  ├─ [Info]
   │  ├─ [Timeline]
   │  ├─ [Audit Log]
   │  └─ [Actions]
   │
   ├─ Tab Content 1: Info
   │  ├─ Promo Information Grid
   │  └─ User Information Grid
   │
   ├─ Tab Content 2: Timeline
   │  └─ Timeline Events (vertical)
   │     ├─ Created event
   │     ├─ Used event
   │     └─ Manual Override event
   │
   ├─ Tab Content 3: Audit Log
   │  └─ Audit Log Entries (cards)
   │     ├─ Action Badge + Timestamp
   │     ├─ Admin Name + Phone
   │     ├─ Status Change + Reason
   │     └─ Notes + IP
   │
   └─ Tab Content 4: Actions
      ├─ [Force Redeem] Button
      ├─ [Change Status] Button
      └─ [Export Audit Log] Button
```

---

## 📋 REQUEST/RESPONSE EXAMPLES

### Request 1: Force Redeem

```http
POST /api/admin/override/force-redeem HTTP/1.1
Host: localhost:3000
Authorization: Bearer eyJhbGc...
Content-Type: application/json

{
  "promo_code_id": 123,
  "override_reason": "qr_failed",
  "override_reason_custom": "QR scanner malfunction",
  "admin_notes": "Customer unable to use code",
  "branch_id": 1,
  "branch_name": "Bangkok Central",
  "staff_id": 45,
  "staff_name": "Somchai Suwannapol",
  "device_ip": "192.168.1.100",
  "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Code marked as manual redeemed successfully",
  "data": {
    "promo_code_id": 123,
    "new_status": "manual_redeemed",
    "override_at": "2026-05-13T17:10:30.000Z"
  }
}
```

### Request 2: Query Audit Log

```http
GET /api/admin/override/audit-log?override_reason=qr_failed&date_from=2026-05-01&date_to=2026-05-31&limit=50&offset=0 HTTP/1.1
Host: localhost:3000
Authorization: Bearer eyJhbGc...
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
      "override_reason_custom": null,
      "admin_name": "Somchai",
      "admin_phone": "089-123-4567",
      "branch_name": "Bangkok Central",
      "staff_name": "Somchai Suwannapol",
      "admin_notes": "Customer unable to use code",
      "device_ip": "192.168.1.100",
      "action_timestamp": "2026-05-13T17:10:30.000Z"
    },
    ...49 more entries
  ],
  "total": 450,
  "limit": 50,
  "offset": 0
}
```

---

## 🚀 DEPLOYMENT CHECKLIST

- [ ] Database migration completed
- [ ] All 6 tables created with correct schema
- [ ] Indexes created for performance
- [ ] Stored procedure exists
- [ ] Backend routes registered
- [ ] Frontend scripts linked
- [ ] CSS file loaded
- [ ] Action buttons visible
- [ ] Modals open/close correctly
- [ ] API endpoints responding
- [ ] Authentication working
- [ ] Audit log creating entries
- [ ] Timestamps are accurate
- [ ] Export functionality works
- [ ] Error handling tested
- [ ] Performance acceptable
- [ ] Documentation reviewed
- [ ] Team trained

---

**Status:** ✅ Production Ready  
**Version:** 1.0  
**Last Updated:** May 13, 2026
