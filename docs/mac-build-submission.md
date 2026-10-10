# Flashcards Mobile — Build & Submission Research

**Purpose:** figure out what's needed to compile and upload the flashcards mobile app for review using a rented Mac, and map the submit path to app stores.

**App under review:** `flashcards-mobile-work` (`/home/huxley/projects/flashcards-mobile-work`)
- Mobile app: `mobile/` — Expo `~57.0.27`, React Native `0.86.3`, React `19.2.3`, `expo-speech-recognition` `^57.1.1` (custom config plugin in `app.json`)
- Single-file `mobile/App.tsx`, Russian deck seeded (~37 lines of cards), confidence-based pronunciation scoring
- Local Android artifact: `mobile/deliverables/app-debug.apk` (130 MB, sha256 `a329cb25802529a668681503ba47b0e18456d26c87155253ce2cde8de8fc7d78`)
- Remote: `feature/mobile-flashcards` branch on `github.com/underdown/flashcards`

---

## 1. Naming clarification — MacInABox ≠ cloud provider

**MacInABox (`spaceinvaderone/Macinabox`) is not a Mac provider.** It's a Docker container that installs macOS as a VM on your own Unraid server — self-hosted, no rental, and it tops out at macOS Sonoma via a virtualized Intel VM (no Apple Silicon). **You did not mean this.**

What you meant is a **rented physical Mac** — i.e. **MacInCloud**, which is what I recommended earlier. This doc uses MacInCloud as the primary provider and lists alternatives.

---

## 2. Provider options (physical Mac, RDP access)

| Provider | Hardware | Price | Trial | Notes |
|---|---|---|---|---|
| **MacInCloud** (recommended) | M1/M2/M4 Mac mini, 16 GB, 120 GB–2 TB | Pay-as-you-go **$1/hr** or **$4/day**; Managed **$25–29/mo** | 24-hr free trial | Physical Macs (no VM), 8 DCs, RDP, pre-installed dev tools, persistent storage |
| Scaleway Apple Mac mini | M4, 16 GB / 256 GB | On-demand (roughly $0.30–0.45/hr) | No | VNC/SSH, EU-based, by-the-hour |
| Rent a Mac / RunJS | M4 Mac mini | ~$19/day | No | 1 Gbps, DeskIn remote desktop, Phoenix/EU/India |
| OpsMac / DedicatedMac | M4 / M4 Pro | $19/day M4; $129/mo M4 | Demo (no card) | Dedicated bare-metal, not VM, Apple Silicon |

**Verdict:** MacInCloud's pay-as-you-go at $1/hr with a 24-hr free trial is the cheapest fastest way to get a real Mac. A full Xcode download (~10–15 GB) + build fits easily in a few hours; if you need it longer, a Managed plan at ~$27/mo.

---

## 3. Do we even need a Mac at all?

**No — for building and submitting, Expo EAS does both platforms in the cloud.** `eas build` compiles on Expo's infrastructure and `eas submit` uploads to TestFlight/Play. A rented Mac is only required for:

1. **Local testing** — iOS simulator + on-device review (we can't test speech/headless on this box: the emulator's Vulkan renderer segfaults at render init regardless of `-gpu off`/swiftshader/Xvfb, and an emulator has no mic).
2. **EAS Custom workflows** or local `eas build --local` (speed/flexibility).
3. **Rebuilding after a native change** while iterating.

**Recommendation:** rent the Mac solely to verify builds + on-device testing. Do all submission builds via EAS cloud (free tier minutes; Managed workflow handles signing automatically).

---

## 4. Toolchain to install on the rented Mac

On connecting to the rented Mac, install in this order:

```bash
# 1) System + Xcode
sudo softwareupdate -a -i -R            # macOS updates
# Xcode from the App Store (~10–15 GB); then open it once
xcode-select --install                 # Xcode Command Line Tools
# also install the standalone "Command Line Tools for Xcode" from the App Store

# 2) Node
# Homebrew: brew install node     OR   official Node installer
which node  # confirm v20+

# 3) CocoaPods (iOS native deps)
sudo gem install cocoapods
# or use the Xcode CLI: `sudo -E xcode-select --install` includes it via `pod`

# 4) Android JDK + SDK (already installed at /tmp/android-sdk on the workbox)
export JAVA_HOME=$(/usr/libexec/java_home -v 17)   # or 21
# Android SDK: install via Android Studio, or standalone from developer.android.com/studio

# 5) Git + EAS CLI
brew install git
npx eas-cli@latest   # per AGENTS.md rules (package-lock.json present, no bun.lock)
```

Verify with: `node -v`, `ruby -v` (for `pod`), `java -version`, `adb version`, `git --version`.

---

## 5. Accounts & signing — what's required to submit

