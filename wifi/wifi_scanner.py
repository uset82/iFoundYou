"""
Cross-platform WiFi network scanner.
Parses OS-native CLI output to discover nearby wireless networks.
"""
import subprocess, platform, re, json


def scan_networks():
    system = platform.system().lower()
    if system == "windows":
        return _scan_windows()
    elif system == "darwin":
        return _scan_macos()
    elif system == "linux":
        return _scan_linux()
    return []


def get_current_connection():
    system = platform.system().lower()
    if system == "windows":
        return _current_windows()
    elif system == "darwin":
        return _current_macos()
    elif system == "linux":
        return _current_linux()
    return _empty_conn()


def connect_to_network(ssid, password=None):
    system = platform.system().lower()
    if system == "windows":
        return _connect_windows(ssid, password)
    elif system == "darwin":
        return _connect_macos(ssid, password)
    elif system == "linux":
        return _connect_linux(ssid, password)
    return {"success": False, "message": "Unsupported platform"}


def _empty_conn():
    return {"interface": None, "ssid": None, "bssid": None,
            "gateway_ip": None, "gateway_mac": None, "mac_address": None}


# ── Windows ──────────────────────────────────────────────────────────
def _scan_windows():
    try:
        r = subprocess.run(["netsh", "wlan", "show", "networks", "mode=bssid"],
                           capture_output=True, text=True, timeout=15)
    except Exception as e:
        return [{"error": str(e)}]
    nets, cur = [], {}
    for line in r.stdout.splitlines():
        line = line.strip()
        m = re.match(r"^SSID\s+\d+\s*:\s*(.+)$", line)
        if m:
            if cur.get("ssid"): nets.append(cur)
            cur = {"ssid": m.group(1).strip(), "bssid": None,
                   "signal": None, "encryption": "Open", "channel": None}
            continue
        m = re.match(r"^BSSID\s+\d+\s*:\s*(.+)$", line)
        if m: cur["bssid"] = m.group(1).strip(); continue
        m = re.match(r"^Signal\s*:\s*(\d+)%", line)
        if m: cur["signal"] = int(m.group(1)); continue
        m = re.match(r"^Authentication\s*:\s*(.+)$", line)
        if m:
            a = m.group(1).strip()
            cur["encryption"] = "Open" if a.lower() == "open" else a
            continue
        m = re.match(r"^Channel\s*:\s*(\d+)", line)
        if m: cur["channel"] = int(m.group(1))
    if cur.get("ssid"): nets.append(cur)
    return nets


def _current_windows():
    info = _empty_conn()
    try:
        r = subprocess.run(["netsh", "wlan", "show", "interfaces"],
                           capture_output=True, text=True, timeout=10)
        for line in r.stdout.splitlines():
            line = line.strip()
            if re.match(r"^Name\s*:", line):
                info["interface"] = line.split(":", 1)[1].strip()
            elif re.match(r"^\s*SSID\s*:", line) and not info["ssid"]:
                info["ssid"] = line.split(":", 1)[1].strip()
            elif re.match(r"^BSSID\s*:", line):
                info["bssid"] = line.split(":", 1)[1].strip()
            elif re.match(r"^Physical address\s*:", line):
                info["mac_address"] = line.split(":", 1)[1].strip()
    except Exception:
        pass
    try:
        r = subprocess.run(["ipconfig"], capture_output=True, text=True, timeout=10)
        for line in r.stdout.splitlines():
            m = re.match(r".*Default Gateway.*:\s*([\d.]+)", line)
            if m: info["gateway_ip"] = m.group(1); break
    except Exception:
        pass
    if info["gateway_ip"]:
        try:
            r = subprocess.run(["arp", "-a", info["gateway_ip"]],
                               capture_output=True, text=True, timeout=10)
            m = re.search(r"([\da-fA-F]{2}[:-]){5}[\da-fA-F]{2}", r.stdout)
            if m: info["gateway_mac"] = m.group(0)
        except Exception:
            pass
    return info


def _connect_windows(ssid, password=None):
    import tempfile, os
    try:
        if password:
            xml = (f'<?xml version="1.0"?><WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">'
                   f'<name>{ssid}</name><SSIDConfig><SSID><name>{ssid}</name></SSID></SSIDConfig>'
                   f'<connectionType>ESS</connectionType><connectionMode>manual</connectionMode>'
                   f'<MSM><security><authEncryption><authentication>WPA2PSK</authentication>'
                   f'<encryption>AES</encryption><useOneX>false</useOneX></authEncryption>'
                   f'<sharedKey><keyType>passPhrase</keyType><protected>false</protected>'
                   f'<keyMaterial>{password}</keyMaterial></sharedKey></security></MSM></WLANProfile>')
        else:
            xml = (f'<?xml version="1.0"?><WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1">'
                   f'<name>{ssid}</name><SSIDConfig><SSID><name>{ssid}</name></SSID></SSIDConfig>'
                   f'<connectionType>ESS</connectionType><connectionMode>manual</connectionMode>'
                   f'<MSM><security><authEncryption><authentication>open</authentication>'
                   f'<encryption>none</encryption><useOneX>false</useOneX></authEncryption>'
                   f'</security></MSM></WLANProfile>')
        p = os.path.join(tempfile.gettempdir(), f"wifi_{ssid}.xml")
        with open(p, "w") as f: f.write(xml)
        subprocess.run(["netsh", "wlan", "add", "profile", f"filename={p}"],
                       capture_output=True, text=True, timeout=10)
        os.unlink(p)
        r = subprocess.run(["netsh", "wlan", "connect", f"name={ssid}"],
                           capture_output=True, text=True, timeout=15)
        if r.returncode == 0:
            return {"success": True, "message": f"Connected to {ssid}"}
        return {"success": False, "message": r.stdout or r.stderr or "Failed"}
    except Exception as e:
        return {"success": False, "message": str(e)}


