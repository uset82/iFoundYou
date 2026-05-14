"""
WiFi Companion Server for iFoundYou.
Exposes WiFi scanning, MAC spoofing, and network user discovery via REST API.
Run with: python server.py
Requires admin/root for MAC spoofing operations.
"""
from flask import Flask, jsonify, request
from flask_cors import CORS
from wifi_scanner import scan_networks, get_current_connection, connect_to_network
from mac_spoofer import (list_interfaces, set_mac, randomize_mac,
                         reset_mac, get_current_mac, random_mac)
from wifi_users import discover_users

app = Flask(__name__)
CORS(app, origins=["http://localhost:*", "http://127.0.0.1:*",
                    "https://*.netlify.app"])

PORT = 7829


@app.route("/api/status")
def status():
    """Current WiFi connection info."""
    conn = get_current_connection()
    return jsonify({"status": "ok", "connection": conn})


@app.route("/api/networks")
def networks():
    """Scan for nearby WiFi networks."""
    nets = scan_networks()
    return jsonify({"networks": nets})


@app.route("/api/users")
def users():
    """Discover devices on the current network."""
    devices = discover_users()
    return jsonify({"users": devices})


@app.route("/api/interfaces")
def interfaces():
    """List network interfaces with MAC addresses."""
    ifaces = list_interfaces()
    return jsonify({"interfaces": ifaces})


@app.route("/api/mac/current")
def mac_current():
    """Get current MAC of specified interface."""
    iface = request.args.get("interface")
    mac = get_current_mac(iface)
    return jsonify({"interface": iface, "mac": mac})


@app.route("/api/mac/randomize", methods=["POST"])
def mac_randomize():
    """Randomize MAC address on the specified interface."""
    data = request.get_json(silent=True) or {}
    iface = data.get("interface")
    if not iface:
        return jsonify({"success": False, "message": "interface is required"}), 400
    result = randomize_mac(iface)
    return jsonify(result)


@app.route("/api/mac/set", methods=["POST"])
def mac_set():
    """Set a specific MAC address."""
    data = request.get_json(silent=True) or {}
    iface = data.get("interface")
    mac = data.get("mac")
    if not iface or not mac:
        return jsonify({"success": False,
                        "message": "interface and mac are required"}), 400
    result = set_mac(iface, mac)
    return jsonify(result)


@app.route("/api/mac/reset", methods=["POST"])
def mac_reset():
    """Reset MAC address to hardware original."""
    data = request.get_json(silent=True) or {}
    iface = data.get("interface")
    if not iface:
        return jsonify({"success": False, "message": "interface is required"}), 400
    result = reset_mac(iface)
    return jsonify(result)


@app.route("/api/connect", methods=["POST"])
def connect():
    """Connect to a WiFi network."""
    data = request.get_json(silent=True) or {}
    ssid = data.get("ssid")
    password = data.get("password")
    if not ssid:
        return jsonify({"success": False, "message": "ssid is required"}), 400
    result = connect_to_network(ssid, password)
    return jsonify(result)


if __name__ == "__main__":
    print(f"WiFi Companion Server starting on http://localhost:{PORT}")
    print("Endpoints: /api/status, /api/networks, /api/users, /api/interfaces")
    print("           /api/mac/current, /api/mac/randomize, /api/mac/set, /api/mac/reset")
    print("           /api/connect")
    print("Press Ctrl+C to stop.\n")
    app.run(host="127.0.0.1", port=PORT, debug=False)
