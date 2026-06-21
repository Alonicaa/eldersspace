# Manual Code Override System - Quick Start Guide

**Created:** May 13, 2026  
**Time to Setup:** ~10 minutes

---

## 🚀 QUICK START (5 Steps)

### Step 1: Run Database Migration (2 min)

```bash
cd eldersspace_backend
node scripts/add_manual_override_system.js
```

Expected output:
```
🔄 Starting migration: Add Manual Code Override System...
✅ Statement 1 executed successfully
✅ Statement 2 executed successfully
...
🎉 Migration completed!
✅ Successful: 25
❌ Failed: 0
```

### Step 2: Backend Already Configured ✅

The backend is already set up in `server.js`:
```javascript
const manualOverrideRoute = require('./routes/manualOverride');
app.use('/api/admin', manualOverrideRoute);
```

**No further backend changes needed!**

### Step 3: Update Frontend - Add Links to index.html

Find the `<head>` section in `index.html` and add these lines right before `</head>`:

```html
<!-- Manual Override System -->
<link rel="stylesheet" href="manual_override_styles.css">
<script src="manual_override_functions.js"></script>
```

Your head should look like:
```html
<head>
    ...existing tags...
    <link rel="stylesheet" href="styles.css">
    <script src="script.js"></script>
    
    <!-- Manual Override System -->
    <link rel="stylesheet" href="manual_override_styles.css">
    <script src="manual_override_functions.js"></script>
</head>
```

### Step 4: Update Promo Verifier in script.js

Find the function `loadCampaignCodes()` in your `script.js` file.

Look for this section (around line where table is rendered):
```javascript
const tableBody = document.querySelector('table tbody');
tableBody.innerHTML = codes.map((code) => `
    <tr>
        <td>${code.code}</td>
        ...
    </tr>
`).join('');
```

**Replace the table rendering section with:**
```javascript
// Use new rendering function with action buttons
renderPromoCodeTableWithActions(codes);
```

### Step 5: Add Initialization Call

Find `initPromoVerifier()` function and add this at the end:

```javascript
async function initPromoVerifier() {
    // ... existing code ...
    
    // Enable manual override features
    enableManualOverrideFeatures();
}
```

### ✅ Done! Restart Backend

```bash
# From eldersspace_backend directory
npm start
# or
node server.js
```

---

## 🎯 WHAT YOU'LL SEE

### 1. In Promo Code Verifier Page

Each code row now has 4 new action buttons:

```
Code: PROMO001  | Reward: 50 pts | Status: Ready | [Verify] [Manual] [Override] [Detail]
Code: PROMO002  | Reward: 100 pts| Status: Manual| [Verify] [Manual] [Override] [Detail]
```

### 2. Action Button Colors

```
🔵 Verify   - Blue background
🟠 Manual   - Orange background (for force redeem)
🟣 Override - Purple background (for status changes)
⚫ Detail    - Gray background (view history)
```

### 3. Manual Use Flow

**Click "Manual Use" button:**
1. Modal pops up with code info
2. Select reason (dropdown):
   - 🔴 QR ใช้งานไม่ได้
   - ⚠️ ลูกค้าแอพมีปัญหา
   - 📱 สแกนไม่ผ่าน
   - 💥 ระบบล่ม
   - 🏪 Redeem หน้าสาขา
   - 💰 Manual compensation
   - ❓ อื่น ๆ
3. Enter branch and staff info (optional)
4. Add notes (optional)
5. Click "Confirm Force Redeem"
6. ✅ Code marked as manually redeemed
7. 📋 Action logged in audit trail

### 4. View Detail Drawer

**Click "Detail" button:**
- Right-side drawer opens with 4 tabs:
  - **Info** - Code details, user info
  - **Timeline** - All events (created, used, manual override, etc.)
  - **Audit Log** - All admin actions with admin name, reason, IP
  - **Actions** - Quick action buttons

---

## 🔒 AUDIT LOG - What Gets Recorded

Every manual action creates a permanent record:

```
┌────────────────────────────────────────────────────────┐
│ AUDIT LOG ENTRY                                        │
├────────────────────────────────────────────────────────┤
│ Action:           Force Redeem                         │
│ Code:             PROMO001                             │
│ Admin:            Somchai Suwannapol                   │
│ Admin Phone:      089-XXX-XXXX                         │
│ Reason:           QR ใช้งานไม่ได้                      │
│ Branch:           Bangkok Central                       │
│ Staff:            Niran Phusit                         │
│ Notes:            Customer called support             │
│ Status Changed:   Ready → Manual Redeemed             │
│ IP Address:       192.168.1.100                        │
│ Timestamp:        2026-05-13 17:10:30                 │
│ Device:           Mozilla/5.0 (Chrome)                │
└────────────────────────────────────────────────────────┘
```

---

## 🔍 QUERY AUDIT LOG

### View all your actions today:
```javascript
GET /api/admin/override/audit-log?date_from=2026-05-13&date_to=2026-05-13
```

### View all QR failures:
```javascript
GET /api/admin/override/audit-log?override_reason=qr_failed
```

### Export last month's log:
```javascript
GET /api/admin/override/audit-log/export?format=json&date_from=2026-04-13&date_to=2026-05-13
```

---

## ⚙️ STATUS BADGES

### Color Meanings

