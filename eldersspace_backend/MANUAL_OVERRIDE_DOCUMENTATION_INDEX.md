# 🎉 Manual Code Override / Force Redeem System - Documentation Index

**Status:** ✅ COMPLETE & PRODUCTION READY  
**Created:** May 13, 2026  
**Version:** 1.0

---

## 📚 DOCUMENTATION ROADMAP

### For Quick Setup (5-10 minutes)
Start here if you want to get running quickly:

1. **[MANUAL_OVERRIDE_QUICK_START.md](MANUAL_OVERRIDE_QUICK_START.md)** ⭐ START HERE
   - 5-step setup process
   - ~10 minutes to deploy
   - Visual examples
   - Quick reference
   - Testing checklist

### For Complete Implementation
Detailed technical guide for integration:

2. **[MANUAL_OVERRIDE_SYSTEM_INTEGRATION_GUIDE.md](MANUAL_OVERRIDE_SYSTEM_INTEGRATION_GUIDE.md)** 📖 COMPLETE GUIDE
   - 400+ lines of detailed documentation
   - Database setup instructions
   - Backend API endpoints
   - Frontend integration steps
   - Security & permissions
   - Troubleshooting guide
   - API examples with cURL

### For Architecture Understanding
Deep dive into system design:

3. **[MANUAL_OVERRIDE_ARCHITECTURE_REFERENCE.md](MANUAL_OVERRIDE_ARCHITECTURE_REFERENCE.md)** 🏗️ ARCHITECTURE
   - System component diagram
   - Data flow diagrams
   - Security flow
   - Audit log schema
   - Request/response examples
   - UI hierarchy

### For Project Overview
High-level overview of what was built:

4. **[MANUAL_OVERRIDE_IMPLEMENTATION_SUMMARY.md](MANUAL_OVERRIDE_IMPLEMENTATION_SUMMARY.md)** 📊 OVERVIEW
   - What was built
   - All files created
   - Database schema overview
   - API endpoints list
   - Key capabilities
   - Use cases
   - Deployment checklist

---

## 📁 BACKEND FILES

### Database Setup
```
sql/add_manual_override_system.sql
├─ 10 SQL statements
├─ 6 new tables created
├─ Stored procedure
├─ Reference data
└─ Indexes for performance
Size: 300+ lines
```

### Database Migration Script
```
scripts/add_manual_override_system.js
├─ Runs SQL migration
├─ Verifies table creation
├─ Displays progress
└─ Checks all tables exist
Size: 100+ lines
How to run: node scripts/add_manual_override_system.js
```

### Backend Controller
```
controllers/manualOverrideController.js
├─ getPromoCodeDetail()      - Get code with history
├─ forceRedeemCode()         - Force mark as redeemed
├─ resetCodeStatus()         - Change code status
├─ getAuditLog()            - Query audit log
├─ exportAuditLog()         - Export CSV/JSON
└─ getOverrideStats()       - Get statistics
Size: 400+ lines
```

### Backend Routes
```
routes/manualOverride.js
├─ GET  /promo-codes/:id/detail
├─ GET  /override/audit-log
├─ GET  /override/audit-log/export
├─ GET  /override/statistics
├─ POST /override/force-redeem
└─ POST /override/reset-status
Size: 100+ lines
```

### Server Configuration
```
server.js (MODIFIED)
├─ Added: const manualOverrideRoute = require('./routes/manualOverride')
└─ Added: app.use('/api/admin', manualOverrideRoute)
Change: 2 lines added
```

---

## 💻 FRONTEND FILES

### UI Functions
```
manual_override_functions.js
├─ renderPromoCodeTableWithActions()    - Render table with buttons
├─ showManualUseModal()                - Open force redeem modal
├─ showOverrideStatusModal()           - Open status change modal
├─ showCodeDetailDrawer()              - Open detail drawer
├─ confirmForceRedeem()                - Submit force redeem
├─ confirmStatusChange()               - Submit status change
├─ switchTab()                         - Drawer tab navigation
├─ exportAuditLogForCode()             - Export audit log
└─ + 10+ utility functions
Size: 500+ lines
Location: Root of eldersspace_backend/
```

