# 🚨 Database Recovery Summary - eldersspace หายไปจาก Cloud SQL

## สาเหตุที่เป็นไปได้
1. **Drop โดยไม่ตั้งใจ** - ใครบางคนรัน `DROP DATABASE eldersspace;`
2. **Auto-cleanup Policy** - Cloud SQL หลังจากไม่ใช้นานๆ
3. **Network Timeout** - Database disconnect ทำให้หายไป
4. **Manual Deletion** - ลบผ่าน Google Cloud Console โดยไม่ตั้งใจ
5. **Backup Restoration Issue** - การ restore backup ทำให้ database ถูกลบ

---

## ✅ วิธีแก้ไข (เลือก 1 ตัวเลือก ตามระบบของคุณ)

### 🪟 **สำหรับ Windows:**
```bash
cd eldersspace_backend
recover_database.bat
```

### 🐧 **สำหรับ Linux/Mac:**
```bash
cd eldersspace_backend
chmod +x recover_database.sh
./recover_database.sh
```

### 🔧 **Manual Command (สำหรับ Terminal/PowerShell):**
```bash
cd eldersspace_backend
node recreate_database.js
```

---

## สิ่งที่ Script ทำ
✅ สร้าง database `eldersspace` ใหม่  
✅ รัน complete schema จาก `sql/complete_database_schema.sql`  
✅ สร้างตารางทั้งหมด 40+ ตาราง  
✅ ตั้ง collation เป็น `utf8mb4_unicode_ci`  
✅ ตรวจสอบความสำเร็จอัตโนมัติ  

---

## 📋 ขั้นตอน

### 1️⃣ รัน Recovery Script
```bash
# Windows:
recover_database.bat

# Linux/Mac:
./recover_database.sh

# Or direct:
node recreate_database.js
```

### 2️⃣ ตรวจสอบผลลัพธ์
```bash
node check_db.js
```
ควรเห็น:
- ✅ Connected to database
- ✅ Users table: [count] records
- ✅ All tables exist

### 3️⃣ เริ่ม Server
```bash
node server.js
# หรือ npm start
```

---

## 🔒 ป้องกันไม่ให้หายอีก

### Immediate Actions (ใช้เวลา 5 นาที)

#### 1. Enable Deletion Protection
```bash
gcloud sql instances patch eldersspace \
  --deletion-protection
```
หลังจากนี้ ต้องรัน `--no-deletion-protection` ถึงจะลบได้

#### 2. Backup Schema ไป Git
```bash
# เก็บ schema file ในรีโปซิทอรี
cp sql/complete_database_schema.sql sql/backup_schema_$(date +%Y%m%d).sql
git add sql/backup_schema_*.sql
git commit -m "Add database schema backup"
git push
```

#### 3. Export Complete Data
```bash
mysqldump -h 34.126.155.104 -u admin -p eldersspace \
  > sql/backup_complete_$(date +%Y%m%d).sql
```

### Medium-term (ใช้เวลา 15 นาที)

#### 4. Enable Automatic Backups
ใน Google Cloud Console → Cloud SQL → eldersspace:
1. Backups tab
2. Edit automatic backups
3. ตั้ง:
   - Backup frequency: Daily
   - Retention: 30 days
4. Save

หรือใช้ gcloud:
```bash
gcloud sql instances patch eldersspace \
  --backup-start-time=02:00 \
  --retained-backups-count=30
```

#### 5. Restrict IAM Access
ใน Google Cloud Console → IAM & Admin:
- Admin user: `cloudsql.admin` (full access)
- Dev/QA: `cloudsql.viewer` + `cloudsql.client` (read-only + connect)

#### 6. Enable Audit Logging
```bash
gcloud sql instances patch eldersspace \
  --database-flags=general_log=on
```

---

## 📁 Files สำหรับ Recovery

| File | ประเทศ |
|------|--------|
| `recreate_database.js` | Script Node.js สร้าง DB + restore |
| `recover_database.bat` | Batch script สำหรับ Windows |
| `recover_database.sh` | Shell script สำหรับ Linux/Mac |
| `DATABASE_RECOVERY_GUIDE.md` | Guide เต็มรูปแบบ |
| `sql/complete_database_schema.sql` | Schema เต็ม (ห้ามลบ!) |

---

## 🆘 Troubleshooting

### Error: "ER_ACCESS_DENIED_ERROR"
✔️ ตรวจสอบ `.env` ให้ตรง credentials ของ Cloud SQL

### Error: "ECONNREFUSED"
✔️ ตรวจสอบ IP หรือ firewall ให้ server ของคุณเชื่อมต่อได้

### Error: "Lost connection during import"
✔️ ลองเพิ่ม timeout หรือรัน manual import

---

## 📞 ถ้ายังใจร้าย

1. ดู `DATABASE_RECOVERY_GUIDE.md` มีรายละเอียดเต็มๆ
2. เรียก `node check_db.js` ตรวจสอบ
3. เรียก `gcloud sql instances describe eldersspace` ดู metadata
4. ตรวจสอบ Cloud Audit Logs มีการ DROP เมื่อไร
5. ติดต่อ Google Cloud Support

---

**Status:** ✅ Ready to recover

**Next:** รัน `recover_database.bat` (Windows) หรือ `./recover_database.sh` (Linux/Mac)
