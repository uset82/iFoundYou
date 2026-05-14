# Mesh Guardian — Architecture & Strategy

> **Companion file:** [`mesh-guardian-tasks.md`](./mesh-guardian-tasks.md) — the operational checklist with every actionable task. Read this file once to understand the architecture; track work in tasks.md.

## Overview

Extend **iFoundYou's Discover view** so connected app users can chat with each other in real time, then evolve the chat layer into a **Mesh Guardian** survival messenger that works offline and falls back to Meshtastic LoRa mesh networks when the internet disappears.

This plan reuses the existing iFoundYou stack rather than building a new Next.js project:

- **Frontend:** Vite + React + TypeScript (existing)
- **Backend:** Supabase (Postgres + Realtime + Auth) + Netlify Functions (existing)
- **Realtime:** Supabase Realtime (replaces Socket.IO/WebSocket for v1)
- **Offline:** IndexedDB
- **Mesh:** [Meshtastic JS](https://github.com/meshtastic/js) packages (`@meshtastic/core`, `@meshtastic/transport-web-bluetooth`, `@meshtastic/transport-http`)
- **iOS:** Three-tier strategy — Safari PWA (works today), React Native native app (`mobile/` workspace, already scaffolded with `react-native-ble-plx`), and Apple Multipeer Connectivity bridge for off-grid peer-to-peer without any hardware

---

## Architecture

```
iFoundYou Web App
│
├── Discover Chat (Phase 0–1)
│   ├── Peer list with online/offline + distance
│   ├── Real-time 1-on-1 chat (Supabase Realtime)
│   └── Group rooms
│
├── Offline Layer (Phase 2)
│   ├── IndexedDB storage (messages, outbox, metadata)
│   ├── Network status detection
│   └── Auto-sync on reconnect
│
├── Emergency Protocol (Phase 3)
│   ├── Quick action buttons (SAFE / HELP / WATER / FOOD / MEDICAL / DANGER)
│   ├── Compressed short-text format
│   ├── Priority levels
│   └── Channel selector
│
├── Mesh Layer (Phase 4–5)
│   ├── @meshtastic/transport-web-bluetooth
│   ├── @meshtastic/transport-http (ESP32)
│   └── Protobuf encode/decode
│
├── Transport Manager (Phase 6–7)
│   ├── InternetTransport (Supabase)
│   ├── BluetoothMeshTransport
│   ├── HttpMeshTransport
│   ├── Priority + fail-over
│   └── Bridge mode
│
├── Groups & Channels (Phase 8)
│   ├── Family / Neighborhood / Medical / Security / Broadcast
│   ├── QR invitations
│   └── Emergency contacts
│
├── PWA Polish (Phase 9, 11)
│   ├── Manifest + service worker
│   ├── iOS Add-to-Home-Screen tutorial
│   └── Safe-area + 100dvh handling
│
└── Native iOS (Phase 12–13)
    ├── React Native WebView wrapper
    ├── BLE bridge (react-native-ble-plx)
    └── Apple Multipeer Connectivity
```

### Connection Modes

1. **Internet Mode** — User → Web App → Supabase → Other Users
2. **Local Mesh Mode** — User → Web App → Meshtastic Node → LoRa → Other Users
3. **Bridge Mode** — Internet User → Supabase → Gateway User → Meshtastic Mesh

### Platform Strategy

| Platform | Internet Chat | Offline (IndexedDB) | Mesh (BLE) | Mesh (Wi-Fi/HTTP) | Mesh (Multipeer) |
|----------|---------------|---------------------|------------|--------------------|--------------------|
| Android Chrome | ✓ | ✓ | ✓ Recommended | ✓ Fallback | ✗ |
| Desktop Chromium | ✓ | ✓ | ✓ Recommended | ✓ Fallback | ✗ |
| **iOS Safari (PWA)** | ✓ | ✓ | ✗ Browser limit | ✓ **Recommended** | ✗ |
| **iOS Native App** | ✓ | ✓ | ✓ **via `react-native-ble-plx`** | ✓ | ✓ **iPhone↔iPhone off-grid** |
| Android Native App (later) | ✓ | ✓ | ✓ | ✓ | — |

### iOS Strategy (Three Tiers)

To make sure iPhone and iPad users can use Mesh Guardian, we ship three complementary iOS paths instead of betting on just one:

**Tier 1 — Safari PWA** ([Phase 11 in tasks.md](./mesh-guardian-tasks.md#phase-11---ios-safari-pwa)) — Works on every iPhone today with no app install. iOS Safari supports the entire web app: real-time chat, IndexedDB offline storage, Web Push (iOS 16.4+ when installed to home screen), GPS, and Wi-Fi/HTTP connection to ESP32 Meshtastic nodes. The user gets everything except direct Bluetooth pairing with LoRa hardware. Estimated coverage: ~95% of iPhone users.

**Tier 2 — React Native Native App** ([Phase 12 in tasks.md](./mesh-guardian-tasks.md#phase-12---ios-native-app)) — The repo already has a `mobile/` workspace with `react-native-ble-plx` installed. We embed the same web bundle in a `WKWebView`, then expose native BLE + push + background location via a JS↔Native bridge. The user gets full Meshtastic LoRa BLE pairing, native push notifications, and App Store presence. Estimated coverage: power users + emergency responders.

**Tier 3 — Apple Multipeer Connectivity** ([Phase 13 in tasks.md](./mesh-guardian-tasks.md#phase-13---ios-multipeer-connectivity)) — When the native app is installed, two iPhones can chat off-grid via Apple's built-in Wi-Fi Direct + Bluetooth peer-to-peer framework, NO LoRa hardware required. Range is shorter (~30–100 m) but no extra device needed. Combined with users who DO have a LoRa device, those users become bridges and extend the mesh.

**Result:** iPhone users get internet chat + offline + ESP32 Wi-Fi mesh on day one through Safari (Tier 1). When they want true peer-to-peer mesh without buying hardware, they install the native app and get Multipeer (Tier 3). When they want long-range LoRa mesh, they pair a Meshtastic device via the native app (Tier 2).

---

## File Structure (New Files)

```
web/src/
├── lib/
│   ├── chat/
│   │   ├── realtimeChat.ts          # Supabase Realtime wrapper
│   │   ├── messageStore.ts          # IndexedDB layer
│   │   ├── TransportManager.ts      # Unified transport switcher
│   │   ├── useNetworkStatus.ts      # Online/offline hook ✓ done
│   │   ├── useUnreadCounts.ts       # Per-peer unread badge ✓ done
│   │   ├── useTypingIndicator.ts    # Realtime typing presence ✓ done
│   │   ├── compressor.ts            # Emergency-message compression
│   │   └── platform.ts              # iOS / Android / Desktop detection ✓ done
│   └── mesh/
│       └── transports/
│           ├── MeshTransport.ts          # Interface
│           ├── BluetoothMeshTransport.ts # Web Bluetooth (Android/Desktop)
│           ├── HttpMeshTransport.ts      # Wi-Fi to ESP32 (all platforms)
│           ├── InternetTransport.ts      # Supabase
│           ├── MultipeerTransport.ts     # iOS native app only (via bridge)
│           └── NativeBleTransport.ts     # iOS native app only (via bridge)
└── components/
    └── MeshGuardian/
        ├── QuickButtons.tsx           # SAFE / HELP / WATER / etc.
        ├── EmergencyComposer.tsx      # Compact input + priority + channel
        ├── ChannelManager.tsx         # Create/join/leave
        ├── QRInviteModal.tsx          # Generate + scan QR
        ├── TransportIndicator.tsx     # Status pill
        ├── MeshConnectModal.tsx       # BLE/HTTP picker
        ├── NetworkStatusBar.tsx       # Online/Offline/Emergency badge ✓ done
        └── IosInstallTutorial.tsx     # "Add to Home Screen" walkthrough ✓ done

web/public/
├── manifest.webmanifest                ✓ done
├── apple-touch-icon-180.png
├── apple-touch-icon-167.png
├── apple-touch-icon-152.png
├── apple-splash-*.png                  # Generated splash screens
└── icons/                              # PWA icons (192, 512, maskable)

web/index.html                          ✓ Apple meta tags + manifest done

mobile/                                 # React Native iOS app (already scaffolded)
├── App.tsx                             # Embeds the web bundle in WKWebView
├── ios/
│   ├── MultipeerBridge.swift           # NEW — Apple Multipeer Connectivity
│   ├── BleBridge.swift                 # NEW — bridges react-native-ble-plx events
│   └── Info.plist                      # + permissions strings
└── src/
    ├── lib/
    │   ├── nativeBridge.ts             # JS side of WKScriptMessageHandler
    │   └── meshtasticProtobuf.ts
    └── screens/
        └── WebBridgeScreen.tsx          # Hosts the WebView

netlify/functions/
└── mesh-bridge.ts                      # Bridge endpoint for gateway users

supabase/
├── schema-chat.sql                     # New chat tables
└── rls-chat.sql                        # RLS policies
```

---

## Reference Links

- Meshtastic organization: <https://github.com/meshtastic>
- Meshtastic Web Client / JS Monorepo: <https://github.com/meshtastic/web>
- Meshtastic JS packages: <https://github.com/meshtastic/js>

---

## Open Questions / Decisions

- **Realtime layer:** Supabase Realtime is sufficient for v1 (no separate Socket.IO server needed). Revisit if scale demands it.
- **Database:** Stay on Supabase Postgres rather than introducing a separate PostgreSQL instance.
- **Offline storage library:** Use the `idb` npm package (small, typed wrapper around IndexedDB).
- **Encryption:** Channel keys cover the mesh side. End-to-end encryption between internet users is out of scope for v1 — revisit after MVP.
- **iOS plan:** Three-tier strategy — Safari PWA covers ~95% of iPhone users immediately, native app unlocks BLE LoRa, Multipeer adds peer-to-peer mesh without hardware. The `mobile/` workspace already exists and accelerates Tier 2.
- **App Store risk:** Apple may flag emergency/disaster apps under guideline 5.3 if claims are too strong. Mitigation: position the app as "off-grid messenger" not "life-safety device", include disclaimers, and avoid medical advice features.

---

## Success Criteria

1. Two iFoundYou users can chat 1-on-1 in real time from the Discover view
2. Messages persist across page reloads via IndexedDB on every platform including iOS
3. App switches to **Emergency Mode** automatically when offline
4. Android user can pair a Meshtastic node via Bluetooth and send a SAFE message
5. iPhone Safari user can install the PWA, send messages offline, and connect to an ESP32 mesh node over Wi-Fi
6. iPhone native app user can pair a Meshtastic LoRa device and send a message
7. Two iPhones with the native app can chat off-grid via Apple Multipeer Connectivity
8. Mesh-received messages show up in the same chat thread as internet messages on every platform
9. Cross-platform: iPhone (Safari PWA) ↔ Android (LoRa) via internet, and iPhone (Native + Multipeer) ↔ Android (LoRa) via a gateway user

---

> **Next step:** Open [`mesh-guardian-tasks.md`](./mesh-guardian-tasks.md) and pick the next unchecked task in the current phase.
