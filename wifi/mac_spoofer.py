"""
Cross-platform MAC address spoofing module.
Adapted from SpoofMAC (https://github.com/feross/SpoofMAC).
"""
import subprocess, platform, re, random, json


def random_mac():
    """Generate a random unicast, locally-administered MAC address."""
    # First byte: set locally-administered bit (0x02), clear multicast bit (0x01)
    first = random.randint(0, 255) & 0xFE | 0x02
    rest = [random.randint(0, 255) for _ in range(5)]
    return ":".join(f"{b:02x}" for b in [first] + rest)


def list_interfaces():
    """List network interfaces with their MAC addresses."""
    system = platform.system().lower()
    if system == "windows":
        return _list_windows()
    elif system == "darwin":
        return _list_macos()
    elif system == "linux":
        return _list_linux()
    return []


def set_mac(interface, mac):
    """Set MAC address on the given interface. Requires root/admin."""
    system = platform.system().lower()
    if system == "windows":
        return _set_mac_windows(interface, mac)
    elif system == "darwin":
        return _set_mac_macos(interface, mac)
    elif system == "linux":
        return _set_mac_linux(interface, mac)
    return {"success": False, "message": "Unsupported platform"}


def randomize_mac(interface):
    """Set a random MAC address on the given interface."""
    mac = random_mac()
    result = set_mac(interface, mac)
    result["new_mac"] = mac
    return result


def reset_mac(interface):
    """Reset MAC address to hardware original. Requires root/admin."""
    system = platform.system().lower()
    if system == "windows":
        return _reset_mac_windows(interface)
    elif system == "darwin":
        return _reset_mac_macos(interface)
    elif system == "linux":
        return _reset_mac_linux(interface)
    return {"success": False, "message": "Unsupported platform"}


def get_current_mac(interface=None):
    """Get the current MAC address of the given interface."""
    system = platform.system().lower()
    if system == "windows":
        return _get_mac_windows(interface)
    elif system == "darwin":
        iface = interface or "en0"
        try:
            r = subprocess.run(["ifconfig", iface], capture_output=True, text=True, timeout=5)
            m = re.search(r"ether\s+([\da-fA-F:]+)", r.stdout)
            return m.group(1) if m else None
        except Exception:
            return None
    elif system == "linux":
        iface = interface or "wlan0"
        try:
            r = subprocess.run(["ip", "link", "show", iface],
                               capture_output=True, text=True, timeout=5)
            m = re.search(r"link/ether\s+([\da-fA-F:]+)", r.stdout)
            return m.group(1) if m else None
        except Exception:
            return None
    return None


# ── Windows ──────────────────────────────────────────────────────────

def _list_windows():
    interfaces = []
    try:
        r = subprocess.run(["getmac", "/v", "/fo", "csv"],
                           capture_output=True, text=True, timeout=10)
        import csv, io
        reader = csv.reader(io.StringIO(r.stdout))
        header = next(reader, None)
        for row in reader:
            if len(row) >= 3:
                interfaces.append({
                    "name": row[0].strip(),
                    "device": row[1].strip(),
                    "mac": row[2].strip(),
                })
    except Exception:
        pass
    return interfaces


def _get_mac_windows(interface=None):
    try:
        r = subprocess.run(["getmac", "/v", "/fo", "csv"],
                           capture_output=True, text=True, timeout=10)
        import csv, io
        reader = csv.reader(io.StringIO(r.stdout))
        next(reader, None)
        for row in reader:
            if len(row) >= 3:
                if interface is None or interface.lower() in row[0].lower():
                    return row[2].strip()
    except Exception:
        pass
    return None


def _set_mac_windows(interface, mac):
    """Set MAC via registry on Windows. Requires admin."""
    try:
        # Remove colons/dashes for registry value
        mac_clean = mac.replace(":", "").replace("-", "")
        # Use netsh to find the adapter, then reg to set
        import winreg
        reg_path = r"SYSTEM\CurrentControlSet\Control\Class\{4d36e972-e325-11ce-bfc1-08002be10318}"
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, reg_path)
        found = False
        for i in range(30):
            try:
                subkey_name = winreg.EnumKey(key, i)
                subkey = winreg.OpenKey(key, subkey_name, 0,
                                        winreg.KEY_READ | winreg.KEY_SET_VALUE)
                try:
                    desc = winreg.QueryValueEx(subkey, "DriverDesc")[0]
                except FileNotFoundError:
                    winreg.CloseKey(subkey)
                    continue
                if interface.lower() in desc.lower():
                    winreg.SetValueEx(subkey, "NetworkAddress",
                                      0, winreg.REG_SZ, mac_clean)
                    found = True
                    winreg.CloseKey(subkey)
                    break
                winreg.CloseKey(subkey)
            except OSError:
                continue
        winreg.CloseKey(key)
        if not found:
            return {"success": False, "message": f"Interface '{interface}' not found in registry"}
        # Restart adapter
        subprocess.run(["netsh", "interface", "set", "interface",
                        interface, "disable"], capture_output=True, timeout=10)
        subprocess.run(["netsh", "interface", "set", "interface",
                        interface, "enable"], capture_output=True, timeout=10)
        return {"success": True, "message": f"MAC set to {mac} on {interface}"}
    except ImportError:
        return {"success": False, "message": "winreg not available (not Windows)"}
    except Exception as e:
        return {"success": False, "message": str(e)}


