# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Vercel Projects

There are **two separate Vercel projects** connected to this repo:

| Vercel Project | URL | Serves |
|---|---|---|
| `eldersspace` | `eldersspace.vercel.app` | Flutter web app (pre-built) |
| `eldersspace_dashboard` | `eldersspacedashboard.vercel.app` | Admin panel (index.html / script.js) |

**`eldersspace` project settings (set once in Vercel dashboard, never change):**
- Root Directory: `eldersspace/build/web`
- Build Command: *(empty)*
- Output Directory: *(empty)*

`vercel.json` at repo root is for `eldersspace_dashboard` only. Do NOT add `buildCommand` or `outputDirectory` to it.

## Deploy After Every Code Change

After every code change to the Flutter frontend, always run a web build and deploy:

```bash
cd eldersspace
flutter build web --release --no-tree-shake-icons
```

Then `git add -f eldersspace/build/web/` and commit + push. Vercel picks up the new build automatically from `eldersspace/build/web`. Never report a task as done without deploying.



| Directory | Purpose |
|---|---|
| `eldersspace/` | Flutter frontend (Android, iOS, Web, Desktop) |
| `eldersspace_backend/` | Node.js/Express REST API |
| `index.html` / `script.js` | HTML/JS admin panel (opened directly in browser) |

---

## Flutter Frontend

### Commands

```bash
cd eldersspace

flutter pub get                   # Install dependencies
flutter run                       # Run (defaults to Cloud SQL backend)
flutter run --dart-define=BACKEND_HOST=http://10.0.2.2:3000  # Android emulator with local backend
flutter run -d chrome             # Web
flutter analyze                   # Lint
flutter test                      # All tests
flutter test test/widget_test.dart  # Single test file
dart format lib/ test/            # Format code

flutter build apk --release       # Android APK
flutter build appbundle --release # Android App Bundle
flutter build web --release       # Web
```

### Architecture

**Entry flow:** `main.dart` → `LoginPage` → `OtpPage` → `OtpSuccessPage` → `SetNamePage` → `SetProfilePage` → `HomePage`

**`lib/services/`** — all business logic lives here:
- `app_config.dart` — single source of truth for backend URL and Cloud SQL connection details. The `BACKEND_HOST` dart-define overrides the default at runtime.
- `api_service.dart` — centralized HTTP client; all pages call through this, never raw `http` directly.
- `app_settings_service.dart` — singleton wrapping SharedPreferences; manages font scale and TTS preferences that apply app-wide.
- `tts_stt_service.dart` — Text-to-Speech and Speech-to-Text abstraction used for accessibility throughout the app.
- `reward_service.dart` — daily check-in logic, session time tracking, points calculation.

**`lib/widgets/`** — shared UI components (post display, comment dialog, reward cards, share sheet, image viewer).

**State management:** No Provider/Riverpod/Bloc. Uses `ValueNotifier` + `ValueListenableBuilder` for reactive font scaling; all other state is local `StatefulWidget` state. `AppSettingsService` is a singleton accessed directly.

**Elder Mode:** `AppSettingsService.instance.elderModeNotifier` (ValueNotifier<bool>, default `true`). When enabled: font scale forced to 1.3, larger buttons/icons via ThemeData in `main.dart`. Toggle persisted per-user in SharedPreferences. **Every new page or feature added to the app (post-login) must be compatible with elder mode** — avoid fixed-height containers wrapping text, avoid overriding `textScaler`, and ensure layouts scroll rather than overflow when text is 1.3× larger. Registration/onboarding pages (LoginPage, OtpPage, OtpSuccessPage, SetNamePage, SetProfilePage) are exempt — they hard-code `textScaler: 1.0`.

### Elder Mode / Font-Scale Overflow Rules (zero-tolerance)

These rules apply to **every** post-login widget, page, card, and dialog — no exceptions:

**Layout constraints**
- Never use `childAspectRatio` in a `GridView` or `SliverGrid` when the cell contains text. Use `mainAxisExtent` (fixed dp height) instead, sized to fit 1.3× text. Formula: measure max content height at 1.3× scale and add ≥ 16 dp buffer.
- Never set a fixed `height:` on a `Container` or `SizedBox` that wraps text unless the text is single-line AND `overflow: TextOverflow.ellipsis` is set AND you have confirmed the 1.3× height still fits.
- Image/banner areas with fixed heights are fine — the constraint must not extend to the text area below them.

**Scrollability**
- Every page body must be a `SingleChildScrollView`, `ListView`, `CustomScrollView`, or another scrollable. A `Column` as the root body widget is only allowed if every child has strictly bounded height with no text.
- Cards that stack text vertically (name + description + badge, etc.) must either scroll or use `mainAxisExtent` large enough for 1.3× font.

