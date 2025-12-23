import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import maplibregl, { Marker } from 'maplibre-gl';
import { hasSupabaseConfig, supabase } from './lib/supabase';
import ChatList from './components/EmergencyChat/ChatList';
import ChatWindow from './components/EmergencyChat/ChatWindow';
import EmergencyChat from './components/EmergencyChat/EmergencyChat';
import type { Peer } from './lib/mesh/types';

type PositionState = {
  lat: number;
  lon: number;
  accuracy: number | null;
  updatedAt: string;
};

type FriendSummary = {
  id: string;
  name: string;
  updatedAt: string | null;
  lat: number | null;
  lon: number | null;
};

type FriendRequest = {
  id: string;
  user_id: string;
  friend_id: string;
  status: string;
  created_at: string;
};

type ContactMatch = {
  id: string;
  display_name: string | null;
  match_type: string | null;
};

type MapSearchResult = {
  id: string;
  name: string;
  lat: number;
  lon: number;
};

type NearbyFriend = FriendSummary & {
  distance_m?: number;
};

type NotificationItem = {
  id: string;
  type: string;
  payload_json: Record<string, unknown> | null;
  created_at: string;
};

type CommunityAlert = {
  id: string;
  user_id: string;
  category: string;
  message: string;
  created_at: string;
  expires_at?: string | null;
  distance_m?: number;
};

const DEFAULT_CENTER = {
  lat: 37.7749,
  lon: -122.4194,
};

const ALERT_RADIUS_METERS = 500;
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 6;
const COMMUNITY_ALERT_RADIUS_METERS = 5000;
const COMMUNITY_ALERT_MESSAGE_MAX = 200;

const COMMUNITY_ALERT_CATEGORIES = [
  { value: 'water', label: 'Water' },
  { value: 'food', label: 'Food' },
  { value: 'medical', label: 'Medical' },
  { value: 'shelter', label: 'Shelter' },
  { value: 'lost', label: 'Lost person' },
  { value: 'other', label: 'Other' },
];

const COMMUNITY_ALERT_DURATIONS = [
  { value: 60, label: '1 hour' },
  { value: 240, label: '4 hours' },
  { value: 720, label: '12 hours' },
];

const toRadians = (value: number) => (value * Math.PI) / 180;

const distanceMeters = (
  latA: number,
  lonA: number,
  latB: number,
  lonB: number
) => {
  const earthRadius = 6371000;
  const deltaLat = toRadians(latB - latA);
  const deltaLon = toRadians(lonB - lonA);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const a =
    sinLat * sinLat +
    Math.cos(toRadians(latA)) *
    Math.cos(toRadians(latB)) *
    sinLon *
    sinLon;
  return 2 * earthRadius * Math.asin(Math.sqrt(a));
};

const describeNotification = (item: NotificationItem) => {
  if (item.type === 'proximity') {
    const payload = item.payload_json ?? {};
    const name =
      typeof payload.friend_name === 'string' ? payload.friend_name : 'Friend';
    const distance =
      typeof payload.distance_m === 'number' ? payload.distance_m : null;
    if (distance !== null) {
      return `${name} is within ${distance}m`;
    }
    return `${name} is nearby`;
  }
  return item.type;
};

const formatDistance = (distance?: number) => {
  if (typeof distance !== 'number') {
    return null;
  }
  if (distance >= 1000) {
    return `${(distance / 1000).toFixed(1)}km`;
  }
  return `${Math.round(distance)}m`;
};

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const normalizePhone = (value: string) => value.replace(/[^\d]/g, '');

const extractContactValues = (value: string) => {
  const emails = new Set<string>();
  const phones = new Set<string>();

  const emailMatches = value.matchAll(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
  );
  for (const match of emailMatches) {
    emails.add(normalizeEmail(match[0]));
  }

  const phoneMatches = value.matchAll(/(\+?\d[\d\s().-]{6,}\d)/g);
  for (const match of phoneMatches) {
    const normalized = normalizePhone(match[0]);
    if (normalized.length >= 7) {
      phones.add(normalized);
    }
  }

  return { emails: Array.from(emails), phones: Array.from(phones) };
};