### Styling
```
manual_override_styles.css
├─ Action button styles
├─ Modal & drawer styles
├─ Form element styles
├─ Status badge styles
├─ Timeline visualization
├─ Audit log display
├─ Responsive design
└─ Light/dark mode support
Size: 600+ lines
Location: Root of eldersspace_backend/
```

### HTML Integration (index.html)
```
Add to <head> section:
<link rel="stylesheet" href="manual_override_styles.css">
<script src="manual_override_functions.js"></script>
```

### JavaScript Integration (script.js)
```
Update loadCampaignCodes():
  Replace: tableBody.innerHTML = ...
  With: renderPromoCodeTableWithActions(codes);

Update initPromoVerifier():
  Add at end: enableManualOverrideFeatures();
```

---

## 📊 DATABASE SCHEMA

### New Tables (6)

#### 1. manual_override_audit_log
```
Stores all manual override actions
├─ Primary key: audit_log_id
├─ 20+ columns for complete tracking
├─ Links to: promo_codes, users
└─ 7 indexes for fast queries
INSERT-only: Cannot be deleted or modified
```

#### 2. promo_code_timeline
```
Visual timeline of all code events
├─ Primary key: timeline_id
├─ Event types: created, used, failed, manual_override, etc.
└─ Links to: promo_codes, audit_log
```

#### 3. admin_override_privileges
```
Admin permission management (ready for role-based access)
├─ Can grant specific permissions
├─ Set daily limits
└─ Requires approval flags
```

#### 4. override_approval_queue
```
High-risk action approval workflow (ready for implementation)
├─ Pending approvals
├─ 24-hour expiry
└─ Approval tracking
```

#### 5. promo_code_status_reference
```
Reference table for status values
├─ ready, reserved, redeemed, expired, cancelled, refunded, manual_redeemed
├─ Color codes
└─ Terminal status flags
```

#### 6. override_reason_reference
```
Reference table for override reasons
├─ qr_failed, app_issue, scan_failed, system_down, branch_redeem, manual_compensation, other
├─ Thai translations
└─ Severity levels
```

### Modified Tables (1)

#### promo_codes (7 new columns added)
```
├─ override_flag              VARCHAR(50)    - manual_redeemed, cancelled, etc.
├─ override_reason            VARCHAR(255)   - Reference to reason
├─ override_by_admin_id       BIGINT         - Admin who performed override
├─ override_at                TIMESTAMP      - When override happened
├─ last_updated_by            BIGINT         - Last admin who touched record
├─ last_updated_at            TIMESTAMP      - Last update time
└─ (automatic indexes created for all new columns)
```

### Stored Procedure (1)

#### sp_log_manual_override()
```
Automatically logs manual actions
├─ Parameters: 17 input parameters
├─ Actions:
│  ├─ Inserts into manual_override_audit_log
│  └─ Inserts into promo_code_timeline
└─ Output: audit_log_id of created entry
```

---

## 🔌 API ENDPOINTS

### GET Endpoints

#### 1. Get Code Details with History
```
GET /api/admin/promo-codes/:promo_code_id/detail

Response:
{
  "success": true,
  "data": {
    "code": { ...full code details },
    "timeline": [ ...all events ],
    "auditLog": [ ...manual overrides ],
    "statusHistory": [ ...status changes ]
  }
}
```

#### 2. Query Audit Log
```
GET /api/admin/override/audit-log

Query params:
  admin_id      - Filter by admin
  action        - Filter by action type
  override_reason - Filter by reason
  search_code   - Search by code
  date_from     - From date (YYYY-MM-DD)
  date_to       - To date (YYYY-MM-DD)
  limit         - Results per page (default: 100)
  offset        - Pagination offset (default: 0)

Response:
{
  "success": true,
  "data": [ ...audit entries ],
  "total": 450,
  "limit": 100,
  "offset": 0
}
```

#### 3. Export Audit Log
```
GET /api/admin/override/audit-log/export

Query params:
  format   - "json" or "csv" (default: json)
  date_from - From date
  date_to   - To date
  admin_id  - Filter by admin

Returns: File download
```

