# Deployment checklist

Backend on **Render**, admin and student portals on **Vercel**, data on
**MongoDB Atlas**, chatbot on **Qdrant Cloud + Gemini + Groq**, payments on the
**SSLCommerz sandbox**.

Deploy in this order: each step needs a URL from the one before.

1. Before you start
2. Backend on Render
3. Admin portal on Vercel
4. Student portal on Vercel
5. Connect them back to the backend
6. Smoke test

---

## 1. Before you start

- [ ] **Merge the `audit-fixes` branch into `main`** in all three repos
      (backend, admin portal, student portal). Render and Vercel deploy from `main`.
- [ ] **Rotate the Firebase service-account key.** The old one was exposed.
      - Firebase Console → Project settings → Service accounts → **Generate new private key**.
      - Google Cloud Console → IAM & Admin → Service accounts →
        `firebase-adminsdk-…` → **Keys** → delete the old key.
      - Put the new `private_key` / `client_email` in your local `.env` too.
- [ ] **Atlas → Network Access → Add IP Address → `0.0.0.0/0`.**
      Render's free tier has no fixed IP, so Atlas must accept any IP. Your
      database password is what protects it, so make sure it's long and random.
- [ ] Generate a **new** JWT secret for production (don't reuse the local one):
      `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

## 2. Backend on Render

New → **Web Service** → connect the `SEC_LIBRARAY_BACKEND` repo.

| Setting | Value |
|---|---|
| Branch | `main` |
| Root directory | *(leave empty)* |
| Runtime | Node (the version comes from `engines` in package.json: ≥ 22) |
| Build command | `npm ci` |
| Start command | `npm start` |
| Health check path | `/health` |

**Environment variables** (Environment tab):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGO_URI` | Your Atlas URI **with `/sec_library`** before the `?` |
| `JWT_ACCESS_SECRET` | The new secret from step 1 |
| `BACKEND_URL` | This service's URL, e.g. `https://sec-library-api.onrender.com` (known after creating it) |
| `CLIENT_URL` | Admin Vercel URL: fill in at step 5 (temporarily `http://localhost:3000`) |
| `STUDENT_CLIENT_URL` | Student Vercel URL: fill in at step 5 (temporarily `http://localhost:5173`) |
| `FIREBASE_PROJECT_ID` | From the new service-account key |
| `FIREBASE_CLIENT_EMAIL` | From the new service-account key |
| `FIREBASE_PRIVATE_KEY` | From the new key, pasted **with its `\n` sequences** |
| `QDRANT_URL_RAG` | Qdrant cluster URL |
| `QDRANT_API_KEY_RAG` | Qdrant API key |
| `GOOGLE_API_KEY` | Google AI Studio key |
| `GROQ_API_KEY_RAG` | Groq key |
| `SSLCOMMERZ_STORE_ID` | Sandbox store ID |
| `SSLCOMMERZ_STORE_PASSWORD` | Sandbox store password |
| `SSLCOMMERZ_IS_LIVE` | `false` |
| `LATE_FINES_START_DATE` | **Today's deployment date**, e.g. `2026-10-05T00:00:00Z` |

**Don't set:**
- `PORT`: Render sets it for you.
- `ALLOW_PASSWORD_LOGIN`: password login must stay off in production (it's
  off anyway when `NODE_ENV=production`).

Notes:
- The chatbot index already exists in your Qdrant, so the server skips
  indexing on startup. After editing `rag.text`, run `npm run rag:index`
  locally (it uses the same Qdrant).
- Free Render services sleep after ~15 min idle; the first request then takes
  30–50 s. Late fines missed while asleep are charged at the next check or
  on return, so none are lost.

Check: open `https://<your-render-app>.onrender.com/health` and you should see
"API is healthy".

## 3. Admin portal on Vercel

New Project → import the **SEC_Library_Admin_Portal** repo.

| Setting | Value |
|---|---|
| Framework preset | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://<your-render-app>.onrender.com/api` (**with** `/api`) |

## 4. Student portal on Vercel

New Project → import the **SEC_Library_Student_Portal** repo (same framework settings).

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://<your-render-app>.onrender.com` (**without** `/api`) |
| `VITE_FIREBASE_API_KEY` … `VITE_FIREBASE_APP_ID` | Same six values as your local `.env` |

Then **Firebase Console → Authentication → Settings → Authorized domains →
Add domain**: your student Vercel domain (e.g. `sec-library-student.vercel.app`).
Google sign-in fails on unlisted domains.

`VITE_*` variables are baked in at build time: after changing one on Vercel,
**redeploy**.

## 5. Connect them back to the backend

On Render, set the real frontend URLs (exactly as the browser shows them:
`https://`, no trailing slash):

- `CLIENT_URL` = admin Vercel URL
- `STUDENT_CLIENT_URL` = student Vercel URL

Save (Render redeploys). CORS only accepts these two origins, and payment
redirects go back to `STUDENT_CLIENT_URL`.

## 6. Smoke test

- [ ] Admin portal: log in; dashboard numbers load.
- [ ] Admin portal: **Continue as Guest**. Yellow banner shows, and buttons are disabled.
- [ ] Student portal: enter a regNo → masked name → **Google sign-in** → books page.
- [ ] Same browser: admin and student portals both stay logged in.
- [ ] Student portal: reserve a book → countdown shows **2 minutes**.
- [ ] Student portal: chatbot, e.g. "books on sorting algorithms".
- [ ] Fine payment (needs a student with a fine, e.g. let a reservation expire):
      Pay → SSLCommerz sandbox test card → result page shows **Payment
      Confirmed** and the fine drops.
      - Sandbox test card numbers are in the SSLCommerz developer docs
        (developer.sslcommerz.com → test environment).
- [ ] Student portal: **Continue as Guest**. Browse works, and personal pages say "Sign in…".

## Local development after deploying

Your local `.env` files keep their **localhost** values. Production values live
only in Render/Vercel, so there's nothing to switch back and forth.
