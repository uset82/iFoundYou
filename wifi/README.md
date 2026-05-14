# WiFi Companion Server

Local Python server that provides WiFi scanning, MAC spoofing, and network
user discovery for the iFoundYou web app.

Inspired by [FreeWifi](https://github.com/kylemcdonald/FreeWifi) and
[SpoofMAC](https://github.com/feross/SpoofMAC).

## Setup

```bash
cd wifi
pip install -r requirements.txt
```

## Run

```bash
# Windows (Run as Administrator for MAC spoofing)
python server.py

# macOS / Linux (use sudo for MAC spoofing)
sudo python server.py
```

The server starts on `http://localhost:7829`.

## API Endpoints

| Method | Endpoint             | Description                        |
|--------|----------------------|------------------------------------|
| GET    | `/api/status`        | Current WiFi connection info       |
| GET    | `/api/networks`      | Scan nearby WiFi networks          |
| GET    | `/api/users`         | Devices on the current network     |
| GET    | `/api/interfaces`    | List network interfaces + MACs     |
| GET    | `/api/mac/current`   | Current MAC of an interface        |
| POST   | `/api/mac/randomize` | Randomize MAC address              |
| POST   | `/api/mac/set`       | Set a specific MAC address         |
| POST   | `/api/mac/reset`     | Reset MAC to hardware original     |
| POST   | `/api/connect`       | Connect to a WiFi network          |

## Platform Support

| Feature         | Windows | macOS | Linux |
|-----------------|---------|-------|-------|
| Scan networks   | ✅       | ✅     | ✅     |
| Connection info | ✅       | ✅     | ✅     |
| Connect to WiFi | ✅       | ✅     | ✅     |
| List interfaces | ✅       | ✅     | ✅     |
| Spoof MAC       | ✅       | ✅     | ✅     |
| Reset MAC       | ✅       | ✅     | ✅     |
| Discover users  | ✅       | ✅     | ✅     |

## Security Note

MAC address spoofing requires administrator/root privileges. Some operations
may be restricted depending on your OS and network adapter. MAC spoofing may
be subject to legal restrictions in your jurisdiction.