#### 4. Get Statistics
```
GET /api/admin/override/statistics

Response:
{
  "success": true,
  "data": {
    "total_overrides": 42,
    "today_overrides": 5,
    "by_action": [ ...action counts ],
    "by_reason": [ ...reason counts ],
    "top_admins": [ ...admin rankings ]
  }
}
```

### POST Endpoints

#### 1. Force Redeem Code
```
POST /api/admin/override/force-redeem

Body:
{
  "promo_code_id": 123,
  "override_reason": "qr_failed",
  "override_reason_custom": "Optional custom reason",
  "admin_notes": "Optional notes",
  "branch_id": 1,
  "branch_name": "Branch Name",
  "staff_id": 45,
  "staff_name": "Staff Name",
  "device_ip": "192.168.1.100",
  "user_agent": "Mozilla/..."
}

Response:
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

#### 2. Reset Code Status
```
POST /api/admin/override/reset-status

Body:
{
  "promo_code_id": 123,
  "new_status": "ready",  // or cancelled, refunded, reserved
  "override_reason": "manual_compensation",
  "override_reason_custom": "Optional",
  "admin_notes": "Optional",
  "branch_id": 1,
  "branch_name": "Branch Name",
  "device_ip": "192.168.1.100",
  "user_agent": "Mozilla/..."
}

Response: Same as force-redeem
```

---

## 🎯 KEY FEATURES

### For Admins
✅ **Force Redeem**
- Manually mark code as redeemed
- Select from 7 predefined reasons
- Add custom reason
- Includes branch/staff context
- Add notes for tracking

✅ **Status Management**
- Change to: ready, reserved, cancelled, refunded
- Each change logged
- Audit trail maintained
- Reason required

✅ **History Viewing**
- See all events in timeline
- View all admin actions
- Export for analysis
- Complete accountability

### For Operations
✅ **Audit Logging**
- Immutable audit trail
- IP & device tracking
- Admin accountability
- Timestamp accuracy

✅ **Analytics**
- Override statistics
- Reason distribution
- Admin rankings
- Trend analysis

✅ **Compliance**
- Export audit logs
- CSV & JSON formats
- Filtered exports
- Full traceability

---

## 🚀 QUICK DEPLOYMENT

### Step 1: Database (2 minutes)
```bash
cd eldersspace_backend
node scripts/add_manual_override_system.js
```

### Step 2: Backend (Already configured ✅)
Restart server - routes already registered

### Step 3: Frontend (3 minutes)
- Add CSS link to index.html
- Add JS link to index.html
- Update script.js (2 function calls)

### Total Time: ~5-10 minutes

---

## ✅ VERIFICATION

After setup, verify:
- [ ] All tables created
- [ ] Action buttons visible
- [ ] Modals open correctly
- [ ] Audit log created
- [ ] Status changes reflected
- [ ] Export works
- [ ] Statistics display

---

## 🔗 QUICK LINKS

**Setup & Configuration**
- [Quick Start Guide](MANUAL_OVERRIDE_QUICK_START.md)
- [Integration Guide](MANUAL_OVERRIDE_SYSTEM_INTEGRATION_GUIDE.md)

**Reference & Architecture**
- [Architecture Reference](MANUAL_OVERRIDE_ARCHITECTURE_REFERENCE.md)
- [Implementation Summary](MANUAL_OVERRIDE_IMPLEMENTATION_SUMMARY.md)

**Backend Files**
- Database: `sql/add_manual_override_system.sql`
- Migration: `scripts/add_manual_override_system.js`
- Controller: `controllers/manualOverrideController.js`
- Routes: `routes/manualOverride.js`

**Frontend Files**
- Functions: `manual_override_functions.js`
- Styles: `manual_override_styles.css`

---

## 🎊 YOU'RE READY!

Everything is built and documented.

**Next steps:**
1. Read [Quick Start Guide](MANUAL_OVERRIDE_QUICK_START.md)
2. Run database migration
3. Update frontend (3 simple changes)
4. Restart backend
5. Start using!

**Questions?**
- Check [Integration Guide](MANUAL_OVERRIDE_SYSTEM_INTEGRATION_GUIDE.md) troubleshooting
- Review [Architecture Reference](MANUAL_OVERRIDE_ARCHITECTURE_REFERENCE.md) for details
- Check code comments in backend/frontend files

**Enjoy!** 🎉
