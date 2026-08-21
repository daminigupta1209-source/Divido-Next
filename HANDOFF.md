# Divido-Next — Handoff

Next.js / React + Vite expense-splitting PWA. Backend: Supabase. Deploy: push to `main` → Vercel auto-deploys.

## Rules for the assistant
1. **Code only.** Do NOT connect to, read, or write the Supabase database. No DB scripts/queries. My data is fine — don't touch or reset it.
2. **One task at a time.** After each change, show what changed and STOP for my confirmation.
3. **Don't touch friends / members / pending-invite logic** unless I explicitly ask about a specific thing.
4. **If stuck / a task drags or fails, STOP and tell me** — don't retry in a loop.
5. Verify every change with `npm run build` (runs `tsc -b && vite build`) — a failed build silently leaves the old version live on Vercel.
6. Push straight to `main` (I don't use preview links). Compensate with careful build + logic verification.

## Current state (all pushed to main, latest commit 233e4c0)
Everything below is live on Vercel.

### Fixed this session
- **Group-switch 0ms performance fix** — removed `selectedId` from load and realtime effect dependency arrays in `src/hooks/useSupabaseSync.ts`. Group switching is now 0ms instant and no longer triggers unnecessary network re-fetches or destroys/re-creates WebSocket channels.
- **Core type safety & `any`-cleanup** — defined `GlobalSettleData` and `ConfirmState` interfaces in `src/lib/types.ts`. Replaced loose `any` usages with strict types in `src/App.tsx`, `src/components/FriendsView.tsx`, `src/components/MasterSummary.tsx`, `src/components/Profile.tsx`, `src/components/Sidebar.tsx`, `src/components/GroupGallery.tsx`, and `src/hooks/useExpenseForm.ts`.
- **Native Capacitor setup** — configured `androidScheme: 'https'` in `capacitor.config.ts`, added Camera & Storage permissions in `android/app/src/main/AndroidManifest.xml`, verified production build (`npm run build`), and synced native assets (`npx cap copy`).
- **Balance "phantom people" / hyphen-name bug** — extracted one shared `computeRawPairwiseTransactions()` in `src/lib/calculations.ts` and replaced 4 duplicated copies.
- **Error boundary** — `src/components/ErrorBoundary.tsx` wraps the app.
- **Performance** — memoized heavy balance calcs in `MasterSummary` and `FriendsView`.
- **NaN / null-amount hardening** — coerced `amt` in the calc engine; replaced crash-prone `parseFloat(e.amt.toString())` with `(Number(e.amt) || 0)`.
- **Same-name person prompt** — added ✕, backdrop-tap cancels, and back-swipe dismisses.
- **Net-balance card color unified** — pay `#DB2777`, collect `#10B981`.
- **Scanner flow & SW Cache** — scanner close fix and SW cache bumped.

## Known non-code issue (do NOT keep trying to fix in code)
- **Android autofill bar** (dark key/card/pin bar over inputs): OS Google-Autofill service triggered by "name" fields. Unfixable from web code. Native Capacitor build now available to disable autofill or build native APK.

## Gotchas
- PWA stale cache causes many "not working after deploy" reports. Fix: bump `CACHE` in `public/sw.js`; on device, fully close & reopen (or clear cache once). Always give Vercel ~1–2 min.
- Member names render capitalized via CSS (e.g. "didi" → "Didi").
