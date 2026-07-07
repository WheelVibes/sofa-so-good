# Packaging for Android (APK)

Sofa So Good ships an Android build via **[Capacitor](https://capacitorjs.com/)** — it wraps the
built web app (`dist/`) in a native Android WebView and produces an installable **APK**. This is
the counterpart to the Electron desktop shell; both consume the same self-contained web bundle.

## Why Capacitor (not TWA/Bubblewrap)

The goal is an APK you can **sideload onto a phone for testing**. Capacitor bundles `dist/`
*inside* the APK, so the app runs fully offline with no dependency on a live HTTPS origin or
[Digital Asset Links](https://developer.android.com/training/app-links/verify-android-applinks)
verification. A Trusted Web Activity (Bubblewrap) would be smaller but requires the app to be
online and pointed at the deployed PWA, plus asset-link setup — more friction for test builds.
Capacitor also mirrors the existing Electron shell almost exactly (both want a relative-base,
service-worker-free bundle), so there's one mental model for "wrap the web app".

## The build recipe

`scripts/build-mobile.mjs` (run via `npm run build:mobile`) does three things, mirroring
`scripts/build-desktop.mjs`:

1. `npm run build` with **`VITE_BASE=./`** (relative asset URLs for Capacitor's
   `https://localhost` scheme) and **`VITE_DISABLE_PWA=1`** (no service worker — the native shell
   already bundles every asset; a SW inside a wrapper only causes stale-cache pain).
2. `scripts/make-android-icons.mjs` — renders `public/favicon.svg` (the single icon source of
   truth, via `sharp`) into the Android launcher icons: legacy square/round mipmap PNGs + the
   adaptive-icon foreground PNGs, and writes the adaptive-icon background colour
   (`#2c2f33`, the favicon's field) to `values/ic_launcher_background.xml`.
3. `npx cap sync android` — copies `dist/` into `android/app/src/main/assets/public/` and updates
   the native project.

`capacitor.config.ts` sets `appId: 'sg.sofasogood.app'` (shared with `electron-builder.yml`),
`appName: 'Sofa So Good'`, `webDir: 'dist'`, and deliberately leaves `server` unset so the
bundled assets are used.

## Building the APK

> **The APK is built on CI, not in this repo's sandbox / most CLI dev shells.** Compiling it needs
> the Android SDK + Google-Maven dependencies, whose download hosts (`dl.google.com`) are blocked
> in the agent sandbox. So the canonical build runs on a GitHub-hosted runner, which ships the
> Android SDK. To build locally you need the full Android toolchain (below).

### Option A — GitHub Actions (recommended, no local setup)

Workflow: **`.github/workflows/android-apk.yml`**.

1. GitHub → **Actions** tab → **Android APK (debug)** → **Run workflow**. (It also runs on pushes
   to the `claude/android-apk-build-export-*` branch.)
2. The job sets up Node 24 + JDK 21 + Android SDK 36, runs `npm ci` → `npm run build:mobile` →
   `cd android && ./gradlew assembleDebug`, then uploads the APK.
3. When it goes green, open the run → **Artifacts** → download **`sofa-so-good-debug-apk`**
   (contains `app-debug.apk`).

### Option B — local build

Requires the Android SDK (via [Android Studio](https://developer.android.com/studio) or
command-line tools), a JDK 21, and `ANDROID_HOME`/`ANDROID_SDK_ROOT` set.

```bash
npm run build:mobile                 # build web + icons + cap sync
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

Or open the `android/` folder in Android Studio and **Build → Build APK(s)** / run on a device.

## Installing on a phone

The debug APK is auto-signed with the Android debug key, so it's directly sideloadable:

```bash
adb install app-debug.apk            # phone connected with USB debugging on
```

Or copy `app-debug.apk` to the phone and open it (enable "Install unknown apps" for your file
manager/browser when prompted).

## Notes & conventions

- **Debug only.** These are unsigned-for-release, test builds. A Play Store / release APK would
  need a keystore + signing config (`android/app/build.gradle` `signingConfigs`) supplied as CI
  secrets — out of scope for testing.
- **Version.** Keep `android/app/build.gradle` `versionName` in sync with `APP_VERSION`
  (`src/version.ts`), the same way `package.json` mirrors it. Bump `versionCode` when you need
  distinct installable builds.
- **Not a feature flag.** Android packaging is build tooling (like the Electron `dist:desktop`
  target, Docker, and the service worker), not an in-app user-facing surface, so it has no
  `FEATURE_FLAGS` entry.
- **iOS** is not set up. Capacitor could target it too, but that produces an `.ipa` (not an APK)
  and requires macOS + Xcode + an Apple signing identity.
- **The `android/` project is committed** (Capacitor convention — it's an editable native
  project). Build outputs (`android/app/build/`, `.gradle/`, the copied `assets/public/`,
  generated `capacitor.config.json`) are git-ignored by Capacitor's generated `.gitignore`.