def _reset_mac_windows(interface):
    """Remove NetworkAddress registry key to reset MAC."""
    try:
        import winreg
        reg_path = r"SYSTEM\CurrentControlSet\Control\Class\{4d36e972-e325-11ce-bfc1-08002be10318}"
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, reg_path)
        for i in range(30):
            try:
                subkey_name = winreg.EnumKey(key, i)
                subkey = winreg.OpenKey(key, subkey_name, 0,
                                        winreg.KEY_READ | winreg.KEY_SET_VALUE)
                try:
                    desc = winreg.QueryValueEx(subkey, "DriverDesc")[0]
                except FileNotFoundError:
                    winreg.CloseKey(subkey)
                    continue
                if interface.lower() in desc.lower():
                    try:
                        winreg.DeleteValue(subkey, "NetworkAddress")
                    except FileNotFoundError:
                        pass
                    winreg.CloseKey(subkey)
                    subprocess.run(["netsh", "interface", "set", "interface",
                                    interface, "disable"], capture_output=True, timeout=10)
                    subprocess.run(["netsh", "interface", "set", "interface",
                                    interface, "enable"], capture_output=True, timeout=10)
                    winreg.CloseKey(key)
                    return {"success": True, "message": f"MAC reset on {interface}"}
                winreg.CloseKey(subkey)
            except OSError:
                continue
        winreg.CloseKey(key)
        return {"success": False, "message": f"Interface '{interface}' not found"}
    except ImportError:
        return {"success": False, "message": "winreg not available"}
    except Exception as e:
        return {"success": False, "message": str(e)}


# ── macOS ────────────────────────────────────────────────────────────

def _list_macos():
    interfaces = []
    for iface in ["en0", "en1", "en2"]:
        try:
            r = subprocess.run(["ifconfig", iface],
                               capture_output=True, text=True, timeout=5)
            if r.returncode != 0:
                continue
            m = re.search(r"ether\s+([\da-fA-F:]+)", r.stdout)
            if m:
                interfaces.append({"name": iface, "device": iface, "mac": m.group(1)})
        except Exception:
            continue
    return interfaces


def _set_mac_macos(interface, mac):
    try:
        # Disassociate from network first (required on macOS)
        subprocess.run(["sudo", "/System/Library/PrivateFrameworks/Apple80211.framework/"
                        "Versions/Current/Resources/airport", "-z"],
                       capture_output=True, timeout=10)
        r = subprocess.run(["sudo", "ifconfig", interface, "ether", mac],
                           capture_output=True, text=True, timeout=10)
        if r.returncode == 0:
            return {"success": True, "message": f"MAC set to {mac} on {interface}"}
        return {"success": False, "message": r.stderr or "Failed"}
    except Exception as e:
        return {"success": False, "message": str(e)}


def _reset_mac_macos(interface):
    try:
        r = subprocess.run(["sudo", "ifconfig", interface, "ether",
                            subprocess.check_output(
                                ["networksetup", "-getmacaddress", interface],
                                text=True, timeout=5
                            ).split()[-1]],
                           capture_output=True, text=True, timeout=10)
        if r.returncode == 0:
            return {"success": True, "message": f"MAC reset on {interface}"}
        return {"success": False, "message": r.stderr or "Failed"}
    except Exception as e:
        return {"success": False, "message": str(e)}


# ── Linux ────────────────────────────────────────────────────────────

def _list_linux():
    interfaces = []
    try:
        r = subprocess.run(["ip", "-o", "link", "show"],
                           capture_output=True, text=True, timeout=10)
        for line in r.stdout.splitlines():
            m = re.match(r"\d+:\s+(\S+):.*link/ether\s+([\da-fA-F:]+)", line)
            if m:
                interfaces.append({"name": m.group(1), "device": m.group(1),
                                    "mac": m.group(2)})
    except Exception:
        pass
    return interfaces


def _set_mac_linux(interface, mac):
    try:
        # Try ip command first
        subprocess.run(["sudo", "ip", "link", "set", interface, "down"],
                       capture_output=True, timeout=10)
        r = subprocess.run(["sudo", "ip", "link", "set", interface,
                            "address", mac],
                           capture_output=True, text=True, timeout=10)
        subprocess.run(["sudo", "ip", "link", "set", interface, "up"],
                       capture_output=True, timeout=10)
        if r.returncode == 0:
            return {"success": True, "message": f"MAC set to {mac} on {interface}"}
        return {"success": False, "message": r.stderr or "Failed"}
    except Exception as e:
        return {"success": False, "message": str(e)}


def _reset_mac_linux(interface):
    """Reset by reading permanent MAC from ethtool."""
    try:
        r = subprocess.run(["ethtool", "-P", interface],
                           capture_output=True, text=True, timeout=5)
        m = re.search(r"([\da-fA-F:]{17})", r.stdout)
        if m:
            return _set_mac_linux(interface, m.group(1))
        return {"success": False, "message": "Could not determine original MAC"}
    except Exception as e:
        return {"success": False, "message": str(e)}


if __name__ == "__main__":
    print("=== Interfaces ===")
    print(json.dumps(list_interfaces(), indent=2))
    print(f"\nRandom MAC: {random_mac()}")
