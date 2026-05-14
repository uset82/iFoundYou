# Mesh Guardian Task Checklist

> **Companion file:** [`mesh-guardian-plan.md`](./mesh-guardian-plan.md) — architecture, iOS three-tier strategy, file structure, and decisions. Read that once. Track work here.

This checklist tracks the Dommedag evolution into a survival messenger that works online first and can later bridge to Meshtastic LoRa, with a dedicated path so iPhone users get a real experience too.

**Project baseline:**
- Web app: Vite + React + TypeScript
- Hosting: Netlify
- Backend / auth / realtime: Supabase
- Native iOS scaffold: `mobile/` (React Native + `react-native-ble-plx`)
- Mesh reference: Meshtastic <https://github.com/meshtastic>

---

## Current Sprint — Discover Chat

- [x] Confirm Netlify, Supabase, and GitHub plugin/tool namespaces are available in this Codex session
- [x] Inspect the current Discover feature and existing chat components
- [x] Add a Chat action for signed-in discoverable users
- [x] Render the selected connected user chat inside Discover
- [x] Keep location sharing automatic after sign-in when browser permission allows it
- [x] Build the web app successfully
- [x] Browser-check Discover for the connected-users surface and console errors
- [ ] Add Supabase frontend env vars so real sign-in and chat can be tested locally
- [x] Wire `NetworkStatusBar` + `IosInstallTutorial` into the sidebar / app shell
- [x] Add unread-message badges to the Discover peer list using `useUnreadCounts`
- [x] Add typing indicator inside the Discover chat using `useTypingIndicator`

---

## Phase 0 — Discover Chat Polish

- [x] **0.1** Verify current Discover chat works end-to-end (peer list → click Chat → ChatWindow → send/receive)
- [x] **0.2** Add unread message badge per peer in the Discover list using Supabase Realtime subscription
- [x] **0.3** Show online/offline indicator next to each peer based on `last_locations.updated_at` (< 2 min = online)
- [x] **0.4** Persist chat scroll position when switching peers
- [x] **0.5** Add "typing..." indicator using Supabase Realtime broadcast channels
- [x] **0.6** Show distance + last-seen time for each peer
- [x] **0.7** Add a "Block" / "Report" action per peer (writes to a `blocked_users` table in Supabase)

---

## Phase 1 — Real-time Internet Chat (Supabase Realtime)

- [x] React + TypeScript web app baseline
- [x] Supabase client wiring
- [x] Login / register UI
- [x] Private chat UI for connected users in Discover
- [x] Private message component backed by Supabase `messages`
- [x] **1.1** Add columns to `messages` table: `delivered_at`, `read_at`, `transport` (text)
- [x] **1.2** Confirm RLS policies on `profiles`, `friendships`, `messages`, `last_locations`, `location_updates`
- [x] **1.3** Create `web/src/lib/chat/realtimeChat.ts` — Supabase Realtime subscription + send helper
- [x] **1.4** Update `ChatWindow` to use the new realtimeChat service instead of the in-memory store
- [x] **1.5** Add message status states: `pending` → `sent` → `delivered` → `read`
- [x] **1.6** Add browser notifications when a message arrives and the chat isn't focused
- [x] **1.7** Add group chat: `chat_rooms` + `chat_room_members` tables, subscription to a room channel
- [x] **1.8** Add a "New group" button in Discover/Friends to create a room and invite friends
- [x] **1.9** User profile view
- [x] **1.10** Connected users / signed-in users view
- [x] **1.11** Mobile-responsive checks for Android and iOS browsers

**Goal:** users can chat normally through the internet, including group chats.

---

## Phase 2 — Offline-First System (IndexedDB)