```
🟢 GREEN (Ready)              = Code is available to use
🔵 BLUE (Redeemed)            = Code was redeemed normally
🟣 PURPLE (Manual Redeemed)  = Code was force redeemed by admin ⚠️
🔴 RED (Expired)              = Code expiry date passed
⚫ GRAY (Cancelled/Refunded)  = Code is cancelled or refunded
```

---

## 📊 STATISTICS PAGE

View override analytics at:
```javascript
GET /api/admin/override/statistics
```

Returns:
```json
{
  "total_overrides": 42,
  "today_overrides": 5,
  "by_action": [
    { "action": "force_redeem", "count": 38 },
    { "action": "reset_status", "count": 4 }
  ],
  "by_reason": [
    { "override_reason": "qr_failed", "count": 28 },
    { "override_reason": "app_issue", "count": 10 }
  ],
  "top_admins": [
    { "admin_name": "Somchai", "count": 15 },
    { "admin_name": "Niran", "count": 12 }
  ]
}
```

---

## 🚨 IMPORTANT REMINDERS

### ⚠️ Cannot Be Undone

Once you mark a code as manually redeemed:
- The action is **permanent**
- It's recorded in **audit log forever**
- You **cannot delete or modify** the audit log entry
- Best practice: Double-check before confirming

### 🔐 Your IP & Device Are Logged

Every action records:
- Your IP address
- Your device/browser info
- Exact timestamp
- Use this for security & compliance

### 📋 Perfect for Compliance

The immutable audit log helps with:
- Compliance audits
- Fraud investigation
- Admin accountability
- Historical tracking

---

## 🎓 USE CASES

### Case 1: Customer QR Code Not Working

**Situation:** Customer says "QR code won't scan"
**Solution:**
1. Go to Promo Code Verifier
2. Search for customer's code
3. Click "Manual Use"
4. Select reason: "🔴 QR ใช้งานไม่ได้"
5. Enter customer info if needed
6. Click confirm
7. Code marked as manually redeemed ✅
8. Audit log entry created 📋

### Case 2: App Crashed During Redemption

**Situation:** Customer's app crashed, code shows as "Ready" but shouldn't be
**Solution:**
1. Open code detail drawer
2. View timeline - see app crash event
3. Click "Change Status"
4. Select new status: "Cancelled"
5. Select reason: "⚠️ ลูกค้าแอพมีปัญหา"
6. Confirm
7. Code cancelled, points refunded 🔄

### Case 3: Investigate Suspicious QR Failures

**Situation:** Many QR failures suddenly - possible system issue
**Solution:**
1. Go to Audit Log
2. Filter: `override_reason=qr_failed`
3. Filter: `date_from=today`, `date_to=today`
4. See all today's QR failures
5. Export to analyze patterns 📊
6. Share with tech team for investigation

---

## ✅ TESTING CHECKLIST

After setup, test these to verify everything works:

- [ ] Backend started without errors
- [ ] Admin can log in to dashboard
- [ ] Promo Code Verifier page loads
- [ ] Can see codes in table
- [ ] Action buttons visible (Verify, Manual, Override, Detail)
- [ ] "Manual Use" button opens modal
- [ ] Modal has dropdown for reasons
- [ ] Can select override reason
- [ ] Can enter branch/staff info
- [ ] Can add notes
- [ ] "Confirm Force Redeem" button works
- [ ] Toast notification shows success
- [ ] Code status changes to "Manual Redeemed" (purple badge)
- [ ] "Detail" button opens drawer
- [ ] Timeline tab shows events
- [ ] Audit Log tab shows manual override entry
- [ ] Admin name is correct in audit log
- [ ] Timestamp is correct
- [ ] Override reason is recorded
- [ ] Cannot see code marked as manually redeemed in "Ready" list
- [ ] Can export audit log as JSON

---

## 🐛 TROUBLESHOOTING

### Q: Action buttons don't appear
**A:** Check that `manual_override_functions.js` is loaded:
- Open browser console (F12)
- Look for error messages
- Make sure script tag is in index.html
- Refresh page and try again

### Q: "Manual Use" modal doesn't open
**A:** 
- Check browser console for errors
- Verify admin token is valid
- Ensure backend is running
- Try refreshing page

### Q: Audit log entry not created
**A:**
- Check backend logs for SQL errors
- Verify database migration ran successfully
- Ensure admin_id is being sent
- Check network requests in browser (F12)

### Q: Modal buttons don't respond
**A:**
- Check console for JavaScript errors
- Verify API endpoints are correct
- Ensure admin token is valid
- Try different code

---

## 📞 GETTING HELP

1. **Check logs:**
   - Backend: `eldersspace_backend/` console output
   - Frontend: Browser console (F12)
   - Database: Check SQL errors

2. **Verify setup:**
   - Database tables exist (see Step 1 output)
   - Scripts linked in index.html
   - Backend running on port 3000

3. **Test API manually:**
   ```bash
   curl -X GET http://localhost:3000/api/admin/override/statistics \
     -H "Authorization: Bearer YOUR_TOKEN_HERE"
   ```

---

## 🎉 YOU'RE DONE!

Your Manual Code Override System is ready to use!

**Next Steps:**
1. Train admin staff on the new features
2. Set up monitoring for override statistics
3. Review audit logs regularly
4. Plan for future enhancements (approval workflows, role-based access)

**Enjoy!** ✨
