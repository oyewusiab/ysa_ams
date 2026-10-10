# Vercel Deployment Guide — YSA AMS

## 1. Overview
The Abeokuta Nigeria Obantoko Stake YSA Attendance Management System is architected to deploy as a modern static Single Page Application (SPA) on **Vercel**, connecting directly to Supabase.

---

## 2. Configuration & Repository Connection

1. Push the code to the GitHub repository:
   `https://github.com/oyewusiab/ysa_ams`
2. Log in to [Vercel](https://vercel.com).
3. Click **Add New... > Project**.
4. Import the repository `oyewusiab/ysa_ams`.
5. In **Framework Preset**, select **Vite**.
6. Set **Root Directory** to `./`.

---

## 3. Environment Variables Configuration

In Vercel Project Settings > **Environment Variables**, provide:

| Variable Name | Environment | Value | Description |
| :--- | :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Production, Preview, Dev | `https://pueehzvrdlaybrnnzakg.supabase.co` | Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | Production, Preview, Dev | `your-actual-publishable-key` | Public anon/publishable key |

> ⚠️ **CRITICAL WARNING**: Never add `SUPABASE_SERVICE_ROLE_KEY` or database passwords to Vercel environment variables for this static frontend.

---

## 4. SPA Routing & Security Headers (`vercel.json`)
The committed `vercel.json` ensures:
- Single Page App client routing rewrites: `/(.*) -> /index.html` (prevents 404s upon page reload).
- Security headers:
  - `X-Frame-Options: DENY` (anti-clickjacking)
  - `X-Content-Type-Options: nosniff` (anti-MIME sniffing)
  - `X-XSS-Protection: 1; mode=block`
  - `Referrer-Policy: strict-origin-when-cross-origin`

---

## 5. Post-Deployment Verification Checklist

- [ ] Open the deployed production URL on desktop and mobile.
- [ ] Confirm the green-and-white stake theme renders cleanly.
- [ ] Confirm that refreshing a page on any path returns `index.html` without 404.
- [ ] Test login with a valid user.
- [ ] Test password reset request.
- [ ] Verify that unauthorized accounts cannot access `/users` or `/units`.
- [ ] Inspect browser DevTools Network tab to verify that no secret keys are transmitted.
