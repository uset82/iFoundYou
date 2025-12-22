import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

const moduleName = 'IfoundYouMultipeer';
const nativeModule = NativeModules[moduleName];
const emitter = nativeModule ? new NativeEventEmitter(nativeModule) : null;

type PeerUpdatePayload = {
  peers: string[];
};

type MessagePayload = {
  from: string;
  message: string;
};

export const startMultipeer = async (displayName?: string) => {
  if (Platform.OS !== 'ios' || !nativeModule) {
    return false;
  }

  return nativeModule.startSession(displayName ?? '');
};

export const stopMultipeer = async () => {
  if (Platform.OS !== 'ios' || !nativeModule) {
    return false;
  }

  return nativeModule.stopSession();
};

export const sendMultipeerMessage = async (message: string) => {
  if (Platform.OS !== 'ios' || !nativeModule) {
    return false;
  }

  return nativeModule.sendMessage(message);
};

export const onMultipeerPeers = (handler: (payload: PeerUpdatePayload) => void) => {
  if (!emitter) {
    return { remove: () => {} };
  }

  return emitter.addListener('MultipeerPeerUpdate', handler);
};

export const onMultipeerMessage = (handler: (payload: MessagePayload) => void) => {
  if (!emitter) {
    return { remove: () => {} };
  }

  return emitter.addListener('MultipeerMessage', handler);
};