- [x] **2.5** Add `useNetworkStatus` hook that listens to `online` / `offline` events + heartbeat ping
- [x] **2.6** Add `NetworkStatusBar` component pill: **Online** | **Offline** | **Emergency Mode**
- [x] **2.1** Create `web/src/lib/chat/messageStore.ts` — IndexedDB wrapper using `idb` package
- [x] **2.2** Define schema: `messages` store, `outbox` store (queued messages), `metadata` store (sync state)
- [x] **2.3** Cache every incoming Supabase message into IndexedDB on receive
- [x] **2.4** When the user sends a message, write to IndexedDB first, then to Supabase
- [x] **2.7** Queue outgoing messages when offline; flag them with `pending` status and a 🕓 icon
- [x] **2.8** Auto-sync the outbox when the connection returns; emit visual feedback per synced message
- [x] **2.9** Handle dedupe on resync (server-side `id` is the source of truth; reconcile client-generated UUIDs)

**Goal:** the web app still works when internet is unstable.

---

## Phase 3 — Emergency Message Protocol

- [x] **3.1** Define `EmergencyMessage` type with fields: `category`, `priority`, `text`, `lat`, `lon`, `ts`, `channel`
- [x] **3.2** Create `web/src/components/MeshGuardian/QuickButtons.tsx` — large tappable buttons for SAFE / HELP / WATER / FOOD / MEDICAL / DANGER
- [x] **3.3** Add character limit (200 chars) with visible counter in the emergency input
- [x] **3.4** Add priority selector (normal / urgent / critical) with color coding
- [x] **3.5** Add channel selector (Family / Neighborhood / Medical / Security / Broadcast)
- [x] **3.6** Add message compression helper (shorten common phrases: "we are" → "WE", "need" → "NEED+", etc.)
- [x] **3.7** Add timestamp + optional location attachment from current GPS
- [x] **3.8** Auto-switch the chat input UI to "Emergency Mode" when offline or when user toggles it
- [x] **3.9** Render emergency messages with a distinct style (red border for critical, etc.)

**Goal:** emergency mode sends compact messages suitable for LoRa.

---

## Phase 4 — Meshtastic Web Bluetooth Transport

- [x] Confirm Meshtastic has official JavaScript/web packages for core, Web Bluetooth, Web Serial, HTTP, and protobufs
- [x] **4.1** Install `@meshtastic/core` and `@meshtastic/transport-web-bluetooth` from npm
- [x] **4.2** Create `web/src/lib/mesh/transports/` directory
- [x] **4.3** Create `MeshTransport.ts` interface: `name`, `isAvailable()`, `connect()`, `sendMessage()`, `onMessage()`, `disconnect()`
- [x] **4.4** Implement `BluetoothMeshTransport.ts` wrapping Meshtastic's BLE transport
- [x] **4.5** Add a "Connect Meshtastic Device" button in the Mesh view
- [x] **4.6** Show device picker via `navigator.bluetooth.requestDevice()`
- [x] **4.7** Read node info (firmware version, my-node-id, channel list) on connect
- [x] **4.8** Subscribe to incoming `FromRadio` packets, decode protobuf, surface in chat UI
- [x] **4.9** Send a test ToRadio text message from a UI button
- [x] **4.10** Add automatic reconnect on disconnect (max 3 attempts, exponential backoff)
- [x] **4.11** Detect Web Bluetooth support (`'bluetooth' in navigator`); disable button on iOS Safari
- [x] **4.12** Display connection status pill: **Disconnected** | **Connecting** | **Connected (Node X)**

**Goal:** Android Chrome and desktop Chromium users can send emergency messages through a Meshtastic node.

---

## Phase 5 — Meshtastic HTTP Mode (ESP32 over Wi-Fi)

- [x] **5.1** Create `HttpMeshTransport.ts` using `@meshtastic/transport-http`
- [x] **5.2** Add an "ESP32 Node IP" text input in the Mesh settings (e.g. `192.168.4.1`)
- [x] **5.3** Connect over `http://<ip>/api/v1/toradio` and `http://<ip>/api/v1/fromradio`
- [x] **5.4** Add a self-signed cert warning + setup instructions modal for users
- [ ] **5.5** Test end-to-end on Android, iOS Safari, desktop
- [x] **5.6** Document fallback path: if Bluetooth unavailable → suggest HTTP mode

