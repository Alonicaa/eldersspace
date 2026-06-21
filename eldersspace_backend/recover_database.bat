@echo off
REM Quick Start: Database Recovery Commands for Windows
REM Run this batch file to recover the eldersspace database

cls
echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║     ELDERSSPACE DATABASE RECOVERY - QUICK START            ║
echo ║                   (Windows Version)                        ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

REM Change to backend directory
cd /d eldersspace_backend
if errorlevel 1 (
    echo ❌ Error: Cannot find eldersspace_backend directory
    pause
    exit /b 1
)

echo 📋 Step 1: Verify current .env configuration
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
findstr "^DB_" .env
echo.

echo ⏳ Step 2: Checking database connection...
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
call node check_db.js
if errorlevel 1 (
    echo.
    echo ❌ Database connection failed ^(expected if database was deleted^)
    echo.
    echo 🔨 Step 3: Recreating database...
    echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    call node recreate_database.js
    if errorlevel 1 (
        echo.
        echo ❌ Database recreation failed!
        echo Please check DATABASE_RECOVERY_GUIDE.md for troubleshooting
        echo.
        pause
        exit /b 1
    )
) else (
    echo.
    echo ✅ Database already exists and is accessible
)

echo.
echo 🔄 Step 4: Final verification...
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
call node check_db.js
if errorlevel 1 (
    echo.
    echo ❌ Database verification failed
    pause
    exit /b 1
)

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║     ✅ DATABASE RECOVERY COMPLETED SUCCESSFULLY!           ║
echo ╚════════════════════════════════════════════════════════════╝
echo.
echo Next steps:
echo   1. npm install        # Install dependencies if needed
echo   2. node server.js     # Start the server
echo.
echo 📚 For prevention steps, see: DATABASE_RECOVERY_GUIDE.md
echo.
pause
