# Cloud SQL Connection Setup Guide

## Current Configuration
Your backend is already configured to connect to Google Cloud SQL with the following settings:
- **Host**: 34.126.155.104 (Cloud SQL Public IP)
- **Port**: 3306
- **User**: elders_app
- **Database**: eldersspace

## Setup Methods

### Method 1: Direct TCP Connection (Current Setup)
This is the simplest method - connect directly via Cloud SQL Public IP.

**Prerequisites:**
- Cloud SQL instance has public IP enabled
- Your machine/server IP is whitelisted in Cloud SQL authorized networks
- Network connectivity is working

**Configuration:**
The `.env` file is already set up. Make sure these variables are configured:
```
DB_HOST=34.126.155.104
DB_PORT=3306
DB_USER=elders_app
DB_PASSWORD=gusnxxb0
DB_DATABASE=eldersspace
USE_CLOUD_SQL_PROXY=false
```

**Test Connection:**
```bash
cd eldersspace_backend
npm install  # Make sure mysql2 is installed
node -e "const pool = require('./config/db'); pool.getConnection().then(c => { console.log('✅ Connected!'); c.release(); }).catch(e => console.error('❌ Error:', e.message));"
```

---

### Method 2: Cloud SQL Proxy (Recommended for Production)
More secure method using Google Cloud SQL Proxy.

**Prerequisites:**
- Install Cloud SQL Proxy: https://cloud.google.com/sql/docs/mysql/sql-proxy
- Google Cloud credentials configured
- Service account with Cloud SQL Editor role

**Installation on Windows:**
```bash
# Download from https://dl.google.com/cloudsql/cloud_sql_proxy.exe
# Or using Chocolatey:
choco install cloudsqlproxy
```

**Configuration:**
1. Get your Cloud SQL connection name from GCP Console: `project-id:region:instance-name`

2. Update `.env`:
```
DB_HOST=127.0.0.1
DB_PORT=3307
USE_CLOUD_SQL_PROXY=true
CLOUD_SQL_CONNECTION_NAME=project-id:region:instance-name
```

3. Start Cloud SQL Proxy in a separate terminal:
```bash
cloud_sql_proxy -instances=PROJECT-ID:REGION:INSTANCE-NAME=tcp:3307
```

4. Run the backend in another terminal:
```bash
npm start  # or node server.js
```

---

### Method 3: Private IP Connection (VPC)
For connections within Google Cloud VPC (App Engine, Compute Engine, GKE).

**Prerequisites:**
- Cloud SQL instance has private IP enabled
- Your application runs in the same VPC
- VPC peering or service networking configured

**Configuration:**
```
DB_HOST=10.x.x.x  # Private IP address
DB_PORT=3306
USE_CLOUD_SQL_PROXY=false
```

---

## SSL/TLS Configuration

For production, enable SSL certificates:

1. Download Server CA certificate from GCP Cloud SQL Console
2. Save to `certs/server-ca.pem`
3. Update `.env`:
```
DB_SSL_CA=./certs/server-ca.pem
```

The `db.js` will automatically load and use the certificate if available.

---

## Testing Cloud SQL Connection

### Test 1: Direct Connection Test
```bash
npm install mysql2
node -e "
const mysql = require('mysql2/promise');
const pool = mysql.createPool({
  host: '34.126.155.104',
  port: 3306,
  user: 'elders_app',
  password: 'gusnxxb0',
  database: 'eldersspace',
  ssl: { rejectUnauthorized: false }
});
pool.getConnection()
  .then(conn => { console.log('✅ Connected!'); conn.release(); })
  .catch(e => console.error('❌ Error:', e.message));
"
```

### Test 2: Backend Health Check
```bash
npm start
# In another terminal:
curl http://localhost:3000/health
# Should return: { ok: true, message: 'backend alive' }
```

### Test 3: Database Query
```bash
curl http://localhost:3000/api/users
# Should work if database connection is successful
```

---

## Troubleshooting

### ❌ "connect ECONNREFUSED"
- Check if Cloud SQL instance is running
- Verify host/port are correct
- Check firewall rules (authorized networks)

### ❌ "ER_ACCESS_DENIED_ERROR"
- Verify username and password
- Check if user exists in Cloud SQL
- Verify user has correct permissions

### ❌ "ENOTFOUND" or "getaddrinfo ENOTFOUND"
- Host name is incorrect
- DNS resolution issue
- Network connectivity problem

### ❌ "PROTOCOL_PACKETS_OUT_OF_ORDER"
- Try disabling keep-alive: Set `enableKeepAlive: false`
- Increase connection timeout
- Check if firewall is blocking connections

### ✅ Check Connection Logs
```bash
# Enable verbose logging
DEBUG=mysql:* npm start
```

---

## Production Checklist

- [ ] Use private IP connection (not public IP) within same VPC
- [ ] Enable SSL/TLS certificates
- [ ] Use environment-specific passwords
- [ ] Set up Cloud SQL backup automation
- [ ] Configure connection pooling limits based on needs
- [ ] Use Cloud SQL Proxy for maximum security
- [ ] Enable audit logging in Cloud SQL
- [ ] Regularly rotate database credentials
- [ ] Monitor connection metrics in GCP Console

---

## Environment-Specific Configs

### Development
```
DB_HOST=34.126.155.104
USE_CLOUD_SQL_PROXY=false
NODE_ENV=development
```

### Production
```
DB_HOST=10.x.x.x  # Private IP
USE_CLOUD_SQL_PROXY=true
NODE_ENV=production
```

---

## Useful GCP Commands

### Check Cloud SQL instances:
```bash
gcloud sql instances list
```

### Get connection name:
```bash
gcloud sql instances describe INSTANCE-NAME --format="value(connectionName)"
```

### Connect using Cloud SQL CLI:
```bash
gcloud sql connect INSTANCE-NAME --user=root
```

### View Cloud SQL logs:
```bash
gcloud sql operations list --instance=INSTANCE-NAME
```