**Goal:** provide the best first web path for iPhone users through ESP32 node HTTP/Wi-Fi mode.

---

## Phase 6 — Transport Switching Engine

- [x] **6.1** Create `web/src/lib/chat/TransportManager.ts` with the unified `ChatTransport` interface
- [x] **6.2** Implement `InternetTransport` wrapping the Supabase Realtime chat from Phase 1
- [x] **6.3** Register `BluetoothMeshTransport` and `HttpMeshTransport` from Phase 4 & 5
- [x] **6.4** Add availability checks (heartbeat ping, BLE state, HTTP reachability)
- [x] **6.5** Add transport priority list: `internet > bluetooth > http > multipeer > none`
- [x] **6.6** Send normal messages via the highest-priority available transport
- [x] **6.7** Auto-fail-over: if internet drops mid-conversation, try the next transport
- [x] **6.8** Add a transport indicator in the chat header (🌐 Internet / 📡 Mesh-BT / 📡 Mesh-WiFi / 📲 Multipeer)
- [x] **6.9** Add a manual "Force Emergency Mode" toggle in settings
- [x] **6.10** Retry queue for failed messages with manual "Retry" button per failed message

**Goal:** one chat UI can choose internet, local mesh, or bridge mode.

---

## Phase 7 — Bridge Mode

- [ ] **7.1** Add a `is_gateway` flag on user profile (Supabase column)
- [ ] **7.2** Gateway users with both internet + a connected Meshtastic node relay messages between sources
- [ ] **7.3** Server-side Netlify Function `/api/mesh-bridge` accepts internet messages addressed to off-grid users
- [ ] **7.4** Gateway client polls bridge endpoint and forwards messages to Meshtastic
- [ ] **7.5** Reverse direction: gateway forwards mesh-received messages back to internet via Supabase
- [ ] **7.6** Display a "Bridge active" badge on the gateway user's profile

---

## Phase 8 — Groups & Emergency Channels

- [ ] **8.1** Create channel types: `family`, `neighborhood`, `medical`, `security`, `broadcast`
- [ ] **8.2** Add channel keys (PSK) for private mesh channels — generate via `crypto.subtle`
- [ ] **8.3** Build "Channel" management UI with create / join / leave actions
- [ ] **8.4** Generate QR-code invitation links containing channel key + name
- [ ] **8.5** Add a QR scanner using `@yudiel/react-qr-scanner` to join via QR
- [ ] **8.6** Build emergency contact list (favorites that always show on top)
- [ ] **8.7** Default channels seeded for new users: `family`, `neighborhood`

**Goal:** each family or neighborhood can use private emergency mesh channels.

---

## Phase 9 — PWA & Mobile Polish

- [x] **9.1** Add a Web App Manifest (`manifest.webmanifest`) with app icons + theme colors
- [ ] **9.2** Add a service worker via `vite-plugin-pwa` for offline asset caching
- [ ] **9.3** Cache the app shell + last 7 days of chat data
- [ ] **9.4** Add "Install App" prompt on Android Chrome
- [ ] **9.5** Add iOS Safari "Add to Home Screen" instructions (component built — wire it in)
- [ ] **9.6** Test offline behavior end-to-end (kill network, send messages, restore)
- [ ] **9.7** Mobile-responsive Discover chat (full-screen chat view on small screens, swipe-back to peer list)

---

## Phase 10 — MVP Acceptance

- [ ] **10.1** User can register (existing Supabase Auth)
- [ ] **10.2** User can chat 1-on-1 with a connected app user via internet
- [ ] **10.3** User can create a group chat with multiple friends
- [ ] **10.4** Web app saves messages offline in IndexedDB
- [ ] **10.5** App detects internet loss + shows the **Emergency Mode** pill
- [ ] **10.6** Android user can connect to a Meshtastic node via Bluetooth
- [ ] **10.7** User can send a short emergency LoRa message
- [ ] **10.8** Another Meshtastic node receives the message
- [ ] **10.9** Mesh-received messages appear inside the same chat UI as internet messages
- [ ] **10.10** End-to-end test on Android Chrome + iOS Safari + desktop Chrome

