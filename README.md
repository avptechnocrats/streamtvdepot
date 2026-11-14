# SignalView Mobile — End-User OTT App

React Native 0.74 white-label OTT app for Android and iOS.  
Single codebase, one build per client (tenant), separate Play Store / App Store listings.

---

## Tech Stack

| Layer | Library |
|---|---|
| Framework | React Native 0.74 (CLI, bare — no Expo) |
| Navigation | React Navigation 6 (native stack + bottom tabs) |
| Video player | react-native-video 6 (HLS · DASH · SmoothStreaming · Widevine · FairPlay) |
| Secure storage | react-native-keychain (iOS Keychain · Android Keystore) |
| State | Zustand |
| Data fetching | TanStack Query v5 |
| HTTP | Axios (two clients: public + authenticated) |
| Client config | react-native-config (`.env` injected at build time) |

---

## Project Structure

```
Mobile/
├── active-client             # One-line file: name of the currently active tenant folder
├── clients/                  # One folder per tenant
│   ├── signalview/           # SignalView tenant
│   │   ├── config.json       # Build metadata only: androidPackage, bundleId, store listing names
│   │   ├── .env              # Runtime config (react-native-config): slug, name, colors, API URL
│   │   ├── ios.xcconfig      # iOS bundle ID + display name override
│   │   └── logo.png          # Tenant logo (bundled in app binary)
│   ├── kalingotv/            # KalingoTV tenant (same structure)
│   └── _template/            # Copy this to add a new tenant
├── scripts/
│   ├── switch-client.sh      # Shared: copies .env + logo to project root
│   ├── run-android.sh        # Dev: reads active-client, switches env, runs react-native
│   └── build.sh              # CI/Release: builds APK, AAB, or iOS archive for any tenant
├── src/
│   ├── api/                  # Axios clients (publicApiClient + apiClient)
│   ├── config/               # clientConfig.ts — runtime tenant values
│   ├── components/           # Shared UI + OTT content widgets
│   ├── hooks/                # TanStack Query hooks
│   ├── navigation/           # Auth stack · Main tabs · Root stack
│   ├── screens/              # All app screens
│   ├── services/             # API service modules (one file per domain)
│   ├── store/                # Zustand stores (auth, player)
│   ├── theme/                # colors.ts — client primary color injected here
│   └── types/                # Shared TypeScript models
├── android/                  # Android native project (Gradle)
│   └── app/build.gradle      # Product flavors (one per tenant)
├── ios/                      # iOS native project (Xcode)
│   └── SignalView.xcodeproj
├── assets/
│   └── logo.png              # Active tenant logo (written by switch-client.sh)
├── .env                      # Active tenant env (written by switch-client.sh)
├── app.json                  # { "name": "SignalView", "displayName": "SignalView" }
├── babel.config.js
├── metro.config.js
└── tsconfig.json
```

---

## API Architecture

All tenants share one central SaaS API. The `slug` identifies the tenant.

```
Central API:  https://console.signalview.tech/api/v1

publicApiClient → /public/{endpoint}?slug={CLIENT_SLUG}
                  Home rows, videos, categories, plans, site settings, live TV

apiClient       → /auth/user/{endpoint}  (Bearer token)
                  Watchlist, subscriptions, transactions, account, tickets, DRM

Auth calls      → /auth/user/login|signup|forgot-password
                  { ...payload, client_slug: "{CLIENT_SLUG}" } in request body
```

---

## Prerequisites

- **Node.js** ≥ 18
- **Watchman** — `brew install watchman`
- **Android Studio** with Android SDK (API 34)
- **Xcode** 15+ with Command Line Tools (macOS only)
- **CocoaPods** — `sudo gem install cocoapods`
- **Ruby** ≥ 2.7 (for Gemfile / CocoaPods)

---

## First-Time Setup

```bash
cd Mobile

# 1. Install JS dependencies
npm install

# 2. iOS: install native pods (links react-native-video, react-native-keychain, etc.)
cd ios && pod install && cd ..
```

---

## Running in Development

### Step 1 — Set the active tenant

Edit the `active-client` file (single word, matches the folder name under `clients/`):

```bash
echo 'signalview' > active-client   # default tenant
echo 'kalingotv'  > active-client   # switch to KalingoTV
```

You can also comment/uncomment lines to switch tenants:
```
# signalview
kalingotv
```

### Step 2 — Run on device / simulator

**Android**
```bash
# Starts Metro + builds + installs on connected device in one command.
# Reads active-client, copies .env + logo, then runs with the correct Gradle flavor and appId.
npm run android
```

> Metro starts automatically. Run `npm run start` separately only if you want
> Metro logs in a dedicated terminal window — then add `--no-packager` to your run command.

**iOS**
```bash
# Switch the tenant env first (iOS does not auto-read active-client yet)
./scripts/switch-client.sh signalview   # copies .env + logo

# Then run on simulator (also starts Metro automatically)
npm run ios

# Specific simulator
npx react-native run-ios --simulator="iPhone 15 Pro"
```

---

## Building for Release

All build commands read the active tenant from `active-client` automatically.
Set the tenant once, then run any command.

```bash
# 1. Set the target tenant
echo 'kalingotv' > active-client
```

### Android — APK / AAB

```bash
# Debug APK — install directly on a device for QA / testing
npm run apk:debug

# Release APK — sideload or distribute outside the Play Store
npm run apk:release

# Release AAB — required format for Play Store submission
npm run aab:release
```

