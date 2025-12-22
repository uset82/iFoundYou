import { BleManager, Device } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';

const bleManager = new BleManager();

type ScanHandlers = {
  onDevice: (device: Device) => void;
  onError?: (error: Error) => void;
};

const requestAndroidBlePermissions = async (): Promise<boolean> => {
  const permissions: string[] = [];

  permissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
  permissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);

  if (Number(Platform.Version) < 31) {
    permissions.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  }

  const results = await PermissionsAndroid.requestMultiple(permissions);

  return permissions.every(permission => results[permission] === 'granted');
};

const ensurePermissions = async (): Promise<boolean> => {
  if (Platform.OS === 'android') {
    return requestAndroidBlePermissions();
  }

  return true;
};

export const startBleScan = async ({ onDevice, onError }: ScanHandlers) => {
  const allowed = await ensurePermissions();

  if (!allowed) {
    onError?.(new Error('Bluetooth permissions not granted.'));
    return false;
  }

  bleManager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
    if (error) {
      onError?.(error);
      return;
    }

    if (device) {
      onDevice(device);
    }
  });

  return true;
};

export const stopBleScan = () => {
  bleManager.stopDeviceScan();
};
