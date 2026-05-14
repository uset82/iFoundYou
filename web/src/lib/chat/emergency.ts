/**
 * Emergency message protocol — short, structured messages designed for
 * low-bandwidth transports like Meshtastic LoRa.
 *
 * Phase 3.1 / 3.6 — Mesh Guardian
 */

export type EmergencyCategory =
  | 'safe'
  | 'help'
  | 'water'
  | 'food'
  | 'medical'
  | 'danger'
  | 'custom';

export type EmergencyPriority = 'normal' | 'urgent' | 'critical';

export type EmergencyChannel =
  | 'family'
  | 'neighborhood'
  | 'medical'
  | 'security'
  | 'broadcast';

/** Maximum length of the human-typed text portion. */
export const EMERGENCY_TEXT_MAX = 200;

/**
 * The structured payload. When transmitted over LoRa we serialize this to
 * a compact tag-prefixed line; over the internet we just JSON it.
 */
export interface EmergencyMessage {
  category: EmergencyCategory;
  priority: EmergencyPriority;
  text: string; // <= 200 chars
  lat?: number;
  lon?: number;
  ts: number; // unix ms
  channel: EmergencyChannel;
}

interface CategoryMeta {
  id: EmergencyCategory;
  label: string;
  icon: string;
  defaultPriority: EmergencyPriority;
  defaultText: string;
  description: string;
  color: string;
}

export const CATEGORY_META: Record<EmergencyCategory, CategoryMeta> = {
  safe: {
    id: 'safe',
    label: 'SAFE',
    icon: '✅',
    defaultPriority: 'normal',
    defaultText: 'I am safe',
    description: 'Tell others you are okay',
    color: '#22c55e',
  },
  help: {
    id: 'help',
    label: 'HELP',
    icon: '🆘',
    defaultPriority: 'urgent',
    defaultText: 'Need assistance',
    description: 'You need urgent help',
    color: '#ef4444',
  },
  water: {
    id: 'water',
    label: 'WATER',
    icon: '💧',
    defaultPriority: 'urgent',
    defaultText: 'Need water',
    description: 'Request drinkable water',
    color: '#3ac6ff',
  },
  food: {
    id: 'food',
    label: 'FOOD',
    icon: '🥫',
    defaultPriority: 'urgent',
    defaultText: 'Need food',
    description: 'Request food supplies',
    color: '#84cc16',
  },
  medical: {
    id: 'medical',
    label: 'MEDICAL',
    icon: '⛑️',
    defaultPriority: 'critical',
    defaultText: 'Medical emergency',
    description: 'Medical emergency in progress',
    color: '#f59e0b',
  },
  danger: {
    id: 'danger',
    label: 'DANGER',
    icon: '⚠️',
    defaultPriority: 'critical',
    defaultText: 'Danger here',
    description: 'Warn others of an active threat',
    color: '#dc2626',
  },
  custom: {
    id: 'custom',
    label: 'CUSTOM',
    icon: '✏️',
    defaultPriority: 'normal',
    defaultText: '',
    description: 'Your own short message',
    color: '#9aa0a6',
  },
};

export const CHANNEL_META: Record<EmergencyChannel, { label: string; icon: string }> = {
  family: { label: 'Family', icon: '👨‍👩‍👧' },
  neighborhood: { label: 'Neighborhood', icon: '🏘️' },
  medical: { label: 'Medical', icon: '🏥' },
  security: { label: 'Security', icon: '🛡️' },
  broadcast: { label: 'Broadcast', icon: '📣' },
};

export const PRIORITY_META: Record<
  EmergencyPriority,
  { label: string; color: string; weight: number }
> = {
  normal: { label: 'Normal', color: '#9aa0a6', weight: 1 },
  urgent: { label: 'Urgent', color: '#f59e0b', weight: 2 },
  critical: { label: 'Critical', color: '#ef4444', weight: 3 },
};