Outputs:
- APK: `android/app/build/outputs/apk/<flavor>/<buildType>/*.apk`
- AAB: `android/app/build/outputs/bundle/<flavor>release/*.aab`

> **Signing**: Replace `debug.keystore` in `android/app/` with your release keystore.
> Update `signingConfigs.release` in `android/app/build.gradle` accordingly.

### iOS — Archive for App Store

```bash
# Build .xcarchive ready for App Store Connect upload
# (pass the tenant slug explicitly — iOS builds do not read active-client yet)
./scripts/build.sh signalview ios release
./scripts/build.sh kalingotv ios release

# Export the IPA from the archive:
xcodebuild -exportArchive \
  -archivePath /tmp/SignalView-signalview.xcarchive \
  -exportOptionsPlist ios/ExportOptions.plist \
  -exportPath /tmp/SignalView-signalview-ipa
```

> **iOS bundle ID**: Each tenant's xcconfig sets `PRODUCT_BUNDLE_IDENTIFIER`.
> Configure this in Xcode: Project → Info → Configurations → add xcconfig file per configuration,
> or pass it directly to `xcodebuild` via `-xcconfig clients/<slug>/ios.xcconfig`.

---

## Adding a New Tenant

```bash
# 1. Copy the template
cp -r clients/_template clients/newclient

# 2a. Edit .env — runtime values baked into the app bundle by react-native-config
#     CLIENT_SLUG      = tenant slug sent to the API (e.g. my-client)
#     APP_NAME         = display name shown by the OS
#     PRIMARY_COLOR    = primary brand colour (hex)
#     PRIMARY_STRONG_COLOR = lighter brand variant (hex)
#     API_BASE_URL     = backend URL (leave as-is for production)
#     BUNDLE_ID        = native bundle identifier (e.g. com.newclient.mobile)

# 2b. Edit config.json — build metadata read only by scripts, never in the app
#     androidPackage       = Android applicationId (e.g. com.newclient.mobile)
#     bundleId             = iOS bundle ID (same value as BUNDLE_ID in .env)
#     playStoreListingName = Play Store app name
#     appStoreListingName  = App Store app name

# 2c. Edit ios.xcconfig — iOS-specific build overrides
#     PRODUCT_BUNDLE_IDENTIFIER = com.newclient.mobile
#     APP_DISPLAY_NAME          = NewClient

# 2d. Drop the tenant logo
#     clients/newclient/logo.png  (copied to assets/logo.png by switch-client.sh)

# 3. Register the Android Gradle flavor in android/app/build.gradle:
#
#    a. Add to project.ext.envConfigFiles (maps flavor → .env file):
#       newclientdebug:   "../clients/newclient/.env"
#       newclientrelease: "../clients/newclient/.env"
#
#    b. Add to react { debuggableVariants }:
#       "newclientDebug"
#
#    c. Add to productFlavors:
#       newclient {
#           dimension "client"
#           applicationId "com.newclient.mobile"   // must match androidPackage in config.json
#           resValue "string", "app_name", "NewClient"
#       }

# 4. Set as active and test
echo 'newclient' > active-client   # activate the new tenant
npm run android                    # dev build with Metro hot-reload
npm run apk:debug                  # debug APK for device testing
```

---

## App Features

| Feature | Status |
|---|---|
| Login / Signup / Forgot password | ✅ |
| Secure token storage (Keychain / Keystore) | ✅ |
| Token auto-refresh on 401 | ✅ |
| Home — hero banner + content rails | ✅ |
| Movies / TV Shows grid | ✅ |
| Categories browse | ✅ |
| Content detail + play gate (free / subscription / PPV / rental) | ✅ |
| HLS / DASH / SmoothStreaming playback | ✅ react-native-video |
| Widevine (Android) + FairPlay (iOS) DRM | ✅ |
| Resume playback (server sync + local cache) | ✅ |
| OTT analytics (quartiles, QoS, ABR events) | ✅ |
| Watchlist (add / remove) | ✅ |
| Subscription history | ✅ |
| Transactions | ✅ |
| Account profile | ✅ |
| Change password | ✅ |
| Help & support tickets | ✅ |
| Subscription / pricing / checkout | ✅ |
| White-label per tenant (logo, colors, bundle ID) | ✅ |

---

## Environment Variables (`.env`)

All clients use the **same central API** — only the slug changes.

```bash
# Which tenant this build serves
CLIENT_SLUG=signalview

# App name shown by the OS
APP_NAME=SignalView

# Central SaaS API — same for all tenants
# Change only for dev/staging environments
API_BASE_URL=https://console.signalview.tech/api/v1

# Brand colours (hex)
PRIMARY_COLOR=#f4b844
PRIMARY_STRONG_COLOR=#ffcf6c

# Native bundle identifier
BUNDLE_ID=com.signalview.mobile
```

> Do **not** commit `.env` to version control. It is generated by `switch-client.sh`.
> Each tenant's source of truth lives in `clients/<slug>/.env`.

---

## Troubleshooting

**Metro cache issues**
```bash
npm run start -- --reset-cache
```

**iOS pod issues**
```bash
cd ios && pod deintegrate && pod install
```

**Android Gradle cache**
```bash
cd android && ./gradlew clean
```

**react-native-config not picking up .env**  
Run `npm run start -- --reset-cache` after any `.env` change. On Android, a clean
Gradle build is required for native env vars to update.

