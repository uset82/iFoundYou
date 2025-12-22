import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';

const moduleName = 'IfoundYouWifiDirect';
const nativeModule = NativeModules[moduleName];
const emitter = nativeModule ? new NativeEventEmitter(nativeModule) : null;

type PeerPayload = {
  name: string;
  address: string;
};

const requestPermissions = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    return false;
  }

  const permissions: string[] = [];

  if (Number(Platform.Version) >= 33) {
    permissions.push(PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES);
  } else {
    permissions.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  }

  const results = await PermissionsAndroid.requestMultiple(permissions);
  return permissions.every(permission => results[permission] === 'granted');
};

export const startWifiDirect = async () => {
  if (Platform.OS !== 'android' || !nativeModule) {
    return false;
  }

  const allowed = await requestPermissions();
  if (!allowed) {
    return false;
  }

  return nativeModule.startDiscovery();
};

export const stopWifiDirect = async () => {
  if (Platform.OS !== 'android' || !nativeModule) {
    return false;
  }

  return nativeModule.stopDiscovery();
};

export const onWifiDirectPeers = (handler: (peers: PeerPayload[]) => void) => {
  if (!emitter) {
    return { remove: () => {} };
  }

  return emitter.addListener('WifiDirectPeers', handler);
};

export const onWifiDirectState = (handler: (payload: { enabled: boolean }) => void) => {
  if (!emitter) {
    return { remove: () => {} };
  }

  return emitter.addListener('WifiDirectState', handler);
};

export const onWifiDirectDiscovery = (handler: (payload: { discovering: boolean }) => void) => {
  if (!emitter) {
    return { remove: () => {} };
  }

  return emitter.addListener('WifiDirectDiscovery', handler);
};
