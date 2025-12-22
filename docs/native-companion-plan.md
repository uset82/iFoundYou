# Native Companion App Plan (Offline Mesh)

This document defines the native companion app needed for offline mesh messaging. The web app remains the main experience for the ChatGPT store and online features.

## Summary

- Two-app strategy: web app for online features and distribution, native companion app for offline mesh messaging and location sharing.
- Platform choice: React Native (bare) so we can access native Bluetooth and peer-to-peer Wi-Fi APIs on iOS and Android.

## Transport layers

### iOS

- Multipeer Connectivity for discovery and data exchange (Bluetooth + peer-to-peer Wi-Fi). (Source: https://developer.apple.com/documentation/multipeerconnectivity, accessed 2025-12-22)
- CoreBluetooth for BLE when needed for cross-platform compatibility. (Source: https://developer.apple.com/documentation/corebluetooth, accessed 2025-12-22)

### Android

- Bluetooth LE for cross-platform messaging. (Source: https://developer.android.com/develop/connectivity/bluetooth, accessed 2025-12-22)
- Wi-Fi Direct (WifiP2pManager) for Android-to-Android higher throughput links. (Source: https://developer.android.com/develop/connectivity/wifi/wifip2p, accessed 2025-12-22)

### Optional long-range

- Meshtastic LoRa bridge over Bluetooth for kilometer-scale text and GPS. (Source: https://github.com/meshtastic, accessed 2025-12-22)

## Mesh protocol (app-level)

- Message envelope: id, sender_id, timestamp, ttl, payload_type, payload.
- Store-and-forward with TTL, deduplication, and bounded retries.
- Optional acknowledgements for direct peers to reduce resends.
- Rate limits to control battery and congestion.

## Security and identity

- Local device identity with QR-based pairing for offline onboarding.
- End-to-end encryption for payloads and signed message headers.

## Location and maps

- iOS: Core Location for fixes. (Source: https://developer.apple.com/documentation/corelocation, accessed 2025-12-22)
- Android: Location services APIs for fixes. (Source: https://developer.android.com/develop/sensors-and-location/location, accessed 2025-12-22)
- Offline map packs if possible; otherwise, compass/bearing fallback.

## Sync with the backend

- When online, sync messages and contact graph via Supabase.
- Offline queue is merged on reconnect; conflicts resolved by timestamp and message id.

## Milestones

1. Direct peer discovery + chat (iOS via Multipeer, Android via BLE).
2. Cross-platform BLE direct messaging.
3. Store-and-forward mesh with TTL and deduplication.
4. Push-to-talk voice clips.
5. Optional Meshtastic bridge.

## Constraints and risks

- Mobile OS background limits can reduce mesh reliability.
- Range is short without external radios.
- Cross-platform throughput is limited over BLE.

## Sources (accessed 2025-12-22)

- Apple Multipeer Connectivity: https://developer.apple.com/documentation/multipeerconnectivity
- Apple CoreBluetooth: https://developer.apple.com/documentation/corebluetooth
- Apple Core Location: https://developer.apple.com/documentation/corelocation
- Android Bluetooth: https://developer.android.com/develop/connectivity/bluetooth
- Android Wi-Fi Direct: https://developer.android.com/develop/connectivity/wifi/wifip2p
- Android Location: https://developer.android.com/develop/sensors-and-location/location
- Meshtastic: https://github.com/meshtastic