export default function App() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const searchMarkerRef = useRef<Marker | null>(null);
  const friendMarkersRef = useRef<Map<string, Marker>>(new Map());
  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<number>(0);
  const lastAlertRef = useRef<Map<string, number>>(new Map());
  const lastServerFetchRef = useRef<number>(0);

  const lastDiscoveryFetchRef = useRef<number>(0);

  const [view, setView] = useState<
    'map' | 'friends' | 'alerts' | 'discover' | 'share' | 'mesh'
  >('map');
  const showRail = view !== 'map' && view !== 'mesh';
  const isMeshView = view === 'mesh';

  const [sharing, setSharing] = useState(false);
  const [position, setPosition] = useState<PositionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [geolocationPermission, setGeolocationPermission] = useState<'prompt' | 'granted' | 'denied' | 'unsupported'>('prompt');
  const [session, setSession] = useState<Session | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [pendingIncoming, setPendingIncoming] = useState<FriendRequest[]>([]);
  const [pendingOutgoing, setPendingOutgoing] = useState<FriendRequest[]>([]);
  const [friendBusy, setFriendBusy] = useState(false);
  const [contactEmailEnabled, setContactEmailEnabled] = useState(false);
  const [contactPhoneInput, setContactPhoneInput] = useState('');
  const [contactSettingsBusy, setContactSettingsBusy] = useState(false);
  const [contactSettingsError, setContactSettingsError] = useState<string | null>(
    null
  );
  const [contactPaste, setContactPaste] = useState('');
  const [contactMatches, setContactMatches] = useState<ContactMatch[]>([]);
  const [contactMatchBusy, setContactMatchBusy] = useState(false);
  const [contactMatchError, setContactMatchError] = useState<string | null>(null);
  const [contactMatchAttempted, setContactMatchAttempted] = useState(false);
  const [contactRequestBusyId, setContactRequestBusyId] = useState<string | null>(
    null
  );
  const [mapQuery, setMapQuery] = useState('');
  const [mapResults, setMapResults] = useState<MapSearchResult[]>([]);
  const [mapSearchBusy, setMapSearchBusy] = useState(false);
  const [mapSearchError, setMapSearchError] = useState<string | null>(null);
  const [activeFriendId, setActiveFriendId] = useState<string | null>(null);
  const [nearbyFriends, setNearbyFriends] = useState<NearbyFriend[]>([]);
  const [serverNearby, setServerNearby] = useState<NearbyFriend[] | null>(null);
  const [discoverable, setDiscoverable] = useState(false);
  const [discoverBusy, setDiscoverBusy] = useState(false);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [discoveredPeople, setDiscoveredPeople] = useState<NearbyFriend[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsError, setNotificationsError] = useState<string | null>(
    null
  );
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >('default');
  const [communityAlerts, setCommunityAlerts] = useState<CommunityAlert[]>([]);
  const [communityAlertsError, setCommunityAlertsError] = useState<string | null>(
    null
  );
  const [communityAlertBusy, setCommunityAlertBusy] = useState(false);
  const [communityAlertError, setCommunityAlertError] = useState<string | null>(
    null
  );
  const [alertCategory, setAlertCategory] = useState('water');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertRadiusKm, setAlertRadiusKm] = useState(2);
  const [alertDurationMinutes, setAlertDurationMinutes] = useState(240);

  const isAuthed = useMemo(() => Boolean(session?.user), [session]);
  const friendIdSet = useMemo(
    () => new Set(friends.map((friend) => friend.id)),
    [friends]
  );
  const pendingOutgoingIdSet = useMemo(
    () => new Set(pendingOutgoing.map((req) => req.friend_id)),
    [pendingOutgoing]
  );
  const pendingIncomingIdSet = useMemo(
    () => new Set(pendingIncoming.map((req) => req.user_id)),
    [pendingIncoming]
  );
  const activeFriend = useMemo(
    () => friends.find((friend) => friend.id === activeFriendId) ?? null,
    [friends, activeFriendId]
  );
  const friendPeers = useMemo<Peer[]>(
    () =>
      friends.map((friend) => ({
        id: friend.id,
        displayName: friend.name,
        connected: true,
        lastSeen: friend.updatedAt
          ? new Date(friend.updatedAt).getTime()
          : Date.now(),
      })),
    [friends]
  );

  useEffect(() => {
    if (!hasSupabaseConfig) {
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!hasSupabaseConfig || !session?.user) {
      return;
    }
    const displayName =
      (session.user.user_metadata?.full_name as string | undefined) ??
      (session.user.user_metadata?.name as string | undefined) ??
      session.user.email?.split('@')[0] ??
      'Friend';
    const ensureProfile = async () => {
      await supabase.from('profiles').upsert(
        {
          id: session.user.id,
          display_name: displayName,
        },
        { onConflict: 'id', ignoreDuplicates: true }
      );
    };
    void ensureProfile();
  }, [session?.user]);

  useEffect(() => {
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported');
      return;
    }
    setNotificationPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGeolocationPermission('unsupported');
      return;
    }

    if ('permissions' in navigator) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((result) => {
          setGeolocationPermission(
            result.state as 'granted' | 'denied' | 'prompt'
          );
          result.addEventListener('change', () => {
            setGeolocationPermission(
              result.state as 'granted' | 'denied' | 'prompt'
            );
          });
        })
        .catch(() => {
          setGeolocationPermission('prompt');
        });
    }
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    mapRef.current = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [DEFAULT_CENTER.lon, DEFAULT_CENTER.lat],
      zoom: 11.5,
      pitch: 35,
      bearing: -20,
    });

    mapRef.current.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      'top-right'
    );
    mapRef.current.addControl(
      new maplibregl.ScaleControl({ unit: 'metric' }),
      'bottom-left'
    );
  }, []);

  useEffect(() => {
    if (view === 'map' && mapRef.current) {
      mapRef.current.resize();
    }
  }, [view]);

  useEffect(() => {
    if (view !== 'map') {
      setMapResults([]);
      setMapSearchError(null);
    }
  }, [view]);

  useEffect(() => {
    const mapInstance = mapRef.current;
    if (!mapInstance || !position) {
      return;
    }

    const lngLat: [number, number] = [position.lon, position.lat];

    if (!markerRef.current) {
      const el = document.createElement('div');
      el.className = 'me-marker';
      markerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat(lngLat)
        .addTo(mapInstance);
    } else {
      markerRef.current.setLngLat(lngLat);
    }

    mapInstance.easeTo({
      center: lngLat,
      zoom: 14,
      pitch: 35,
      bearing: -20,
      duration: 600,
    });
  }, [position]);

  useEffect(() => {
    const mapInstance = mapRef.current;
    if (!mapInstance) {
      return;
    }

    const markerMap = friendMarkersRef.current;
    const activeIds = new Set<string>();

    friends.forEach((friend) => {
      if (friend.lat === null || friend.lon === null) {
        return;
      }
      activeIds.add(friend.id);
      const lngLat: [number, number] = [friend.lon, friend.lat];
      const existing = markerMap.get(friend.id);

      if (existing) {
        existing.setLngLat(lngLat);
        const el = existing.getElement();
        el.title = friend.name;
      } else {
        const el = document.createElement('div');
        el.className = 'friend-marker';
        el.title = friend.name;
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat(lngLat)
          .addTo(mapInstance);
        markerMap.set(friend.id, marker);
      }
    });

    markerMap.forEach((marker, id) => {
      if (!activeIds.has(id)) {
        marker.remove();
        markerMap.delete(id);
      }
    });
  }, [friends]);

  const refreshFriends = useCallback(async () => {
    if (!hasSupabaseConfig || !session?.user) {
      setFriends([]);
      setPendingIncoming([]);
      setPendingOutgoing([]);
      return;
    }

    const userId = session.user.id;
    const { data: links, error: linksError } = await supabase
      .from('friendships')
      .select('id, user_id, friend_id, status, created_at')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

    if (linksError || !links) {
      return;
    }

    const pending = links.filter((link) => link.status === 'pending');
    setPendingIncoming(pending.filter((link) => link.friend_id === userId));
    setPendingOutgoing(pending.filter((link) => link.user_id === userId));

    const accepted = links.filter((link) => link.status === 'accepted');
    const friendIds = accepted.map((link) =>
      link.user_id === userId ? link.friend_id : link.user_id
    );

    if (friendIds.length === 0) {
      setFriends([]);
      return;
    }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', friendIds);

    const { data: locations } = await supabase
      .from('last_locations')
      .select('user_id, lat, lon, updated_at')
      .in('user_id', friendIds);

    const profileMap = new Map<string, string>();
    profiles?.forEach((profile) => {
      profileMap.set(profile.id, profile.display_name ?? 'Friend');
    });

    const locationMap = new Map(
      locations?.map((loc) => [loc.user_id, loc]) ?? []
    );

    const nextFriends = friendIds.map((id) => {
      const loc = locationMap.get(id);
      return {
        id,
        name: profileMap.get(id) ?? 'Friend',
        updatedAt: loc?.updated_at ?? null,
        lat: loc?.lat ?? null,
        lon: loc?.lon ?? null,
      };
    });

    setFriends(nextFriends);
  }, [session]);

  const refreshNotifications = useCallback(async () => {
    if (!hasSupabaseConfig || !session?.user) {
      setNotifications([]);
      return;
    }
    const { data, error: notificationsErrorValue } = await supabase
      .from('notifications')
      .select('id, type, payload_json, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (notificationsErrorValue) {
      setNotificationsError(notificationsErrorValue.message);
      return;
    }

    setNotifications(data ?? []);
  }, [session]);

  const fetchCommunityAlerts = useCallback(async () => {
    if (!hasSupabaseConfig || !session?.access_token) {
      setCommunityAlerts([]);
      return;
    }

    try {
      const response = await fetch(
        `/.netlify/functions/community-alerts?radius_m=${COMMUNITY_ALERT_RADIUS_METERS}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );
      if (!response.ok) {
        setCommunityAlertsError('Unable to load community alerts.');
        setCommunityAlerts([]);
        return;
      }
      const payload = await response.json();
      setCommunityAlerts(payload.alerts ?? []);
      setCommunityAlertsError(null);
    } catch {
      setCommunityAlertsError('Unable to load community alerts.');
      setCommunityAlerts([]);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void refreshFriends();
  }, [refreshFriends]);

  useEffect(() => {
    if (!activeFriendId) {
      return;
    }
    if (!friends.some((friend) => friend.id === activeFriendId)) {
      setActiveFriendId(null);
    }
  }, [activeFriendId, friends]);

  useEffect(() => {
    if (!session?.user) {
      setDiscoverable(false);
      setDiscoveredPeople([]);
      return;
    }
    const loadPrivacy = async () => {
      const { data, error: privacyError } = await supabase
        .from('privacy_settings')
        .select('discoverable')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (privacyError) {
        setDiscoverError(privacyError.message);
        return;
      }
      setDiscoverable(Boolean(data?.discoverable));
    };
    void loadPrivacy();
    const intervalId = window.setInterval(() => {
      void refreshFriends();
    }, 15000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshFriends, session?.user]);

  useEffect(() => {
    if (!session?.user) {
      setContactEmailEnabled(false);
      setContactPhoneInput('');
      setContactSettingsError(null);
      return;
    }
    if (!hasSupabaseConfig) {
      return;
    }
    const loadContactSettings = async () => {
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('contact_email, contact_phone')
        .eq('id', session.user.id)
        .maybeSingle();
      if (profileError) {
        setContactSettingsError(profileError.message);
        return;
      }
      setContactEmailEnabled(Boolean(data?.contact_email));
      setContactPhoneInput(data?.contact_phone ?? '');
      setContactSettingsError(null);
    };
    void loadContactSettings();
  }, [session?.user]);

  useEffect(() => {
    void refreshNotifications();
  }, [refreshNotifications]);

  useEffect(() => {
    if (!session?.user) {
      return;
    }
    const intervalId = window.setInterval(() => {
      void refreshNotifications();
    }, 30000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshNotifications, session?.user]);

  useEffect(() => {
    void fetchCommunityAlerts();
  }, [fetchCommunityAlerts]);

  useEffect(() => {
    if (!session?.user) {
      setCommunityAlerts([]);
      return;
    }
    const intervalId = window.setInterval(() => {
      void fetchCommunityAlerts();
    }, 30000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchCommunityAlerts, session?.user]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const startSharing = useCallback(() => {
    setError(null);

    if (!session?.user) {
      setError('Sign in first to start sharing.');
      return;
    }

    if (!('geolocation' in navigator)) {
      setError('Geolocation is not supported in this browser.');
      setGeolocationPermission('unsupported');
      return;
    }

    if (sharing) {
      return;
    }

    setSharing(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
          updatedAt: new Date().toISOString(),
        });
        setGeolocationPermission('granted');
      },
      (err) => {
        let errorMessage = 'Unable to get your location.';

        switch (err.code) {
          case err.PERMISSION_DENIED:
            errorMessage = 'Location permission denied. Please enable location access in your browser settings.';
            setGeolocationPermission('denied');
            break;
          case err.POSITION_UNAVAILABLE:
            errorMessage = 'Location information is unavailable. Please check your device settings.';
            break;
          case err.TIMEOUT:
            errorMessage = 'Location request timed out. Please try again.';
            break;
          default:
            errorMessage = `Location error: ${err.message}`;
        }

        setError(errorMessage);
        setSharing(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 20_000,
      }
    );
  }, [session?.user, sharing]);

  const stopSharing = () => {
    if (watchIdRef.current !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
    setSharing(false);
  };

  useEffect(() => {
    if (session?.user && !sharing && geolocationPermission !== 'denied') {
      startSharing();
    }
  }, [session?.user, sharing, geolocationPermission, startSharing]);

  const signUp = async () => {
    if (!hasSupabaseConfig) {
      setAuthError('Missing Supabase config.');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setAuthError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });
    if (signUpError) {
      setAuthError(signUpError.message);
    }
    setAuthBusy(false);
  };

  const signInWithGoogle = async () => {
    if (!hasSupabaseConfig) {
      setAuthError('Missing Supabase config.');
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (oauthError) {
      setAuthError(oauthError.message);
    }
    setAuthBusy(false);
  };

  const signIn = async () => {
    if (!hasSupabaseConfig) {
      setAuthError('Missing Supabase config.');
      return;
    }
    setAuthBusy(true);
    setAuthError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      setAuthError(signInError.message);
    }
    setAuthBusy(false);
  };

  const signOut = async () => {
    if (!hasSupabaseConfig) {
      return;
    }
    await supabase.auth.signOut();
    setSharing(false);
  };

  const requestNotifications = async () => {
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported');
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  };

  const shareApp = async (
    platform?: 'facebook' | 'instagram' | 'google' | 'apple'
  ) => {
    const shareUrl = 'https://imaginative-rolypoly-7fda4b.netlify.app/';
    const shareText = 'Join me on iFoundYou - stay connected with friends in real-time!';
    const shareTitle = 'iFoundYou';

    if (platform === 'facebook') {
      window.open(
        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
        '_blank',
        'width=600,height=400'
      );
      return;
    }

    if (platform === 'google') {
      const subject = encodeURIComponent(shareTitle);
      const body = encodeURIComponent(`${shareText}\n${shareUrl}`);
      window.open(
        `https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`,
        '_blank',
        'width=600,height=600'
      );
      return;
    }

    if (platform === 'instagram') {
      try {
        await navigator.clipboard.writeText(shareUrl);
        alert('Link copied! Open Instagram and paste it in your story or message.');
      } catch (err) {
        alert(`Copy this link to share: ${shareUrl}`);
      }
      return;
    }

    if (platform === 'apple') {
      if (navigator.share) {
        try {
          await navigator.share({
            title: shareTitle,
            text: shareText,
            url: shareUrl,
          });
        } catch (err) {
          if ((err as Error).name !== 'AbortError') {
            console.error('Share failed:', err);
          }
        }
      } else {
        try {
          await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
          alert('Link copied to clipboard!');
        } catch (err) {
          alert(`Share this link: ${shareUrl}`);
        }
      }
      return;
    }

    // Try Web Share API first (works great on iPhone)
    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
      } catch (err) {
        // User cancelled or error occurred
        if ((err as Error).name !== 'AbortError') {
          console.error('Share failed:', err);
        }
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
        alert('Link copied to clipboard!');
      } catch (err) {
        alert(`Share this link: ${shareUrl}`);
      }
    }
  };

  const selectMapResult = (result: MapSearchResult) => {
    const mapInstance = mapRef.current;
    if (!mapInstance) {
      return;
    }
    mapInstance.easeTo({
      center: [result.lon, result.lat],
      zoom: 13,
      duration: 700,
    });

    if (searchMarkerRef.current) {
      searchMarkerRef.current.remove();
    }
    const el = document.createElement('div');
    el.className = 'search-marker';
    searchMarkerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([result.lon, result.lat])
      .addTo(mapInstance);
    setMapResults([]);
  };

  const searchPlaces = async () => {
    const trimmed = mapQuery.trim();
    if (!trimmed) {
      setMapResults([]);
      setMapSearchError('Enter a place or address.');
      return;
    }

    setMapSearchBusy(true);
    setMapSearchError(null);

    const mapCenter = mapRef.current?.getCenter();
    const center = mapCenter ?? { lng: DEFAULT_CENTER.lon, lat: DEFAULT_CENTER.lat };
    const delta = 0.35;
    const viewbox = [
      center.lng - delta,
      center.lat - delta,
      center.lng + delta,
      center.lat + delta,
    ].join(',');
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      trimmed
    )}&limit=5&viewbox=${viewbox}&bounded=1`;

    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      });
      if (!response.ok) {
        setMapSearchError('Search failed. Try again.');
        setMapResults([]);
        return;
      }
      const payload = await response.json();
      const results = (Array.isArray(payload) ? payload : [])
        .map((item) => ({
          id: String(item.place_id ?? item.osm_id ?? item.display_name),
          name: item.display_name ?? 'Result',
          lat: Number(item.lat),
          lon: Number(item.lon),
        }))
        .filter(
          (item) => Number.isFinite(item.lat) && Number.isFinite(item.lon)
        );
      setMapResults(results);
      if (results.length === 0) {
        setMapSearchError('No results near the map center.');
      }
    } catch {
      setMapSearchError('Search failed. Check your connection.');
      setMapResults([]);
    } finally {
      setMapSearchBusy(false);
    }
  };

  const findContactMatches = async () => {
    if (!session?.user) {
      return;
    }
    if (!hasSupabaseConfig) {
      setContactMatchError('Missing Supabase config.');
      return;
    }
    const { emails, phones } = extractContactValues(contactPaste);
    setContactMatchAttempted(true);
    if (emails.length === 0 && phones.length === 0) {
      setContactMatchError('Add at least one email or phone number.');
      setContactMatches([]);
      return;
    }
    setContactMatchBusy(true);
    setContactMatchError(null);
    const { data, error } = await supabase.rpc('match_contacts', {
      emails,
      phones,
    });
    if (error) {
      setContactMatchError(error.message);
      setContactMatches([]);
    } else {
      setContactMatches(data ?? []);
    }
    setContactMatchBusy(false);
  };

  const sendContactRequest = async (friendId: string) => {
    if (!session?.user) {
      return;
    }
    if (!hasSupabaseConfig) {
      setContactMatchError('Missing Supabase config.');
      return;
    }
    setContactRequestBusyId(friendId);
    setContactMatchError(null);
    const { error: requestError } = await supabase
      .from('friendships')
      .insert({
        user_id: session.user.id,
        friend_id: friendId,
        status: 'pending',
      });

    if (requestError) {
      setContactMatchError(requestError.message);
    }
    await refreshFriends();
    setContactRequestBusyId(null);
  };

  const toggleDiscoverable = async () => {
    if (!session?.user) {
      return;
    }
    setDiscoverBusy(true);
    setDiscoverError(null);
    const nextValue = !discoverable;
    const { error: updateError } = await supabase.from('privacy_settings').upsert({
      user_id: session.user.id,
      discoverable: nextValue,
      updated_at: new Date().toISOString(),
    });
    if (updateError) {
      setDiscoverError(updateError.message);
    } else {
      setDiscoverable(nextValue);
    }
    setDiscoverBusy(false);
  };

  const sendCommunityAlert = async () => {
    if (!session?.access_token || !session?.user) {
      setCommunityAlertError('Sign in to send an alert.');
      return;
    }
    if (!position) {
      setCommunityAlertError('Start sharing to attach your location.');
      return;
    }
    if (!alertMessage.trim()) {
      setCommunityAlertError('Add a short message for the alert.');
      return;
    }
    setCommunityAlertBusy(true);
    setCommunityAlertError(null);
    try {
      const response = await fetch('/.netlify/functions/community-alerts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category: alertCategory,
          message: alertMessage.trim(),
          lat: position.lat,
          lon: position.lon,
          accuracy_m: position.accuracy,
          radius_m: Math.round(alertRadiusKm * 1000),
          expires_in_minutes: alertDurationMinutes,
        }),
      });

      if (!response.ok) {
        setCommunityAlertError('Failed to send the alert.');
      } else {
        setAlertMessage('');
        await fetchCommunityAlerts();
      }
    } catch {
      setCommunityAlertError('Failed to send the alert.');
    }
    setCommunityAlertBusy(false);
  };

  const toggleContactEmail = async () => {
    if (!session?.user) {
      return;
    }
    if (!hasSupabaseConfig) {
      setContactSettingsError('Missing Supabase config.');
      return;
    }
    const accountEmail = session.user.email;
    if (!accountEmail) {
      setContactSettingsError('No email on file for this account.');
      return;
    }
    const nextValue = !contactEmailEnabled;
    setContactSettingsBusy(true);
    setContactSettingsError(null);
    const { error: updateError } = await supabase.from('profiles').upsert(
      {
        id: session.user.id,
        contact_email: nextValue ? normalizeEmail(accountEmail) : null,
      },
      { onConflict: 'id' }
    );
    if (updateError) {
      setContactSettingsError(updateError.message);
    } else {
      setContactEmailEnabled(nextValue);
    }
    setContactSettingsBusy(false);
  };

  const saveContactPhone = async () => {
    if (!session?.user) {
      return;
    }
    if (!hasSupabaseConfig) {
      setContactSettingsError('Missing Supabase config.');
      return;
    }
    const trimmed = contactPhoneInput.trim();
    const normalized = trimmed ? normalizePhone(trimmed) : '';
    if (trimmed && normalized.length < 7) {
      setContactSettingsError('Phone number looks too short.');
      return;
    }
    setContactSettingsBusy(true);
    setContactSettingsError(null);
    const { error: updateError } = await supabase.from('profiles').upsert(
      {
        id: session.user.id,
        contact_phone: trimmed ? normalized : null,
      },
      { onConflict: 'id' }
    );
    if (updateError) {
      setContactSettingsError(updateError.message);
    } else {
      setContactPhoneInput(trimmed ? normalized : '');
    }
    setContactSettingsBusy(false);
  };

  const respondToRequest = async (requestId: string, status: string) => {
    if (!session?.user) {
      return;
    }
    setFriendBusy(true);
    await supabase.from('friendships').update({ status }).eq('id', requestId);
    await refreshFriends();
    setFriendBusy(false);
  };

  useEffect(() => {
    if (!position) {
      setNearbyFriends([]);
      return;
    }

    const nearby = friends.filter((friend) => {
      if (friend.lat === null || friend.lon === null) {
        return false;
      }
      const distance = distanceMeters(
        position.lat,
        position.lon,
        friend.lat,
        friend.lon
      );
      return distance <= ALERT_RADIUS_METERS;
    });

    setNearbyFriends(nearby);

    if (notificationPermission !== 'granted') {
      return;
    }

    const now = Date.now();
    const lastAlertMap = lastAlertRef.current;
    nearby.forEach((friend) => {
      const lastAlert = lastAlertMap.get(friend.id) ?? 0;
      if (now - lastAlert < ALERT_COOLDOWN_MS) {
        return;
      }
      lastAlertMap.set(friend.id, now);
      new Notification('Friend nearby', {
        body: `${friend.name} is within ${ALERT_RADIUS_METERS}m.`,
      });
    });
  }, [friends, notificationPermission, position]);

  useEffect(() => {
    if (!hasSupabaseConfig || !session?.access_token || !position) {
      setServerNearby(null);
      return;
    }

    const now = Date.now();
    if (now - lastServerFetchRef.current < 20000) {
      return;
    }
    lastServerFetchRef.current = now;

    const fetchNearby = async () => {
      try {
        const response = await fetch(
          `/.netlify/functions/nearby?radius_m=${ALERT_RADIUS_METERS}`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );
        if (!response.ok) {
          setServerNearby(null);
          return;
        }
        const payload = await response.json();
        setServerNearby(payload.friends ?? null);
      } catch {
        setServerNearby(null);
      }
    };

    void fetchNearby();
  }, [position, session?.access_token]);

  useEffect(() => {
    if (!hasSupabaseConfig || !session?.access_token || !position) {
      setDiscoveredPeople([]);
      return;
    }

    const now = Date.now();
    if (now - lastDiscoveryFetchRef.current < 30000) {
      return;
    }
    lastDiscoveryFetchRef.current = now;

    const fetchDiscover = async () => {
      try {
        const response = await fetch(
          `/.netlify/functions/discover?radius_m=1000`,
          {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          }
        );
        if (!response.ok) {
          setDiscoveredPeople([]);
          return;
        }
        const payload = await response.json();
        setDiscoveredPeople(payload.people ?? []);
      } catch {
        setDiscoveredPeople([]);
      }
    };

    void fetchDiscover();
  }, [position, session?.access_token]);

  useEffect(() => {
    if (!hasSupabaseConfig || !sharing || !position || !session?.user) {
      return;
    }

    const now = Date.now();
    if (now - lastSentRef.current < 15000) {
      return;
    }
    lastSentRef.current = now;

    const sendLocationUpdate = async () => {
      const payload = {
        user_id: session.user.id,
        lat: position.lat,
        lon: position.lon,
        accuracy_m: position.accuracy,
        source: 'browser',
      };

      const { error: insertError } = await supabase
        .from('location_updates')
        .insert(payload);

      if (!insertError) {
        await supabase
          .from('last_locations')
          .upsert(
            {
              user_id: session.user.id,
              lat: position.lat,
              lon: position.lon,
              accuracy_m: position.accuracy,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          );
      }

      if (session?.access_token) {
        await fetch('/.netlify/functions/alerts', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ radius_m: ALERT_RADIUS_METERS }),
        });
      }
    };

    void sendLocationUpdate();
  }, [position, session, sharing]);

  const authCard = !isAuthed ? (
    <div className="card auth-card">
      <p className="muted">Sign in to share location and invite friends.</p>
      <label>
        Email
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          disabled={!hasSupabaseConfig}
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="password"
          disabled={!hasSupabaseConfig}
        />
      </label>
      <div className="auth-actions">
        <button
          className="primary"
          onClick={signIn}
          disabled={authBusy || !hasSupabaseConfig}
        >
          Sign in
        </button>
        <button
          className="ghost"
          onClick={signUp}
          disabled={authBusy || !hasSupabaseConfig}
        >
          Create account
        </button>
        <button
          className="google"
          onClick={signInWithGoogle}
          disabled={authBusy || !hasSupabaseConfig}
        >
          Continue with Google
        </button>
      </div>
      {!hasSupabaseConfig && (
        <p className="error">Supabase env vars are missing.</p>
      )}
      {authError && <p className="error">{authError}</p>}
    </div>
  ) : null;

  return (
    <div
      className={`app-shell ${isMeshView ? 'mesh-mode' : ''} ${
        showRail ? 'with-rail' : 'no-rail'
      }`}
    >
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">
            <span className="logo-mark" aria-hidden="true">
              <svg viewBox="0 0 64 64" role="img" focusable="false">
                <path
                  d="M32 3C20.95 3 12 12.22 12 23.6c0 15.05 20 37.4 20 37.4s20-22.35 20-37.4C52 12.22 43.05 3 32 3z"
                  fill="currentColor"
                />
                <circle cx="32" cy="24" r="8" className="logo-mark-core" />
              </svg>
            </span>
            <span className="logo-text">iFoundYou</span>
          </div>
          <p className="eyebrow">Live location network</p>
          <h1>Find your circle in real time.</h1>
          <p className="subhead">
            Private, opt-in location sharing with proximity alerts.
          </p>
        </div>
        <nav className="nav">
          <button
            type="button"
            className={`nav-item ${view === 'map' ? 'is-active' : ''}`}
            onClick={() => setView('map')}
          >
            Map
          </button>
          <button
            type="button"
            className={`nav-item ${view === 'friends' ? 'is-active' : ''}`}
            onClick={() => setView('friends')}
          >
            Friends
          </button>
          <button
            type="button"
            className={`nav-item ${view === 'alerts' ? 'is-active' : ''}`}
            onClick={() => setView('alerts')}
          >
            Alerts
          </button>
          <button
            type="button"
            className={`nav-item ${view === 'discover' ? 'is-active' : ''}`}
            onClick={() => setView('discover')}
          >
            Discover
          </button>
          <button
            type="button"
            className={`nav-item ${view === 'share' ? 'is-active' : ''}`}
            onClick={() => setView('share')}
          >
            Share
          </button>
          <button
            type="button"
            className={`nav-item ${view === 'mesh' ? 'is-active' : ''}`}
            onClick={() => setView('mesh')}
          >
            Mesh
          </button>
        </nav>
        <div className="share-card">
          <div className="share-row">
            <span className={`pill ${sharing ? 'pill-on' : 'pill-off'}`}>
              {sharing ? 'Sharing on' : 'Sharing off'}
            </span>
            <span className="muted">Live share</span>
          </div>
          <div className="share-actions">
            <button
              className="primary"
              onClick={startSharing}
              disabled={sharing || !isAuthed}
            >
              Start sharing
            </button>
            <button className="ghost" onClick={stopSharing} disabled={!sharing}>
              Stop
            </button>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="position-grid">
            <div>
              <span>Latitude</span>
              <strong>{position ? position.lat.toFixed(5) : '--'}</strong>
            </div>
            <div>
              <span>Longitude</span>
              <strong>{position ? position.lon.toFixed(5) : '--'}</strong>
            </div>
            <div>
              <span>Accuracy</span>
              <strong>
                {position && position.accuracy !== null
                  ? `${Math.round(position.accuracy)}m`
                  : '--'}
              </strong>
            </div>
            <div>
              <span>Last update</span>
              <strong>
                {position ? new Date(position.updatedAt).toLocaleTimeString() : '--'}
              </strong>
            </div>
          </div>
          <div className="alerts-row">
            <span className="muted">
              Alerts:{' '}
              {notificationPermission === 'unsupported'
                ? 'Unavailable'
                : notificationPermission}
            </span>
            <button
              className="ghost"
              onClick={requestNotifications}
              disabled={notificationPermission === 'granted' || notificationPermission === 'unsupported'}
            >
              Enable alerts
            </button>
          </div>
          <div className="alerts-row">
            <span className="muted">
              Location:{' '}
              {geolocationPermission === 'unsupported'
                ? 'Unavailable'
                : geolocationPermission === 'granted'
                  ? 'Enabled'
                  : geolocationPermission === 'denied'
                    ? 'Blocked'
                    : 'Not requested'}
            </span>
            {geolocationPermission === 'denied' && (
              <span className="muted" style={{ fontSize: '0.85em' }}>
                Enable in browser settings
              </span>
            )}
          </div>
        </div>
        <div className="sidebar-note">
          <p className="muted">
            Test-only prototype. Sharing stays off until you opt in.
          </p>
        </div>
      </aside>

      <main className="main">
        <section
          className={`map-panel map-only ${view === 'map' ? 'is-active' : 'is-hidden'}`}
        >
          <div className="map" ref={mapContainerRef} />
          {view === 'map' && (
            <>
              <div className="map-overlay">
                <span className="pill">Friends online: {friends.length}</span>
              </div>
              <div className="map-search">
                <div className="map-search-bar">
                  <input
                    value={mapQuery}
                    onChange={(event) => {
                      setMapQuery(event.target.value);
                      if (mapSearchError) {
                        setMapSearchError(null);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void searchPlaces();
                      }
                    }}
                    placeholder="Search places near map center"
                  />
                  <button
                    className="primary"
                    onClick={() => void searchPlaces()}
                    disabled={mapSearchBusy || !mapQuery.trim()}
                  >
                    {mapSearchBusy ? 'Searching...' : 'Search'}
                  </button>
                </div>
                <p className="muted map-search-meta">
                  Powered by OpenStreetMap. Search uses the map center as the origin.
                </p>
                {mapSearchError && <p className="error">{mapSearchError}</p>}
                {mapResults.length > 0 && (
                  <div className="map-results">
                    {mapResults.map((result) => (
                      <button
                        type="button"
                        key={result.id}
                        className="map-result"
                        onClick={() => selectMapResult(result)}
                      >
                        {result.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {view === 'friends' && (
          <section className="friends-panel">
            {!isAuthed && authCard}
            {isAuthed && (
              <div className="friends-chat-layout">
                <div className={`friends-chat-sidebar ${activeFriend ? 'hidden-mobile' : ''}`}>
                  <ChatList
                    peers={friendPeers}
                    onSelectPeer={(peer) => setActiveFriendId(peer.id)}
                    selectedPeerId={activeFriend?.id}
                    title="Friends"
                    statusLabel="friends"
                    statusLabelSingular="friend"
                    emptyTitle="No friends yet"
                    emptyHint="Find friends in the Share tab."
                  />
                </div>
                <div className={`friends-chat-main ${!activeFriend ? 'hidden-mobile' : ''}`}>
                  {activeFriend ? (
                    <>
                      <div className="friends-chat-header">
                        <button
                          className="ghost small"
                          onClick={() => setActiveFriendId(null)}
                        >
                          Back
                        </button>
                        <span className="muted">Friends</span>
                      </div>
                      <ChatWindow
                        userId={session?.user?.id ?? ''}
                        userName={session?.user?.email?.split('@')[0] ?? 'You'}
                        recipientId={activeFriend.id}
                        recipientName={activeFriend.name}
                        mode="web"
                      />
                    </>
                  ) : (
                    <div className="empty-state">
                      <div className="empty-icon">CHAT</div>
                      <h2>Select a friend to chat</h2>
                      <p>Messages sync in real time when you are both online.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {view === 'alerts' && (
          <section className="alerts-panel">
            <div className="panel-header">
              <h2>Alerts</h2>
              <p className="muted">Emergency broadcasts and proximity notifications.</p>
            </div>
            {!isAuthed && authCard}
            <div className="panel-grid">
              {isAuthed && (
                <div className="card emergency-card">
                  <h3>Send an alert</h3>
                  <p className="muted">Broadcast a short message to people nearby.</p>
                  <label className="field">
                    Category
                    <select
                      value={alertCategory}
                      onChange={(event) => setAlertCategory(event.target.value)}
                    >
                      {COMMUNITY_ALERT_CATEGORIES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Message
                    <textarea
                      value={alertMessage}
                      onChange={(event) => setAlertMessage(event.target.value)}
                      rows={3}
                      maxLength={COMMUNITY_ALERT_MESSAGE_MAX}
                      placeholder="Need water near 3rd Ave. Family with kids."
                    />
                  </label>
                  <div className="form-row">
                    <label className="field">
                      Radius (km)
                      <input
                        type="number"
                        min="0.2"
                        max="10"
                        step="0.1"
                        value={alertRadiusKm}
                        onChange={(event) => {
                          const nextValue = Number(event.target.value);
                          setAlertRadiusKm(Number.isFinite(nextValue) ? nextValue : 2);
                        }}
                      />
                    </label>
                    <label className="field">
                      Duration
                      <select
                        value={alertDurationMinutes}
                        onChange={(event) =>
                          setAlertDurationMinutes(Number(event.target.value))
                        }
                      >
                        {COMMUNITY_ALERT_DURATIONS.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <button
                    className="primary"
                    onClick={sendCommunityAlert}
                    disabled={communityAlertBusy || !position}
                  >
                    Send alert
                  </button>
                  {communityAlertError && (
                    <p className="error">{communityAlertError}</p>
                  )}
                </div>
              )}

              <div className="card">
                <h3>Community alerts</h3>
                {communityAlerts.length === 0 ? (
                  <p className="muted">No alerts nearby.</p>
                ) : (
                  <ul>
                    {communityAlerts.map((alert) => {
                      const distanceLabel = formatDistance(alert.distance_m);
                      const categoryLabel =
                        COMMUNITY_ALERT_CATEGORIES.find(
                          (item) => item.value === alert.category
                        )?.label ?? 'Other';
                      return (
                        <li key={alert.id} className="alert-row">
                          <span className={`tag tag-${alert.category}`}>
                            {categoryLabel}
                          </span>
                          <div className="alert-body">
                            <strong>{alert.message}</strong>
                            <span className="distance">
                              {distanceLabel ? `${distanceLabel} - ` : ''}
                              {new Date(alert.created_at).toLocaleTimeString()}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {communityAlertsError && (
                  <p className="error">{communityAlertsError}</p>
                )}
              </div>

              <div className="card">
                <h3>Proximity alerts</h3>
                {notifications.length === 0 ? (
                  <p className="muted">No alerts yet.</p>
                ) : (
                  <ul>
                    {notifications.map((item) => (
                      <li key={item.id}>
                        {describeNotification(item)}
                        <span className="distance">
                          {new Date(item.created_at).toLocaleTimeString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {notificationsError && <p className="error">{notificationsError}</p>}
              </div>
            </div>
          </section>
        )}

        {view === 'discover' && (
          <section className="discover-panel">
            <div className="panel-header">
              <h2>Discover</h2>
              <p className="muted">Find people nearby who are open to connecting.</p>
            </div>
            {!isAuthed && authCard}
            <div className="panel-grid">
              {isAuthed && (
                <div className="card discover-card">
                  <div>
                    <strong>Discovery Mode</strong>
                    <span>
                      {discoverable
                        ? 'You are visible to nearby people.'
                        : 'You are hidden from discovery.'}
                    </span>
                  </div>
                  <button
                    className="ghost"
                    onClick={toggleDiscoverable}
                    disabled={discoverBusy}
                  >
                    {discoverable ? 'Disable' : 'Enable'}
                  </button>
                  {discoverError && <p className="error">{discoverError}</p>}
                </div>
              )}

              <div className="card">
                <h3>People nearby</h3>
                {discoveredPeople.length === 0 ? (
                  <p className="muted">No discoverable people within 1000m.</p>
                ) : (
                  <ul>
                    {discoveredPeople.map((person) => (
                      <li key={person.id}>
                        {person.name}
                        {person.distance_m !== undefined && (
                          <span className="distance">
                            {Math.round(person.distance_m)}m
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        )}

        {view === 'share' && (
          <section className="share-panel">
            <div className="panel-header">
              <h2>Share</h2>
              <p className="muted">Invite friends and control contact matching.</p>
            </div>
            {!isAuthed && authCard}
            <div className="panel-grid">
              {isAuthed && (
                <div className="card contact-card invite-card">
                  <h3>Find friends from contacts</h3>
                  <p className="muted">
                    Paste emails or phone numbers. Friends must enable contact matching
                    first.
                  </p>
                  <label className="field">
                    Paste email/phone contacts
                    <textarea
                      value={contactPaste}
                      onChange={(event) => setContactPaste(event.target.value)}
                      rows={3}
                      placeholder="alex@example.com&#10;+1 415 555 0199"
                    />
                  </label>
                  <div className="contact-actions">
                    <button
                      className="primary"
                      onClick={findContactMatches}
                      disabled={contactMatchBusy || !contactPaste.trim()}
                    >
                      {contactMatchBusy ? 'Searching...' : 'Find matches'}
                    </button>
                  </div>
                  {contactMatchError && (
                    <p className="error">{contactMatchError}</p>
                  )}
                  {contactMatchAttempted && (
                    <div className="contact-results">
                      {contactMatchBusy ? (
                        <p className="muted">Searching...</p>
                      ) : contactMatches.length === 0 ? (
                        <p className="muted">No matches yet.</p>
                      ) : (
                        contactMatches.map((match) => {
                          const isFriend = friendIdSet.has(match.id);
                          const isOutgoing = pendingOutgoingIdSet.has(match.id);
                          const isIncoming = pendingIncomingIdSet.has(match.id);
                          const matchLabel =
                            match.match_type === 'email'
                              ? 'Email match'
                              : match.match_type === 'phone'
                                ? 'Phone match'
                                : 'Match';

                          return (
                            <div key={match.id} className="request-row contact-row">
                              <div className="contact-meta">
                                <strong>{match.display_name ?? 'Friend'}</strong>
                                <span className="muted">{matchLabel}</span>
                              </div>
                              <div className="contact-actions">
                                {isFriend ? (
                                  <span className="muted">Friends</span>
                                ) : isOutgoing ? (
                                  <span className="muted">Pending</span>
                                ) : isIncoming ? (
                                  <span className="muted">Incoming request</span>
                                ) : (
                                  <button
                                    className="primary"
                                    onClick={() => sendContactRequest(match.id)}
                                    disabled={contactRequestBusyId === match.id}
                                  >
                                    {contactRequestBusyId === match.id
                                      ? 'Sending...'
                                      : 'Send request'}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              )}

              {isAuthed && (
                <div className="card">
                  <h3>Share iFoundYou</h3>
                  <p className="muted">Send the app link to people you trust.</p>
                  <div className="share-buttons">
                    <button className="primary" onClick={() => shareApp('apple')}>
                      Share with Apple
                    </button>
                    <button className="primary" onClick={() => shareApp('google')}>
                      Share with Google
                    </button>
                    <button className="ghost" onClick={() => shareApp('facebook')}>
                      Share on Facebook
                    </button>
                    <button className="ghost" onClick={() => shareApp('instagram')}>
                      Share on Instagram
                    </button>
                  </div>
                </div>
              )}

              {isAuthed && (
                <div className="card settings-card">
                  <h3>Contact matching</h3>
                  <p className="muted">
                    Control how friends can find you by email or phone.
                  </p>
                  <div className="setting-row">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={contactEmailEnabled}
                        onChange={toggleContactEmail}
                        disabled={contactSettingsBusy}
                      />
                      Share email address
                    </label>
                  </div>
                  <div className="setting-row">
                    <label>
                      Phone number
                      <input
                        value={contactPhoneInput}
                        onChange={(e) => setContactPhoneInput(e.target.value)}
                        placeholder="+15550000000"
                        disabled={contactSettingsBusy}
                      />
                    </label>
                    <button
                      className="ghost small"
                      onClick={saveContactPhone}
                      disabled={contactSettingsBusy}
                    >
                      Save
                    </button>
                  </div>
                  {contactSettingsError && (
                    <p className="error">{contactSettingsError}</p>
                  )}
                </div>
              )}

              {isAuthed && (
                <div className="card profile-card">
                  <p>
                    Signed in as <strong>{session?.user?.email}</strong>
                  </p>
                  <button className="ghost" onClick={signOut}>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {view === 'mesh' && (
          <EmergencyChat
            userId={session?.user?.id ?? 'anon-' + Math.random().toString(36).substr(2, 9)}
            userName={session?.user?.email?.split('@')[0] ?? 'Anonymous'}
            isAuthed={isAuthed}
            friends={friends.map((friend) => ({
              id: friend.id,
              name: friend.name,
            }))}
            onClose={() => setView('map')}
          />
        )}
      </main>
      {showRail && (
        <aside className="rail">
          {view === 'friends' && (
            <>
              <div className="rail-header">
                <h2>Friends</h2>
                <p className="muted">Manage requests and chat access.</p>
              </div>

              {pendingIncoming.length > 0 && (
                <div className="card pending-list">
                  <h3>Incoming requests</h3>
                  {pendingIncoming.map((req) => (
                    <div key={req.id} className="request-row">
                      <span>{req.user_id}</span>
                      <div className="request-actions">
                        <button
                          className="primary"
                          onClick={() => respondToRequest(req.id, 'accepted')}
                          disabled={friendBusy}
                        >
                          Accept
                        </button>
                        <button
                          className="ghost"
                          onClick={() => respondToRequest(req.id, 'blocked')}
                          disabled={friendBusy}
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {pendingOutgoing.length > 0 && (
                <div className="card pending-list">
                  <h3>Outgoing requests</h3>
                  {pendingOutgoing.map((req) => (
                    <div key={req.id} className="request-row">
                      <span>{req.friend_id}</span>
                      <span className="muted">Pending</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {view === 'alerts' && (
            <>
              <div className="rail-header">
                <h2>Alert status</h2>
                <p className="muted">Keep location sharing on for alert accuracy.</p>
              </div>
              <div className="card">
                <p className="muted">
                  Share your location to attach accuracy and distance to alerts.
                </p>
                <button
                  className="primary"
                  onClick={startSharing}
                  disabled={sharing || !isAuthed}
                >
                  Start sharing
                </button>
                <button className="ghost" onClick={stopSharing} disabled={!sharing}>
                  Stop
                </button>
              </div>
            </>
          )}

          {view === 'discover' && (
            <>
              <div className="rail-header">
                <h2>Discovery tips</h2>
                <p className="muted">Only you control who can find you.</p>
              </div>
              <div className="card">
                <p className="muted">
                  Toggle Discovery Mode and share location to appear nearby.
                </p>
              </div>
            </>
          )}

          {view === 'share' && (
            <>
              <div className="rail-header">
                <h2>Share tips</h2>
                <p className="muted">Invite trusted contacts and grow safely.</p>
              </div>
              <div className="card">
                <p className="muted">
                  Ask friends to enable contact matching so you can find each other.
                </p>
              </div>
            </>
          )}
        </aside>
      )}
      {!isMeshView && (
        <nav className="bottom-nav">
          <button
            type="button"
            className={`nav-item ${view === 'map' ? 'is-active' : ''}`}
            onClick={() => setView('map')}
          >
            Map
          </button>
          <button
            type="button"
            className={`nav-item ${view === 'friends' ? 'is-active' : ''}`}
            onClick={() => setView('friends')}
          >
            Friends
          </button>
          <button
            type="button"
            className={`nav-item ${view === 'alerts' ? 'is-active' : ''}`}
            onClick={() => setView('alerts')}
          >
            Alerts
          </button>
          <button
            type="button"
            className={`nav-item ${view === 'discover' ? 'is-active' : ''}`}
            onClick={() => setView('discover')}
          >
            Discover
          </button>
          <button
            type="button"
            className={`nav-item ${view === 'share' ? 'is-active' : ''}`}
            onClick={() => setView('share')}
          >
            Share
          </button>
          <button
            type="button"
            className={`nav-item ${view === 'mesh' ? 'is-active' : ''}`}
            onClick={() => setView('mesh')}
          >
            Mesh
          </button>
        </nav>
      )}
    </div>
  );
}
