/**
 * Platform detection helpers for adapting UI + transports to the runtime environment.
 */

export type Platform = 'ios' | 'android' | 'desktop' | 'unknown';

export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent || '';
  // iPadOS 13+ reports as Mac, so also check touch points
  const isIos =
    /iPhone|iPad|iPod/.test(ua) ||
    (ua.includes('Mac') && typeof document !== 'undefined' && 'ontouchend' in document);
  if (isIos) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

export function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return detectPlatform() === 'ios' && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS-specific
  if ((navigator as any).standalone === true) return true;
  // Standard PWA detection
  return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
}

export function isInIosNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as any).webkit?.messageHandlers?.multipeer);
}

export function supportsWebBluetooth(): boolean {
  if (typeof navigator === 'undefined') return false;
  return 'bluetooth' in navigator;
}

export function supportsWebSerial(): boolean {
  if (typeof navigator === 'undefined') return false;
  return 'serial' in navigator;
}

/**
 * Recommended primary mesh transport for the current platform.
 */
export function recommendedMeshTransport(): 'bluetooth' | 'http' | 'multipeer' | 'none' {
  if (isInIosNativeApp()) return 'multipeer';
  if (supportsWebBluetooth()) return 'bluetooth';
  // iOS Safari + everything else falls back to ESP32 Wi-Fi
  return 'http';
}