**Text widgets**
- Never use `textScaleFactor` or `textScaler` to override scaling on post-login screens.
- Multi-line `Text` must always have `maxLines` + `overflow: TextOverflow.ellipsis` so it cannot grow unbounded.
- `RichText` and `SelectableText` follow the same rules.

**Dialogs and bottom sheets**
- Use `SingleChildScrollView` as the direct child of `AlertDialog.content` and `BottomSheet` bodies.
- Never hardcode a pixel height for a dialog — use `constraints: BoxConstraints(maxHeight: …)` if you need a cap.

**Testing mental model**
Before finalising any UI change, mentally simulate the layout at 1.3× font scale. If any container can receive more text than fits its fixed height, it will overflow in production Elder Mode. Fix it before committing.

**Backend URL resolution by platform:**
- Android Emulator → `10.0.2.2:3000`
- Physical device / Production → `34.126.155.104:3000` (Google Cloud SQL host)
- iOS Simulator / Web / Desktop → `localhost:3000`

Override via `--dart-define=BACKEND_HOST=<url>` at `flutter run`.

---

## Node.js Backend

### Commands

```bash
cd eldersspace_backend

npm install     # Install dependencies
node server.js  # Start server on 0.0.0.0:3000
```

**Environment setup:** copy `.env.example` to `.env` and fill in DB credentials, Twilio credentials, and `ADMIN_AUTH_SECRET`.

**Health check:** `GET http://localhost:3000/health`

**Cloud SQL connectivity test:** `node test_cloud_sql_connection.js`

### Architecture

Layered MVC: `routes/` → `controllers/` → `config/db.js` (MySQL2 promise pool).

Key route groups:
- `/api/auth/*` — OTP request/verify (Twilio SMS), admin login
- `/api/users/*`, `/api/posts/*`, `/api/comments/*`, `/api/notifications/*`
- `/api/rewards/*` — daily check-in, session rewards, point summaries
- `/api/admin/*` — promo codes, manual overrides, user management

**Auth pattern:** Regular users authenticate via phone OTP (Twilio). Admin routes use a custom HMAC-SHA256 token derived from `ADMIN_AUTH_SECRET` in `.env` — not standard JWT.

**File uploads:** Multer configured in `config/multerConfig.js`; files stored in `uploads/` and served as static assets.

---

## Admin Panel

Open `index.html` or `diagnostic.html` directly in a browser (no server needed). Edit `script.js` line 14 to point at the correct backend URL before use.

---

## Database

- Google Cloud SQL (MySQL 8.4.8) at `34.126.155.104:3306`, database `eldersspace`
- Schema migrations live in `eldersspace_backend/migrations/`
- Connection pooling: 5 connections, keep-alive every 30 s (`config/db.js`)

---

## Color Rules — Green brand, Blue actions

The app uses **two distinct color roles**:

### Partner / Brand color — Green
Used for partner identity, brand badges, section icons, decorative elements, and background tints inside partner pages.

| Role | Hex |
|---|---|
| Dark green (AppBar partner pages, icons) | `0xFF1B5E20` |
| Medium green | `0xFF2E7D32` |
| Light green | `0xFF388E3C` |

### Action / Interactive color — Blue
Used for **all tappable action buttons** ("สมัคร", "แลกเลย", "รายละเอียด", "ดูรายละเอียด"), "ดูทั้งหมด" links, hub-page AppBars (all_*_page), and other user-facing controls.

| Role | Hex |
|---|---|
| Primary action button | `Color(0xFF1565C0)` |
| Bottom nav active | `Color(0xFF3B6FD4)` — keep as-is |

### Rules
- Partner page (`partner_page.dart`) → brand elements stay **green**; job/project action buttons use **blue**
- Hub pages (`all_opportunities_page`, `all_announcements_page`, `all_partners_page`, `partner_opportunities_page`) → fully **blue** (app-owned navigation)
- `main.dart` seed color stays green (`Color(0xFF2E7D32)`) — affects Material widget defaults
- Green (`Colors.green`) for success/positive indicators only (reward earned, checkin streaks)

---

## Delete Policy — Soft Delete Only

**All delete operations across the entire project must be soft deletes. Never issue a hard `DELETE FROM` for user-facing data.**

- Backend: set `is_deleted = 1` (or `deleted_at = NOW()`) instead of `DELETE`. All `SELECT` queries must filter `WHERE is_deleted = 0` (or `deleted_at IS NULL`).
- Dashboard: delete buttons call a PATCH/PUT endpoint that sets the deleted flag — never `DELETE` HTTP method on records that should be recoverable.
- Flutter: same — call the soft-delete endpoint; do not assume the record is gone from DB.
- Migrations: any new table that supports deletion must include `is_deleted TINYINT(1) NOT NULL DEFAULT 0` (or `deleted_at DATETIME DEFAULT NULL`) in its schema.
- Hard `DELETE` is only acceptable for junction/log tables with no business value (e.g. session tokens, OTP codes, FCM token dedup).
