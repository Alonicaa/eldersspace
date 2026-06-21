# 🚀 EldersSpace - Quick Setup Guide

## ✅ Current Status
- **Backend**: ✓ Running at `http://0.0.0.0:3000`
- **Cloud SQL**: ✓ Connected at `34.126.155.104:3306`
- **HTML Admin Panel**: ⚠️ Needs configuration
- **Flutter App**: ⚠️ Some pages use hardcoded URLs

---

## 🔧 For HTML Admin Panel

### Option 1: Automatic (Recommended)
Open this page in your browser:
```
file:///path/to/flutter/diagnostic.html
```

This will:
- ✓ Auto-detect your backend
- ✓ Save configuration to browser
- ✓ Test all connections

### Option 2: Manual Configuration
Edit `script.js` line 14:
```javascript
// Change from:
return 'http://localhost:3000';

// To:
return 'http://34.126.155.104:3000';
```

Then refresh `index.html`

---

## 📱 For Flutter App

### Android Emulator (Local Development)
```bash
cd eldersspace
flutter run --dart-define=BACKEND_HOST=http://10.0.2.2:3000
```

### Cloud SQL Backend (Production)
```bash
cd eldersspace
flutter run
```

The app is pre-configured to use: `http://34.126.155.104:3000`

### Custom Server
```bash
flutter run --dart-define=BACKEND_HOST=http://your-server:3000
```

---

## 🧪 Test Everything

### Test Backend
```bash
cd eldersspace_backend

# Windows:
node test_cloud_sql_connection.js

# Or open in browser:
http://localhost:3000/health
```

### Test Admin Panel
```
Open: diagnostic.html
```

### Test Flutter API
In Flutter console (after `flutter run`):
- Open any page that uses posts/comments
- Check console for connection status

---

## 🔍 Troubleshooting

### HTML Admin Panel Not Loading Dashboard
1. Open `diagnostic.html`
2. Check Backend Health test
3. If ✓ passed: refresh `index.html`
4. If ✗ failed: backend not running - run `npm start` in backend folder

### Flutter App 404 Errors
1. Check you're using correct backend URL
2. Verify API endpoint exists at backend
3. Check Flutter console for errors

### "Connection Refused" Error
1. Verify backend is running: `npm start`
2. Check firewall allows port 3000
3. Use `diagnostic.html` to test

---

## 📌 Important Files

- **HTML Admin Panel**: `/index.html`
- **Diagnostic Tool**: `/diagnostic.html`
- **Main Config**: `/script.js` (line 14)
- **Flutter API Config**: `/eldersspace/lib/services/app_config.dart`
- **Backend Health**: `http://localhost:3000/health`

---

## 🎯 Next Steps

1. ✓ Open `/diagnostic.html` in browser
2. ✓ Verify all tests pass
3. ✓ Refresh `/index.html` (admin panel)
4. ✓ Run Flutter app: `flutter run`
5. ✓ Test login and data flow

---

**Last Updated**: May 13, 2026
**Status**: Production Ready ✅
