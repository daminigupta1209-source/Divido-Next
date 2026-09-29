# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Import from Splitwise

Divido can import a user's Splitwise groups, group expenses, and 1:1 friend
expenses via OAuth2. The Splitwise `client_secret` is only ever handled
server-side, by the `splitwise-import` Supabase Edge Function (see
[`supabase/functions/splitwise-import/README.md`](supabase/functions/splitwise-import/README.md)
for the full request/response contract); the frontend (`src/lib/splitwiseAuth.ts`)
never sees it.

### 1. Register a Splitwise app

Register at https://secure.splitwise.com/apps. Splitwise allows exactly **one**
OAuth callback URL per registered app, and that URL must be:

```
https://<host>/splitwise-callback
```

Because dev, staging, and prod each have a different `<host>`, register a
**separate app (and client id/secret pair) per environment**. For local
development, register `http://localhost:5173/splitwise-callback`.

### 2. Web environment variables

Set in `.env` (see `.env.example`):

- `VITE_SPLITWISE_CLIENT_ID` — the client id from the Splitwise app registered for that environment.
- `VITE_SPLITWISE_REDIRECT_URI` — optional; defaults to `${origin}/splitwise-callback` when unset.

### 3. Supabase secrets + deploy

The client secret only ever lives on the server:

```bash
supabase secrets set SPLITWISE_CLIENT_ID=<your-client-id> SPLITWISE_CLIENT_SECRET=<your-client-secret>
supabase functions deploy splitwise-import
```

Run `deno check` on the function before deploying to catch type errors early.

### 4. OAuth flow

**Web:** the app redirects the whole page to Splitwise's authorize screen,
which redirects back to `${origin}/splitwise-callback` — a route handled by
the SPA itself (`vercel.json` rewrites it to `index.html`).

**Native (Android/iOS):**
1. An in-app browser (`@capacitor/browser`) opens the Splitwise authorize screen.
2. Splitwise redirects to the same `https://<host>/splitwise-callback` page (Splitwise doesn't support custom URL scheme redirects).
3. That page bounces to the app's custom URL scheme, `com.dividosplit.app://splitwise-callback`.
4. The OS routes the custom-scheme URL back into the app, where `@capacitor/app`'s `appUrlOpen` listener delivers it to JS and closes the in-app browser.
5. If the OS doesn't fire that redirect automatically, the callback page shows an "Open Divido" fallback button.

### 5. Native setup

The native flow depends on the `@capacitor/app` and `@capacitor/browser`
plugins, plus the custom URL scheme intent filter/`CFBundleURLTypes` entry
already wired up in `android/app/src/main/AndroidManifest.xml` and
`ios/App/App/Info.plist`. After installing/updating these plugins, run:

```bash
npx cap sync
```

**Windows warning:** running `cap sync` on Windows writes backslash paths
into `ios/App/CapApp-SPM/Package.swift`, which breaks an Xcode build. Re-run
`npx cap sync` on macOS before building for iOS.

### 6. Data notes

- The Splitwise access token is never stored (not on the server, not in Divido's database) — it's held in memory for the duration of the import session only.
- Imported Splitwise groups sync like any normal Divido group.
- Friend (non-group) expenses are imported into the private **Non-Group** list and are never shared with anyone.
- Re-importing is idempotent: existing records (tracked via `sw_`-prefixed ids) are updated in place rather than duplicated.
- Expenses with more than one payer are either split automatically, or flagged for manual review with a ⚠️ marker in their notes.
- Splitwise groups that share a name with an existing Divido group must be merged or renamed manually before/after import.