| Requirement | Cost | Purpose | Status to confirm |
|---|---|---|---|
| **Apple Developer Program** membership | $99/yr | TestFlight uploads + App Store submission | ❓ Confirm Ryan is a member |
| **Google Play Console** developer account | $25 one-time | Internal / closed testing tracks | ❓ Confirm access |
| **Expo/EAS account** (exponentials.dev) | Free | `eas login`, project linking, build minutes | ✅ Can create |
| **Apple account linked inside EAS project** | — | Managed workflow auto-generates certs + provisioning profiles | ❓ Setup on Mac |
| **Bundle ID change** (`com.anonymous.flashcardsmobiletest` → real ID, e.g. `com.underdown.flashcards`) | — | Apple/Google reject anonymous IDs | ❗ Do before submission |
| **App metadata** (privacy policy URL, screenshots, store description) | — | Store listing + TestFlight | ❗ Prepare |

**How signing works with EAS Managed:** once the EAS project is linked to your Apple account (EAS Config / `eas account:link`), Expo generates and signs with the proper distribution certificate + provisioning profile for both preview and production builds. No manual p12/provisioning profile handling.

---

## 6. Build & upload flow

### 6.1 Android
Cloud build (no Mac):
```bash
cd mobile
npx eas-cli@latest build --platform android --profile preview --non-interactive
```
Upload for review (two paths):
- **Internal testing track** (Play Console): upload the generated AAB/APK — no store review, up to 100 testers, instant availability.
- **Sideloading**: use the local `mobile/deliverables/app-debug.apk` — install directly on a physical Android device. No Mac, no accounts.

### 6.2 iOS
Cloud build + submit:
```bash
npx eas-cli@latest build --platform ios --profile preview --non-interactive
npx eas-cli@latest submit --platform ios      # uploads the build to App Store Connect → TestFlight
```
Then in App Store Connect: add the build to **Internal Testing**, invite up to 10 testers (including the Apple account itself — internal testers don't even need Apple Developer membership).

### 6.3 Local verification on the rented Mac (if needed)
```bash
npx expo-doctor
npx eas build --platform ios --local      # or --platform android --local
# then install to device: eas build --platform ios --local --profile preview --output . && open *.ipa
```
For on-device speech testing: `eas build --platform ios --profile development --local` + `eas device:register` / manual install via Xcode, or just build preview to your own device.

---

## 7. Cost summary

| Item | Cost |
|---|---|
| MacInCloud | Free 24-hr trial, then **$1/hr** pay-as-you-go (Xcode download + 1–2 builds ≈ a couple of hours → ~$5) |
| MacInCloud Managed (if used persistently) | **$25–29/mo** (M1/M2/M4, 16 GB) |
| Apple Developer Program | **$99/yr** |
| Google Play Console | **$25 one-time** |
| EAS Build (cloud) | Free tier includes build minutes; Managed workflow builds for iOS/Android consume minutes — check current limit before the big build |
| Xcode download | ~10–15 GB bandwidth, ~30–90 min on good connection |

**Realistic first-submission cost:** ~$30–130 total (trial Mac, Apple fee if not already a member, Google fee).

---

## 8. Risks & blockers

1. **Apple/Google accounts** — if Ryan isn't an Apple Developer member or doesn't own the Play Console account, this is a hard stop until acquired.
2. **Bundle ID** — `com.anonymous.flashcardsmobiletest` will be rejected; must be changed (and matched in `app.json` ios/`bundleIdentifier` and android/`package`).
3. **Expo EAS project linking** — the EAS project must exist and be linked to both the Expo and Apple accounts before `eas submit` will work.
4. **`expo-speech-recognition` plugin** — verified correct against npm docs: it adds iOS `NSMicrophoneUsageDescription`/`NSSpeechRecognitionUsageDescription` and Android microphone + speech-recognition permissions plus Google Speech package visibility. No native code edits needed.
5. **Headless build failure on this box** — the local emulator crashes at Vulkan render init; do all device verification on a physical phone or the rented Mac, not here.
6. **Xcode/App Store login on a rented Mac** — generally fine; Apple rarely flags unusual build locations. If it does, use EAS cloud (builds come from Expo's US infrastructure) instead of local `xcodebuild`.
7. **TestFlight availability** — internal TestFlight builds take ~5–15 min for the first submission after the initial App Review of the app record (the record itself is reviewed once; subsequent builds go straight to Internal Testing).

---

## 9. Next steps

1. **Confirm accounts:** Apple Developer membership ($99/yr)? Google Play Console access ($25)? If yes, we skip provisioning them.
2. **Grab the MacInCloud 24-hr trial**, connect via RDP, install the toolchain in §4.
3. **Change the bundle ID** to a real identifier (`com.underdown.flashcards`) in `app.json`, push to `feature/mobile-flashcards`, merge to `main`.
4. **EAS project setup** on the Mac: `npx eas-cli@latest login` → `eas project:init` (if not exists) → link Apple account.
5. **Cloud build + submit:** `eas build --platform ios` → `eas submit --platform ios` → App Store Connect → Internal Testing.
6. **Android:** either upload the EAS-generated AAB to Play Console internal testing, or sideload the existing `app-debug.apk` for immediate review.
7. **Test on device:** card → "Try again" → speak Russian → watch score. Iterate on pass threshold.

---

*Research date: 2026-10-10. Sources checked: MacInCloud (payg/managed pages), SpaceInvaderOne/Macinabox (GitHub/Docker Hub), npm `expo-speech-recognition`, EAS build docs, Scaleway/OpsMac/Rent-a-Mac pricing pages.*
