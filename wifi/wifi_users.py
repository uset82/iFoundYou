"""
Network user discovery — find active devices on the current WiFi network.
Adapted from FreeWifi's wifi-users.py.
Uses ARP table for cross-platform compatibility.
"""
import subprocess, platform, re, json


def discover_users():
    """
    List devices on the local network via ARP table.
    Returns [{mac, ip, vendor_hint}]
    """
    system = platform.system().lower()
    if system == "windows":
        return _arp_windows()
    else:
        return _arp_unix()


def _arp_windows():
    users = []
    try:
        r = subprocess.run(["arp", "-a"], capture_output=True, text=True, timeout=10)
        for line in r.stdout.splitlines():
            # Match: IP  MAC  Type
            m = re.match(r"\s*([\d.]+)\s+([\da-fA-F-]{17})\s+(\w+)", line)
            if m:
                mac = m.group(2).replace("-", ":")
                if mac.lower() == "ff:ff:ff:ff:ff:ff":
                    continue
                users.append({
                    "ip": m.group(1),
                    "mac": mac,
                    "type": m.group(3),
                })
    except Exception:
        pass
    return users


def _arp_unix():
    users = []
    try:
        r = subprocess.run(["arp", "-a"], capture_output=True, text=True, timeout=10)
        for line in r.stdout.splitlines():
            # Match: hostname (IP) at MAC ...
            m = re.search(r"\(([\d.]+)\)\s+at\s+([\da-fA-F:]+)", line)
            if m:
                mac = m.group(2)
                if mac.lower() == "ff:ff:ff:ff:ff:ff":
                    continue
                users.append({
                    "ip": m.group(1),
                    "mac": mac,
                    "type": "dynamic",
                })
    except Exception:
        pass
    return users


if __name__ == "__main__":
    print("=== Network Users ===")
    print(json.dumps(discover_users(), indent=2))