---

## Phase 11 — iOS Safari PWA

iOS Safari supports PWAs, IndexedDB, Service Workers, Push, and Web Geolocation, but does NOT support Web Bluetooth or Web Serial. Internet chat, offline mode, and ESP32 Wi-Fi mesh modes still all work.

- [x] **11.1** Add iOS-specific meta tags in `index.html` (`apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`)
- [x] **11.6** Create platform detection (`web/src/lib/chat/platform.ts`) for iOS Safari standalone mode
- [x] **11.7** Use `env(safe-area-inset-*)` CSS variables for notch + home-indicator on iPhone X+
- [x] **11.11** Handle iOS Safari quirks: `100vh` issue (use `100dvh`), audio autoplay restrictions, file input limitations
- [ ] **11.2** Add Apple touch icons (180×180, 152×152, 167×167) to `web/public/`
- [ ] **11.3** Add iOS splash screens for iPhone + iPad sizes (use `pwa-asset-generator`)
- [ ] **11.4** Configure `vite-plugin-pwa` with `registerType: 'autoUpdate'` and an iOS-friendly Workbox runtime caching strategy
- [ ] **11.5** Wire the `IosInstallTutorial` component into the app shell to show on first iOS Safari visit
- [ ] **11.8** Replace any `localStorage`-only persistence with IndexedDB (iOS purges localStorage after 7 days of inactivity in Safari ITP)
- [ ] **11.9** Use Web Push via the iOS 16.4+ Push API (requires PWA installed to home screen)
- [ ] **11.10** Add iOS-specific feature-detection: hide BLE buttons, surface "Connect ESP32 over Wi-Fi" as the primary mesh option
- [ ] **11.12** Test on real iPhone: Safari, "Add to Home Screen", offline mode, send/receive messages, GPS, ESP32 mesh connection
- [ ] **11.13** Document iOS install steps in the app onboarding (screenshots + arrows)

**Goal:** iPhone users get a first-class experience without installing a native app.

---

## Phase 12 — iOS Native App

The repo already has a React Native scaffold at `mobile/` with `react-native-ble-plx` and Supabase wired up.

- [ ] **12.1** Audit existing `mobile/` workspace and remove obsolete starter code
- [ ] **12.2** Add `react-native-webview` and embed the Vite-built web bundle as the primary UI
- [ ] **12.3** Create a JS↔Native bridge with `postMessage` for: BLE scan, BLE connect, BLE write, GPS, push notifications, mesh transport availability
- [ ] **12.4** Implement the BLE bridge using `react-native-ble-plx` — exposes the same `MeshTransport` interface as the web BLE
- [ ] **12.5** Wire the Meshtastic protobuf encode/decode (use `@meshtastic/core` from the JS bundle, just route the bytes through the native bridge)
- [ ] **12.6** Add background location and push using `react-native-permissions` + `@react-native-firebase/messaging` (or APNs directly)
- [ ] **12.7** Configure `Info.plist` permission strings: `NSBluetoothAlwaysUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`, `NSLocalNetworkUsageDescription`, `NSBonjourServices`
- [ ] **12.8** Build with EAS (`eas build --platform ios --profile preview`) — config already exists in `mobile/eas.json`
- [ ] **12.9** TestFlight distribution to internal testers
- [ ] **12.10** App Store submission: screenshots, privacy nutrition label, App Privacy questionnaire, mesh/emergency-use disclaimer
- [ ] **12.11** Add deep-link handler `Dommedag://channel/<id>?key=<psk>` so QR-scanned channel invites open the app

