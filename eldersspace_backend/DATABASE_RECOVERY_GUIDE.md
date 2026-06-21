# Database Recovery Guide - eldersspace

## 🚨 ปัญหา: Database หายจาก Google Cloud SQL

ตามที่คุณพบเห็น database `eldersspace` ได้หายไปจากบัญชี Cloud SQL ของคุณ ปัญหาอาจเกิดจากสาเหตุดังนี้

### สาเหตุที่เป็นไปได้

1. **Drop โดยไม่ตั้งใจ** - ใครคนใดอาจรัน `DROP DATABASE eldersspace;` ไม่ว่าตั้งใจหรือไม่ตั้งใจ
2. **Auto-cleanup/Lifecycle Policy** - Cloud SQL อาจมีนโยบายลบ database ที่ inactive
3. **Network/Connection Timeout** - ปัญหาการเชื่อมต่อทำให้ database ถูกทิ้ง
4. **Manual Deletion via Cloud Console** - database ถูกลบผ่าน Google Cloud Console
5. **Backup Restoration Conflict** - การ restore backup อาจลบ database ที่มีอยู่

---

## ✅ วิธีแก้ไข (3 ขั้นตอน)

### ขั้นตอนที่ 1: ตรวจสอบสถานะปัจจุบัน

```bash
cd eldersspace_backend

# ตรวจสอบการเชื่อมต่อ
node check_db.js
```

หากแสดง error `ER_BAD_DB_ERROR` = database ไม่มีอยู่

### ขั้นตอนที่ 2: สร้าง Database ใหม่และ Restore Schema

```bash
# รัน script ใหม่ที่สร้างขึ้น
node recreate_database.js
```

Script นี้จะ:
- ✅ สร้าง database `eldersspace` ใหม่
- ✅ รัน `complete_database_schema.sql` ทั้งหมด
- ✅ สร้างทุกตารางจากเอกสารสคีมา
- ✅ แสดงผลการเวอร์ริฟาย

### ขั้นตอนที่ 3: ตรวจสอบว่าสำเร็จ

```bash
# เปิด MySQL client ตรวจสอบ
mysql -h 34.126.155.104 -u admin -p -D eldersspace

mysql> SHOW TABLES;
mysql> SELECT COUNT(*) FROM users;
mysql> EXIT;
```

---

## 📊 Database Schema Backup (ป้องกันในอนาคต)

### วิธี 1: Export Schema ไปเก็บใน Git

```bash
# Export database schema เป็น SQL file
mysqldump -h 34.126.155.104 -u admin -p eldersspace --no-data > sql/backup_schema_`date +%Y%m%d`.sql

# Commit ลงใน Git
git add sql/backup_schema_*.sql
git commit -m "Backup database schema"
```

### วิธี 2: Export เป็น Complete Dump (ทุกข้อมูล)

```bash
# Export ทั้ง schema + data
mysqldump -h 34.126.155.104 -u admin -p eldersspace > sql/backup_complete_`date +%Y%m%d`.sql

# สำหรับ Cloud Storage
gsutil cp sql/backup_complete_*.sql gs://your-bucket/backups/
```

### วิธี 3: ตั้งค่า Automatic Backup ใน Google Cloud

**ผ่าน Google Cloud Console:**

1. เปิด Cloud SQL → eldersspace instance
2. ไปที่ **Backups** tab
3. คลิก **Create Backup** หรือ **Edit automatic backups**
4. ตั้งค่า:
   - **Location:** ตัวเลือก region
   - **Backup frequency:** Daily / Weekly / ตามต้องการ
   - **Retention period:** 30-365 วัน
5. Save

**ผ่าน gcloud CLI:**

```bash
gcloud sql backups create \
  --instance=eldersspace \
  --description="Manual backup $(date +%Y%m%d-%H%M%S)"

# ตั้ง automatic backup
gcloud sql instances patch eldersspace \
  --backup-start-time=02:00 \
  --retained-backups-count=30
```

---

## 🔒 วิธีป้องกันไม่ให้หายอีก

### 1. Enable Deletion Protection (Recommended ⭐)

```bash
gcloud sql instances patch eldersspace \
  --deletion-protection
```

หลังจากนี้ database จะไม่สามารถลบได้ถ้าไม่ระบุ flag `--no-deletion-protection`

### 2. Restrict IAM Permissions

เปิด Google Cloud Console → IAM & Admin → ตั้ง role:

- **บันทึก:** ให้ admin คนเดียวมี `cloudsql.admin` role
- **Dev/QA:** ให้ role `cloudsql.viewer` + `cloudsql.client` (read/connect ได้ เฉพาะ)

### 3. Enable Audit Logging

**ใน Google Cloud Console:**

1. Cloud SQL → eldersspace instance
2. ไปที่ **Flags**
3. ค้นหา `log` flags:
   - `cloudsql_iam_authentication` = ON
   - `log_bin_trust_function_creators` = ON (ถ้าใช้ triggers/functions)
   - `general_log` = ON (optional, performance impact)
4. Save

ทุก DROP/DELETE จะถูก log ใน Cloud Audit Logs

### 4. Version Control Database Schema

สร้าง directory `sql/migrations/` เพื่อเก็บทุก schema change:

```bash
# Structure
sql/
├── complete_database_schema.sql      # Current full schema
├── backup_schema_20260512.sql         # Timestamped backups
└── migrations/
    ├── 001_create_tables.sql
    ├── 002_add_columns.sql
    └── 003_add_indexes.sql
```

Commit ลงใน Git ทุกครั้งที่มี schema change

---

## 🔄 Regular Maintenance Schedule

| Activity | Frequency | Command |
|----------|-----------|---------|
| Manual Backup | Weekly | `mysqldump ...` |
| Verify Tables | Daily | `node check_db.js` |
| Export to Cloud Storage | Monthly | `gsutil cp ...` |
| Review Audit Logs | Weekly | Cloud Console |
| Test Restore Process | Quarterly | Test on staging DB |

---

## 📝 Checklist หลังจากแก้ไข

- [ ] รัน `recreate_database.js` สำเร็จ
- [ ] ตรวจสอบ 40+ tables ถูกสร้าง
- [ ] Server connect ได้ปกติ
- [ ] API ทำงานปกติ (`node .\server.js`)
- [ ] Export schema backup ไป Git
- [ ] Enable deletion protection บน Cloud SQL
- [ ] ตั้ง automatic backup
- [ ] Restrict IAM permissions
- [ ] Enable audit logging

---

## 🆘 Troubleshooting

### Error: ER_ACCESS_DENIED_ERROR
```
❌ Check DB_USER and DB_PASSWORD in .env file
```
**แก้:** ตรวจสอบ `.env` ให้ตรงกับ Cloud SQL credentials

### Error: ECONNREFUSED
```
❌ Cannot connect to database server
Check: host=34.126.155.104, port=3306
```
**แก้:**
1. ตรวจสอบ IP เปิด access จาก local (Authorize networks)
2. ตรวจสอบ firewall rule

### Error: Lost connection during import
**แก้:**
```bash
# เพิ่ม timeout
node recreate_database.js --timeout=30000

# หรือ split import
mysql -h 34.126.155.104 -u admin -p eldersspace < sql/complete_database_schema.sql
```

---

## 📞 Support

ถ้ายังมีปัญหา ให้:
1. เรียก `node check_db.js` เก็บ output
2. เรียก `gcloud sql instances describe eldersspace` 
3. ดู Cloud Audit Logs มีการ DROP database เมื่อไร
4. ติดต่อ Google Cloud Support พร้อม证据