const COMPRESSION_RULES: Array<[RegExp, string]> = [
  [/\bwe are\b/gi, 'WE'],
  [/\bi am\b/gi, 'I'],
  [/\byou are\b/gi, 'U'],
  [/\bplease\b/gi, 'PLS'],
  [/\bthank you\b/gi, 'TY'],
  [/\bnot\b/gi, 'NO'],
  [/\bneed\b/gi, 'NEED+'],
  [/\bemergency\b/gi, 'EMRG'],
  [/\bhospital\b/gi, 'HOSP'],
  [/\binjured\b/gi, 'INJ'],
  [/\bchildren\b/gi, 'KIDS'],
  [/\bevacuate\b/gi, 'EVAC'],
  [/\bdangerous\b/gi, 'DNGR'],
  [/\bwithin\b/gi, 'IN'],
  [/\bbefore\b/gi, 'B4'],
  [/\bbecause\b/gi, 'B/C'],
  [/\bwithout\b/gi, 'W/O'],
  [/\bmedicine\b/gi, 'MED'],
  [/\bmedical\b/gi, 'MED'],
  [/\bsupplies\b/gi, 'SUPP'],
  [/\bbasement\b/gi, 'BSMT'],
  [/\bbuilding\b/gi, 'BLDG'],
  [/\bapartment\b/gi, 'APT'],
  [/\bnumber\b/gi, '#'],
  [/\s{2,}/g, ' '],
];

/**
 * Compress a verbose message into a compact LoRa-friendly form.
 *
 * Example:
 *  in:  "We are in the school basement. Everyone is alive, but we need
 *        water and medicine."
 *  out: "WE IN SCHOOL BSMT. EVERYONE ALIVE BUT WE NEED+ WATER AND MED."
 */
export function compressEmergencyText(input: string): string {
  let out = input.trim();
  for (const [pattern, replacement] of COMPRESSION_RULES) {
    out = out.replace(pattern, replacement);
  }
  return out.toUpperCase().trim();
}

/**
 * Build the final on-the-wire string for an emergency message.
 * Format: `EWS|<channel>|<priority>|<category>|<lat>,<lon>|<ts>|<text>`
 *
 * Pipes are unlikely in human text and parse cheaply on the receiver.
 * Total target length: ≤ 230 bytes (LoRa default packet limit).
 */
export function encodeEmergencyMessage(msg: EmergencyMessage): string {
  const lat = msg.lat !== undefined ? msg.lat.toFixed(4) : '';
  const lon = msg.lon !== undefined ? msg.lon.toFixed(4) : '';
  const loc = lat && lon ? `${lat},${lon}` : '';
  const text = compressEmergencyText(msg.text || CATEGORY_META[msg.category].defaultText);
  return [
    'EWS',
    msg.channel,
    msg.priority,
    msg.category,
    loc,
    String(msg.ts),
    text,
  ].join('|');
}

/** Parse a wire-format string back into an EmergencyMessage, or null. */
export function decodeEmergencyMessage(raw: string): EmergencyMessage | null {
  if (!raw || !raw.startsWith('EWS|')) return null;
  const parts = raw.split('|');
  if (parts.length < 7) return null;
  const [, channel, priority, category, locStr, tsStr, ...textParts] = parts;
  const text = textParts.join('|');

  const cat = category as EmergencyCategory;
  const pri = priority as EmergencyPriority;
  const ch = channel as EmergencyChannel;
  if (!CATEGORY_META[cat] || !PRIORITY_META[pri] || !CHANNEL_META[ch]) return null;

  const ts = Number(tsStr);
  if (!Number.isFinite(ts)) return null;

  let lat: number | undefined;
  let lon: number | undefined;
  if (locStr) {
    const [latStr, lonStr] = locStr.split(',');
    const parsedLat = Number(latStr);
    const parsedLon = Number(lonStr);
    if (Number.isFinite(parsedLat) && Number.isFinite(parsedLon)) {
      lat = parsedLat;
      lon = parsedLon;
    }
  }

  return { category: cat, priority: pri, channel: ch, ts, text, lat, lon };
}

/**
 * Classify a body text as an emergency message if it starts with the
 * `EWS|` prefix. Used to render decoded emergency messages distinctly in
 * the chat UI.
 */
export function isEmergencyEncoded(body: string): boolean {
  return typeof body === 'string' && body.startsWith('EWS|');
}
