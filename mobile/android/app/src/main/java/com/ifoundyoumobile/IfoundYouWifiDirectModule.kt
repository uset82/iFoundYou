package com.ifoundyoumobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.wifi.p2p.WifiP2pManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class IfoundYouWifiDirectModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

  private val manager: WifiP2pManager? =
    reactContext.getSystemService(Context.WIFI_P2P_SERVICE) as WifiP2pManager?
  private var channel: WifiP2pManager.Channel? = null
  private var receiverRegistered = false

  private val peerListListener = WifiP2pManager.PeerListListener { peers ->
    val list = Arguments.createArray()
    for (device in peers.deviceList) {
      val map = Arguments.createMap()
      map.putString("name", device.deviceName)
      map.putString("address", device.deviceAddress)
      list.pushMap(map)
    }
    sendEvent("WifiDirectPeers", list)
  }

  private val receiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      val action = intent?.action ?: return
      when (action) {
        WifiP2pManager.WIFI_P2P_STATE_CHANGED_ACTION -> {
          val state = intent.getIntExtra(WifiP2pManager.EXTRA_WIFI_STATE, -1)
          val enabled = state == WifiP2pManager.WIFI_P2P_STATE_ENABLED
          val payload = Arguments.createMap()
          payload.putBoolean("enabled", enabled)
          sendEvent("WifiDirectState", payload)
        }
        WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION -> {
          manager?.requestPeers(channel, peerListListener)
        }
        WifiP2pManager.WIFI_P2P_DISCOVERY_CHANGED_ACTION -> {
          val state = intent.getIntExtra(WifiP2pManager.EXTRA_DISCOVERY_STATE, -1)
          val discovering = state == WifiP2pManager.WIFI_P2P_DISCOVERY_STARTED
          val payload = Arguments.createMap()
          payload.putBoolean("discovering", discovering)
          sendEvent("WifiDirectDiscovery", payload)
        }
      }
    }
  }

  init {
    reactContext.addLifecycleEventListener(this)
  }

  override fun getName(): String {
    return "IfoundYouWifiDirect"
  }

  @ReactMethod
  fun startDiscovery(promise: Promise) {
    if (manager == null) {
      promise.reject("no_manager", "Wi-Fi Direct is not available.")
      return
    }

    if (channel == null) {
      channel = manager.initialize(reactContext, reactContext.mainLooper, null)
    }

    registerReceiver()

    manager.discoverPeers(channel, object : WifiP2pManager.ActionListener {
      override fun onSuccess() {
        promise.resolve(true)
      }

      override fun onFailure(reason: Int) {
        promise.reject("discover_failed", "Discovery failed: $reason")
      }
    })
  }

  @ReactMethod
  fun stopDiscovery(promise: Promise) {
    if (manager == null || channel == null) {
      promise.resolve(false)
      return
    }

    manager.stopPeerDiscovery(channel, object : WifiP2pManager.ActionListener {
      override fun onSuccess() {
        promise.resolve(true)
      }

      override fun onFailure(reason: Int) {
        promise.reject("stop_failed", "Stop discovery failed: $reason")
      }
    })
  }

  private fun registerReceiver() {
    if (receiverRegistered) {
      return
    }

    val filter = IntentFilter()
    filter.addAction(WifiP2pManager.WIFI_P2P_STATE_CHANGED_ACTION)
    filter.addAction(WifiP2pManager.WIFI_P2P_PEERS_CHANGED_ACTION)
    filter.addAction(WifiP2pManager.WIFI_P2P_DISCOVERY_CHANGED_ACTION)
    reactContext.registerReceiver(receiver, filter)
    receiverRegistered = true
  }

  private fun unregisterReceiver() {
    if (!receiverRegistered) {
      return
    }

    try {
      reactContext.unregisterReceiver(receiver)
    } catch (_: Exception) {
      // Receiver might already be unregistered.
    } finally {
      receiverRegistered = false
    }
  }

  private fun sendEvent(eventName: String, payload: Any?) {
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, payload)
  }

  override fun onHostResume() {
    registerReceiver()
  }

  override fun onHostPause() {
    // Keep receiver registered for background discovery callbacks.
  }

  override fun onHostDestroy() {
    unregisterReceiver()
  }
}
