/**
 * Generates a random 256-bit AES-GCM key and returns it as a base64 string.
 * This is used for generating Pre-Shared Keys (PSKs) for mesh channels.
 */
export async function generateChannelKey(): Promise<string> {
  const key = await window.crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true, // extractable
    ['encrypt', 'decrypt'],
  );

  const exported = await window.crypto.subtle.exportKey('raw', key);
  const buffer = new Uint8Array(exported);
  
  // Convert to base64
  let binary = '';
  for (let i = 0; i < buffer.byteLength; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}
