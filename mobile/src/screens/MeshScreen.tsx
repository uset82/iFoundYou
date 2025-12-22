import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Device } from 'react-native-ble-plx';
import { ScreenLayout } from '../components/ScreenLayout';
import { InfoCard } from '../components/InfoCard';
import { startBleScan, stopBleScan } from '../lib/ble';
import { colors, spacing } from '../theme';

export const MeshScreen = () => {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<Record<string, Device>>({});

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

  useEffect(() => {
    return () => {
      stopBleScan();
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
