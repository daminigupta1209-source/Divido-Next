# Android release (Google Play testing)

Signed `.aab` bundles are built by GitHub Actions
([android-release.yml](../.github/workflows/android-release.yml)), so no local
Android SDK is needed.

## One-time setup

1. **Create the upload keystore** (keep the file and passwords safe — losing
   them means asking Google to reset the upload key):

   ```bash
   "/c/Program Files/Java/jdk-16.0.1/bin/keytool" -genkeypair -v -keystore divido-release.jks -alias divido -keyalg RSA -keysize 2048 -validity 10000
   ```

   Store it outside the repo (the repo ignores `*.jks` anyway).

2. **Add repo secrets** (GitHub → Settings → Secrets and variables → Actions):

   | Secret | Value |
   | --- | --- |
   | `ANDROID_KEYSTORE_BASE64` | `base64 -w0 divido-release.jks` |
   | `ANDROID_KEYSTORE_PASSWORD` | keystore password |
   | `ANDROID_KEY_ALIAS` | `divido` |
   | `ANDROID_KEY_PASSWORD` | key password (same as keystore unless you chose otherwise) |
   | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | required, same as `.env` |
   | `VITE_GEMINI_API_KEY`, `VITE_SPLITWISE_CLIENT_ID`, `VITE_SPLITWISE_REDIRECT_URI`, `VITE_SENTRY_DSN`, `VITE_PUBLIC_APP_URL` | optional, same as `.env` |

3. **Play Console**: create the app (package `com.dividosplit.app`), keep
   *Play App Signing* on (default), and use `store-assets/play-icon-512.png`
   as the store icon.

## Each release

GitHub → Actions → **Android release** → *Run workflow* (enter a version name),
or push a tag like `android-v0.2.0`. Download the `divido-aab` artifact and
upload it under Play Console → Testing → Internal testing (or Closed testing).
`versionCode` is the workflow run number, so it always goes up.

## Local signed build (optional)

Needs JDK 21 and the Android SDK (e.g. a current Android Studio). Create
`android/keystore.properties` (gitignored):

```properties
storeFile=C:/path/to/divido-release.jks
storePassword=...
keyAlias=divido
keyPassword=...
```

then `npm run build && npx cap sync android && cd android && ./gradlew bundleRelease`.
On Windows, don't commit the `ios/App/CapApp-SPM/Package.swift` change `cap sync`
makes (it writes backslash paths that break the iOS build).