# ── macOS ────────────────────────────────────────────────────────────
def _scan_macos():
    try:
        r = subprocess.run(["/System/Library/PrivateFrameworks/Apple80211.framework/"
                            "Versions/Current/Resources/airport", "-s"],
                           capture_output=True, text=True, timeout=15)
    except Exception as e:
        return [{"error": str(e)}]
    nets = []
    for line in r.stdout.strip().splitlines()[1:]:
        parts = line.split()
        if len(parts) < 7: continue
        sig = None
        try: sig = int(parts[2])
        except ValueError: pass
        nets.append({"ssid": parts[0], "bssid": parts[1], "signal": sig,
                      "encryption": parts[-1], "channel": parts[3]})
    return nets


def _current_macos():
    info = _empty_conn()
    info["interface"] = "en0"
    try:
        r = subprocess.run(["/System/Library/PrivateFrameworks/Apple80211.framework/"
                            "Versions/Current/Resources/airport", "-I"],
                           capture_output=True, text=True, timeout=10)
        for line in r.stdout.splitlines():
            l = line.strip()
            if l.startswith("SSID:"): info["ssid"] = l.split(":", 1)[1].strip()
            elif l.startswith("BSSID:"): info["bssid"] = l.split(":", 1)[1].strip()
    except Exception: pass
    try:
        r = subprocess.run(["ifconfig", "en0"], capture_output=True, text=True, timeout=10)
        m = re.search(r"ether\s+([\da-fA-F:]+)", r.stdout)
        if m: info["mac_address"] = m.group(1)
    except Exception: pass
    return info


def _connect_macos(ssid, password=None):
    try:
        cmd = ["networksetup", "-setairportnetwork", "en0", ssid]
        if password: cmd.append(password)
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        if r.returncode == 0:
            return {"success": True, "message": f"Connected to {ssid}"}
        return {"success": False, "message": r.stderr or r.stdout or "Failed"}
    except Exception as e:
        return {"success": False, "message": str(e)}


# ── Linux ────────────────────────────────────────────────────────────
def _scan_linux():
    try:
        r = subprocess.run(["nmcli", "-t", "-f", "SSID,BSSID,SIGNAL,SECURITY,CHAN",
                            "dev", "wifi", "list"],
                           capture_output=True, text=True, timeout=15)
        if r.returncode != 0: raise FileNotFoundError
    except FileNotFoundError:
        return []
    nets = []
    for line in r.stdout.strip().splitlines():
        p = line.split(":")
        if len(p) < 5: continue
        sig = None
        try: sig = int(p[2])
        except (ValueError, IndexError): pass
        ch = None
        try: ch = int(p[4])
        except (ValueError, IndexError): pass
        if p[0].strip():
            nets.append({"ssid": p[0].strip(), "bssid": p[1].strip(),
                          "signal": sig, "encryption": p[3].strip() or "Open",
                          "channel": ch})
    return nets


def _current_linux():
    info = _empty_conn()
    info["interface"] = "wlan0"
    try:
        r = subprocess.run(["nmcli", "-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "dev"],
                           capture_output=True, text=True, timeout=10)
        for line in r.stdout.splitlines():
            p = line.split(":")
            if len(p) >= 4 and p[1] == "wifi" and p[2] == "connected":
                info["interface"] = p[0]; info["ssid"] = p[3]; break
    except Exception: pass
    try:
        r = subprocess.run(["ip", "link", "show", info["interface"] or "wlan0"],
                           capture_output=True, text=True, timeout=10)
        m = re.search(r"link/ether\s+([\da-fA-F:]+)", r.stdout)
        if m: info["mac_address"] = m.group(1)
    except Exception: pass
    return info


def _connect_linux(ssid, password=None):
    try:
        cmd = ["nmcli", "dev", "wifi", "connect", ssid]
        if password: cmd += ["password", password]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        if r.returncode == 0:
            return {"success": True, "message": f"Connected to {ssid}"}
        return {"success": False, "message": r.stderr or r.stdout or "Failed"}
    except Exception as e:
        return {"success": False, "message": str(e)}


if __name__ == "__main__":
    print("=== WiFi Networks ===")
    print(json.dumps(scan_networks(), indent=2))
    print("\n=== Current Connection ===")
    print(json.dumps(get_current_connection(), indent=2))
