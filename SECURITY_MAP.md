# GlobalNews.site — Attack Surface & Security Architecture Map

**Application ID:** `a9542f7a-a86b-4dcc-8453-4a720de480bc`  
**Primary Administrator:** `joshuaocansey731@gmail.com` / `joshuaocansey66@gmail.com`  
**Database:** Cloud Firestore (`ai-studio-newsio-a9542f7a-a86b-4dcc-8453-4a720de480bc`)  
**Backend:** Node.js / Express (`server.ts`) on Google Cloud Run  
**Frontend:** React 18 / TypeScript / Vite / Tailwind CSS  

---

## 1. System Architecture & Entry Points

```
[ Internet / Clients ]
        │
        ▼ (HTTPS / HSTS)
[ Google Cloud Run Load Balancer / Reverse Proxy ]
        │
        ├──► [ Helmet Security Headers ] (nosniff, SAMEORIGIN, strict-origin)
        ├──► [ Block Sensitive Files Middleware ] (/.env, /data, /*.ts -> 404)
        ├──► [ Express Rate Limiters ] (General 120/m, AI 15/m, Payment 20/m)
        ├──► [ Admin Route Guard ] (requireAdminAuth: verifies admin email/secret)
        │
        ├──► Express Server (server.ts : 3000)
        │       ├── /api/health (200 OK)
        │       ├── /api/proxy-image (SSRF Protected)
        │       ├── /api/download-file (SSRF Protected)
        │       ├── /api/og-image (SSRF Protected)
        │       ├── /api/recommend-movies (Gemini AI Rate-Limited)
        │       ├── /api/generate-promo-copy (Gemini AI Fallback Protected)
        │       ├── /api/payment/* (Ghana MoMo verification engine)
        │       └── /api/automation/* (Video generation, voice settings)
        │
        ├──► Vite SPA Frontend (public/)
        └──► Firebase Firestore (Hardened ABAC Rules, Least Privilege)
```

---

## 2. Inventory of Sensitive Assets & Secrets

| Asset / Key | Storage Location | Protection Mechanism | Exposure Risk |
| :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | Server Environment Variable | Server-side only proxy; never imported in client code | Zero (hidden) |
| `ELEVENLABS_API_KEY` | Server Environment Variable | Server-side only proxy (`automationRoutes.ts`); never in frontend | Zero (hidden) |
| `GMAIL_APP_PASSWORD` | Server Environment Variable | Server-side only SMTP transport; masked in logging | Zero (hidden) |
| Firebase Client Config | `firebase-applet-config.json` | Public client identifiers; protected by Firestore Rules | Zero (Rules enforced) |
| Transaction Store | `/data/ghana_transactions.json` | Stored outside `/public`; blocked via `blockSensitiveFileRequests` | Zero (404 on HTTP probe) |
| Voice Settings & Jobs | `/data/automation_*.json` | Server file system; protected by admin middleware | Zero (404 on HTTP probe) |

---

## 3. Route Security & Permission Matrix

| Path | Method | Access Level | Protections Enforced |
| :--- | :--- | :--- | :--- |
| `/api/health` | GET | Public | Stripped `X-Powered-By`, HSTS, nosniff |
| `/api/news` | GET | Public | 120 req/min rate limit, RSS timeout guard |
| `/api/search-news` | GET | Public | Sanitized query string, rate-limited |
| `/api/proxy-image` | GET | Public | **SSRF Guard (`isSafePublicUrl`)**, 15MB size cap, 8s timeout |
| `/api/download-file` | GET | Public | **SSRF Guard (`isSafePublicUrl`)**, filename sanitize, 10s timeout |
| `/api/og-image` | GET | Public | **SSRF Guard (`isSafePublicUrl`)**, 6s timeout |
| `/api/recommend-movies` | POST | Public | AI Rate limiter (15 req/min), schema validation |
| `/api/generate-promo-copy` | POST | Public | AI Rate limiter, 5s Promise.race fallback, schema validation |
| `/api/payment/ghana-initiate`| POST | Public / User | Payment rate limiter (20/min), phone & email regex validation |
| `/api/payment/status` | GET | Public / User | Read-only state check, no credentials returned |
| `/api/payment/verify` | GET | Admin (Email Token) | Cryptographic 16-byte random token matching per action |
| `/api/payment/verify-code` | POST | User | Rate limited (20/min), strict 6-digit regex validation |
| `/api/payment/admin/*` | ALL | **Admin Only** | **`requireAdminAuth`** (403 if unauthorized) |
| `/api/platform-status/admin-override` | POST | **Admin Only** | **`requireAdminAuth`** (403 if unauthorized) |
| `/api/automation/dashboard` | GET | User | Requires valid `userId`, queries user's own data only |
| `/api/automation/generate` | POST | User | Concurrency lock, duplicate click cooldown, 15 req/min rate limit, quota check |
| `/api/automation/auto-mode` | POST | User | Requires valid `userId`, bounded schedule inputs |
| `/api/automation/payment/*` | POST | User | Rate limited, unlock code validation |
| `/api/automation/admin/*` | ALL | **Admin Only** | **`requireAdminAuth`** (403 if unauthorized) |

---

## 4. Firestore Database Security Architecture

- **Rules Version:** `rules_version = '2';`
- **Default Action:** `match /{document=**} { allow read, write: if false; }` (Pillar 1: Least Privilege)
- **Attribute-Based Access Control (ABAC):**
  - `users/{userId}`: Regular users cannot self-escalate `role: "admin"` or `isSubscribed: true`. Any mutation affecting those keys is rejected by security rules unless `isAdmin()`.
  - `movies/{movieId}`: Catalog is public read, but write operations are strictly restricted to `isAdmin()`.
  - `transactions/{transactionId}`: Users can only create their own transactions with initial status `pending`. Updates and deletions are restricted to `isAdmin()`.