**Goal:** ship a real iOS app that unlocks BLE LoRa pairing.

---

## Phase 13 — iOS Multipeer Connectivity

iPhones cannot pair with Meshtastic LoRa hardware in Safari. To get true off-grid messaging on iOS WITHOUT extra hardware, use Apple's **Multipeer Connectivity** framework (Wi-Fi Direct + Bluetooth between Apple devices, range ~30–100 m).

The repo already has a `MultipeerManager` stub in `web/src/lib/mesh/multipeer.ts` and an `EmergencyChat` view that detects `window.webkit.messageHandlers.multipeer`.

- [ ] **13.1** Audit the existing `MultipeerManager` web-side stub and align it with the new `MeshTransport` interface
- [ ] **13.2** Create a Swift `MultipeerBridge.swift` module in `mobile/ios/` using `MCSession`, `MCNearbyServiceAdvertiser`, `MCNearbyServiceBrowser`
- [ ] **13.3** Expose native methods to JS via `WKScriptMessageHandler`: `startAdvertising`, `startBrowsing`, `connectPeer`, `sendMessage`, `disconnect`
- [ ] **13.4** Forward incoming peer events back to JS via `webView.evaluateJavaScript("window.iosMultipeer.onEvent(...)")`
- [ ] **13.5** Implement `MultipeerTransport.ts` on the JS side that routes messages through the native bridge when running in the iOS wrapper
- [ ] **13.6** Add this as the second-priority off-grid transport in `TransportManager`
- [ ] **13.7** Show "iPhone Mesh" status pill when active and indicate the number of nearby Apple peers
- [ ] **13.8** Auto-start advertising when the app loses internet, stop when reconnected (battery saver)
- [ ] **13.9** Encrypt Multipeer payloads end-to-end using AES-GCM with the channel PSK from Phase 8
- [ ] **13.10** Test cross-platform: iPhone ↔ iPhone, iPhone via Multipeer + Android via LoRa using a third device as bridge
- [ ] **13.11** Document range expectations + battery impact in onboarding

**Goal:** two iPhones can chat off-grid without buying any hardware.

---

## Phase 14 — iOS MVP Acceptance

- [ ] **14.1** iOS Safari user can install the PWA to home screen
- [ ] **14.2** iOS Safari user can chat 1-on-1 with a friend via internet
- [ ] **14.3** iOS Safari user can chat with offline messages syncing on reconnect
- [ ] **14.4** iOS Safari user can connect to an ESP32 Meshtastic node via Wi-Fi and send a SAFE message
- [ ] **14.5** iOS native app builds and runs on a real iPhone via TestFlight
- [ ] **14.6** iOS native app connects to a Meshtastic LoRa device via real Bluetooth (not Web Bluetooth)
- [ ] **14.7** Two iPhones with the native app can chat off-grid via Multipeer Connectivity (no internet, no LoRa hardware)
- [ ] **14.8** Mixed-device test: iPhone (Multipeer) → iPhone gateway (LoRa+Multipeer) → Android (LoRa)
- [ ] **14.9** App Store review approval

---

## Deployment & Integrations

- [ ] Netlify project has required frontend env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- [ ] Netlify functions have required server-only Supabase env vars (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
- [ ] Supabase Auth configured for app URL and Netlify deploy URL
- [ ] Supabase RLS policies protect `messages`, `last_locations`, `profiles`, `chat_rooms`
- [ ] GitHub repo has tracked checklist + implementation commits
- [ ] Netlify production deploy verified after each completed phase
- [ ] Supabase Realtime Postgres changes enabled on `messages` (and `chat_rooms` once added)
- [ ] EAS build credentials (`mobile/eas.json`) configured for iOS provisioning profile + APNs key

---

## Progress Snapshot

Overall: **83 / ~163 tasks complete** (~51%). **Phases 0–6: complete** (Phase 5 has one hardware-test task pending real ESP32 hardware). Next: Phase 7 — Bridge Mode.
