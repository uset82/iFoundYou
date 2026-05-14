# EWS Integration Plan — Apocalypse Early Warning System in Dommedag

## Overview

Integrate the **Apocalypse Early Warning System (EWS)** features from `ews-main` into the **Dommedag** app so users can see real-time emergency levels, airborne aircraft counts, and anomaly signals directly inside the Dommedag "Inside Alerts" experience.

---

## Tasks

### Phase 1: Data Layer & API Connection

- [x] **1.1** Create an EWS service module (`web/src/lib/ews.ts`) that fetches the public `dashboard.json` from the R2 endpoint (`https://pub-49bb6a6f314c47be9b481c25e5f6ca9e.r2.dev/dashboard.json`)
- [x] **1.2** Define TypeScript types/interfaces for the EWS dashboard data (emergency level, concurrent count, expected count, sigma deviation, timestamp, cohort info, aircraft positions)
- [x] **1.3** Add a React context/provider (`web/src/lib/EWSContext.tsx`) that polls the dashboard JSON every 5 minutes and exposes the parsed signal to child components
- [x] **1.4** Add environment variable `VITE_EWS_DASHBOARD_URL` to `.env.example` with the default public R2 URL as fallback

### Phase 2: Emergency Level Display Component

- [x] **2.1** Create `web/src/components/EWS/EmergencyDial.tsx` — a visual alarm dial (1–5 scale) showing the current emergency level with color coding (green → yellow → orange → red → critical)
- [x] **2.2** Create `web/src/components/EWS/EmergencyDial.css` — styling for the dial (animated needle/arc, pulsing glow at level 4–5)
- [x] **2.3** Display the current airborne count, expected count, and sigma deviation below the dial
- [x] **2.4** Show the last-updated timestamp with human-readable relative time ("5 min ago")

### Phase 3: Aircraft Map Overlay

- [x] **3.1** Create `web/src/components/EWS/AircraftOverlay.tsx` — a MapLibre layer that renders aircraft positions from the EWS live snapshot on the existing Dommedag map
- [x] **3.2** Use aircraft marker icons (SVG plane shape) with rotation based on heading
- [x] **3.3** Add a toggle button on the map to show/hide the EWS aircraft layer
- [x] **3.4** Add popup on aircraft marker click showing: hex code, model, altitude, speed, coordinates

### Phase 4: Alerts Panel Integration

- [x] **4.1** Add an "Apocalypse EWS" tab/section inside the existing Dommedag alerts view (`view === 'alerts'`)
- [x] **4.2** Show a summary card with: emergency level badge, airborne count, deviation text, and a "View Details" expand button
- [x] **4.3** When expanded, show a mini historical chart (last 24h of concurrent counts vs. expected baseline) using SVG or a lightweight chart approach
- [x] **4.4** Add push notification trigger: when emergency level reaches 4 or 5, fire a browser notification (if permission granted) with the alert message

### Phase 5: Military & Untracked Cohort Support

- [x] **5.1** Extend the EWS service to also fetch `military-dashboard.json` and `untracked-dashboard.json`
- [x] **5.2** Add a cohort selector (tabs or dropdown) in the EWS panel: "Business Jets" | "Military" | "Untracked"
- [x] **5.3** Update the EmergencyDial and AircraftOverlay to reflect the selected cohort's data
- [x] **5.4** Color-code aircraft markers by cohort type (blue = business, green = military, orange = untracked)

### Phase 6: Notification & Community Alert Bridge

- [x] **6.1** When EWS emergency level hits 5, auto-create a community alert in Dommedag (category: "other", message: "⚠️ Apocalypse EWS Level 5 — Unusual aircraft activity detected")
- [x] **6.2** Add an EWS-specific notification type in the notifications feed showing level changes
- [x] **6.3** Store the last-seen emergency level in localStorage to avoid duplicate notifications on page reload

### Phase 7: UI Polish & Settings

- [x] **7.1** Add an EWS settings section in the app where users can: enable/disable EWS overlay, set notification threshold (level 3/4/5), choose which cohorts to monitor
- [x] **7.2** Add a loading skeleton/spinner while EWS data is being fetched
- [x] **7.3** Handle offline/error states gracefully (show "EWS data unavailable" with retry button)
- [x] **7.4** Add responsive design for the EWS components (mobile-first, works in the existing Dommedag layout)
- [x] **7.5** Add an "About EWS" info tooltip/modal explaining what the system monitors and how the emergency levels work

---

## Architecture Notes

- **No backend changes needed for Dommedag** — EWS data is consumed from the public R2 JSON endpoints (read-only, CORS-enabled)
- **Shared MapLibre instance** — Aircraft overlay reuses the existing map in Dommedag rather than creating a second map
- **Polling model** — Dashboard JSON is polled every 5 minutes (matching EWS refresh cadence)
- **TypeScript** — All new code follows Dommedag's existing TS + React stack
- **No new dependencies required** — MapLibre and React are already in the project; charts can be done with inline SVG

---

## File Structure (New Files)

```
web/src/
├── lib/
│   ├── ews.ts                          # EWS API service (fetch + parse)
│   └── EWSContext.tsx                   # React context provider
├── components/
│   └── EWS/
│       ├── EmergencyDial.tsx            # Alarm dial component
│       ├── EmergencyDial.css            # Dial styles
│       ├── AircraftOverlay.tsx          # Map aircraft layer
│       ├── EWSPanel.tsx                 # Main EWS alerts panel
│       ├── EWSPanel.css                 # Panel styles
│       ├── EWSMiniChart.tsx             # 24h history sparkline
│       ├── EWSSettings.tsx             # User preferences
│       └── CohortSelector.tsx          # Business/Military/Untracked tabs
```

---

## Success Criteria

1. User can see the current EWS emergency level (1–5) inside Dommedag
2. Aircraft positions appear on the shared map with toggle control
3. Level 4–5 triggers a browser notification and optional community alert
4. All three cohorts (business, military, untracked) are viewable
5. Works offline-gracefully (shows last cached state or "unavailable")
