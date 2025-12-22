import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Device } from 'react-native-ble-plx';
import { ScreenLayout } from '../components/ScreenLayout';
import { InfoCard } from '../components/InfoCard';
import { startBleScan, stopBleScan } from '../lib/ble';
import {
  onMultipeerMessage,
  onMultipeerPeers,
  startMultipeer,
  stopMultipeer,
} from '../lib/multipeer';
import {
  onWifiDirectDiscovery,
  onWifiDirectPeers,
  onWifiDirectState,
  startWifiDirect,
  stopWifiDirect,
} from '../lib/wifidirect';
import { colors, spacing } from '../theme';

export const MeshScreen = () => {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<Record<string, Device>>({});
  const [p2pActive, setP2pActive] = useState(false);
  const [p2pPeers, setP2pPeers] = useState<string[]>([]);
  const [lastP2pMessage, setLastP2pMessage] = useState<string | null>(null);
  const [wifiActive, setWifiActive] = useState(false);
  const [wifiDiscovering, setWifiDiscovering] = useState(false);
  const [wifiPeers, setWifiPeers] = useState<
    { name: string; address: string }[]
  >([]);
  const [wifiError, setWifiError] = useState<string | null>(null);

  const handleDevice = useCallback((device: Device) => {
    setDevices(prev => {
      if (prev[device.id]) {
        return prev;
      }

      return { ...prev, [device.id]: device };
    });
  }, []);

  const startScan = useCallback(async () => {
    setError(null);
    setDevices({});
    setScanning(true);

    const started = await startBleScan({
      onDevice: handleDevice,
      onError: scanError => {
        setError(scanError.message);
        setScanning(false);
      },
    });

    if (!started) {
      setScanning(false);
    }
  }, [handleDevice]);

  const stopScan = useCallback(() => {
    stopBleScan();
    setScanning(false);
  }, []);

  const startP2P = useCallback(async () => {
    setError(null);
    const started = await startMultipeer();
    setP2pActive(Boolean(started));
  }, []);

  const stopP2P = useCallback(async () => {
    await stopMultipeer();
    setP2pActive(false);
    setP2pPeers([]);
  }, []);

  const startWifi = useCallback(async () => {
    setWifiError(null);
    const started = await startWifiDirect();
    setWifiActive(Boolean(started));
    if (!started) {
      setWifiError('Wi-Fi Direct permission denied or unavailable.');
    }
  }, []);

  const stopWifi = useCallback(async () => {
    await stopWifiDirect();
    setWifiActive(false);
    setWifiDiscovering(false);
    setWifiPeers([]);
  }, []);

  useEffect(() => {
    return () => {
      stopBleScan();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      return undefined;
    }

    const peerSub = onMultipeerPeers(payload => {
      setP2pPeers(payload.peers ?? []);
    });

    const messageSub = onMultipeerMessage(payload => {
      setLastP2pMessage(`${payload.from}: ${payload.message}`);
    });

    return () => {
      peerSub.remove();
      messageSub.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }

    const peersSub = onWifiDirectPeers(payload => {
      setWifiPeers(payload ?? []);
    });

    const stateSub = onWifiDirectState(payload => {
      setWifiActive(payload.enabled);
    });

    const discoverySub = onWifiDirectDiscovery(payload => {
      setWifiDiscovering(payload.discovering);
    });

    return () => {
      peersSub.remove();
      stateSub.remove();
      discoverySub.remove();
    };
  }, []);

  const deviceList = useMemo(() => Object.values(devices), [devices]);

  return (
    <ScreenLayout
      title="Mesh Status"
      subtitle="Local connectivity and relay overview."
    >
      <InfoCard
        title="Transport stack"
        description="iOS: Multipeer; Cross-platform: BLE; Android: Wi-Fi Direct."
      />
      <View style={styles.controls}>
        <Pressable
          style={[styles.button, scanning && styles.buttonActive]}
          onPress={scanning ? stopScan : startScan}
        >
          <Text style={styles.buttonText}>
            {scanning ? 'Stop scan' : 'Start scan'}
          </Text>
        </Pressable>
        <Text style={styles.status}>
          {scanning ? 'Scanning for nearby devices...' : 'Scan paused.'}
        </Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.list}>
        {deviceList.length === 0 ? (
          <Text style={styles.muted}>No devices found yet.</Text>
        ) : (
          deviceList.map(device => (
            <View key={device.id} style={styles.deviceRow}>
              <Text style={styles.deviceName}>
                {device.name ?? 'Unknown device'}
              </Text>
              <Text style={styles.deviceId}>{device.id}</Text>
            </View>
          ))
        )}
      </View>
      {Platform.OS === 'ios' ? (
        <View style={styles.controls}>
          <Pressable
            style={[styles.button, p2pActive && styles.buttonActive]}
            onPress={p2pActive ? stopP2P : startP2P}
          >
            <Text style={styles.buttonText}>
              {p2pActive ? 'Stop P2P' : 'Start P2P'}
            </Text>
          </Pressable>
          <Text style={styles.status}>
            {p2pActive
              ? `Connected peers: ${p2pPeers.length}`
              : 'P2P is idle.'}
          </Text>
          {p2pPeers.length > 0 ? (
            <Text style={styles.muted}>{p2pPeers.join(', ')}</Text>
          ) : null}
          {lastP2pMessage ? (
            <Text style={styles.muted}>Last: {lastP2pMessage}</Text>
          ) : null}
        </View>
      ) : null}
      {Platform.OS === 'android' ? (
        <View style={styles.controls}>
          <Pressable
            style={[styles.button, wifiActive && styles.buttonActive]}
            onPress={wifiActive ? stopWifi : startWifi}
          >
            <Text style={styles.buttonText}>
              {wifiActive ? 'Stop Wi-Fi Direct' : 'Start Wi-Fi Direct'}
            </Text>
          </Pressable>
          <Text style={styles.status}>
            {wifiDiscovering
              ? 'Wi-Fi Direct discovery active.'
              : 'Wi-Fi Direct idle.'}
          </Text>
          {wifiError ? <Text style={styles.error}>{wifiError}</Text> : null}
          {wifiPeers.length > 0 ? (
            <Text style={styles.muted}>
              Peers: {wifiPeers.map(peer => peer.name || peer.address).join(', ')}
            </Text>
          ) : (
            <Text style={styles.muted}>No Wi-Fi Direct peers yet.</Text>
          )}
        </View>
      ) : null}
      <InfoCard
        title="Routing"
        description="Store-and-forward with TTL, deduplication, and bounded retries."
      />
      <InfoCard
        title="Range"
        description="Short range on BLE/Wi-Fi; optional Meshtastic bridge for long range."
      />
    </ScreenLayout>
  );
};

const styles = StyleSheet.create({
  controls: {
    gap: spacing.sm,
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 999,
    paddingVertical: spacing.sm,
  },
  buttonActive: {
    backgroundColor: colors.accentDark,
  },
  buttonText: {
    color: colors.text,
    fontWeight: '600',
  },
  status: {
    color: colors.muted,
    fontSize: 12,
  },
  error: {
    color: colors.danger,
  },
  list: {
    gap: spacing.sm,
  },
  deviceRow: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 12,
    padding: spacing.sm,
  },
  deviceName: {
    color: colors.text,
    fontWeight: '600',
  },
  deviceId: {
    color: colors.muted,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  muted: {
    color: colors.muted,
  },
});
