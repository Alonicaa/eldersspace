#!/bin/bash
# Quick Start: Database Recovery Commands
# Run these commands in order to recover the eldersspace database

echo "╔════════════════════════════════════════════════════════════╗"
echo "║     ELDERSSPACE DATABASE RECOVERY - QUICK START            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Change to backend directory
cd eldersspace_backend || exit 1

echo "📋 Step 1: Verify current .env configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
grep "^DB_" .env
echo ""

echo "⏳ Step 2: Checking database connection..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node check_db.js
DB_CHECK=$?
echo ""

if [ $DB_CHECK -ne 0 ]; then
    echo "❌ Database connection failed (expected if database was deleted)"
    echo ""
    echo "🔨 Step 3: Recreating database..."
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    node recreate_database.js
    RECREATE=$?
    
    if [ $RECREATE -eq 0 ]; then
        echo ""
        echo "✅ Database recreated successfully!"
    else
        echo ""
        echo "❌ Database recreation failed!"
        echo "Please check DATABASE_RECOVERY_GUIDE.md for troubleshooting"
        exit 1
    fi
else
    echo "✅ Database already exists and is accessible"
fi

echo ""
echo "🔄 Step 4: Final verification..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node check_db.js
FINAL_CHECK=$?

if [ $FINAL_CHECK -eq 0 ]; then
    echo ""
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║     ✅ DATABASE RECOVERY COMPLETED SUCCESSFULLY!           ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Next steps:"
    echo "  1. npm install        # Install dependencies if needed"
    echo "  2. node server.js     # Start the server"
    echo ""
    echo "📚 For prevention steps, see: DATABASE_RECOVERY_GUIDE.md"
else
    echo ""
    echo "❌ Database verification failed"
    exit 1
fi
