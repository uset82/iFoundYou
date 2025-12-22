import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import maplibregl, { Marker } from 'maplibre-gl';
import { hasSupabaseConfig, supabase } from './lib/supabase';

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

export default function App() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const friendMarkersRef = useRef<Map<string, Marker>>(new Map());
  const watchIdRef = useRef<number | null>(null);
  const lastSentRef = useRef<number>(0);
  const lastAlertRef = useRef<Map<string, number>>(new Map());
  const lastServerFetchRef = useRef<number>(0);
  const lastDiscoveryFetchRef = useRef<number>(0);

  const [sharing, setSharing] = useState(false);
  const [position, setPosition] = useState<PositionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [pendingIncoming, setPendingIncoming] = useState<FriendRequest[]>([]);
  const [pendingOutgoing, setPendingOutgoing] = useState<FriendRequest[]>([]);
  const [friendIdInput, setFriendIdInput] = useState('');
  const [friendBusy, setFriendBusy] = useState(false);
  const [friendError, setFriendError] = useState<string | null>(null);
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
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported');
      return;
    }
    setNotificationPermission(Notification.permission);
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

  const startSharing = () => {
    setError(null);

    if (!session?.user) {
      setError('Sign in first to start sharing.');
      return;
    }

    if (!('geolocation' in navigator)) {
      setError('Geolocation is not supported in this browser.');
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
      },
      (err) => {
        setError(err.message);
        setSharing(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 20_000,
      }
    );
  };

  const stopSharing = () => {
    if (watchIdRef.current !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = null;
    setSharing(false);
  };

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

  const sendFriendRequest = async () => {
    if (!session?.user) {
      setFriendError('Sign in first to add friends.');
      return;
    }
    if (!friendIdInput.trim()) {
      setFriendError('Enter a friend user id.');
      return;
    }
    if (friendIdInput.trim() === session.user.id) {
      setFriendError('You cannot add yourself.');
      return;
    }

    setFriendBusy(true);
    setFriendError(null);
    const { error: requestError } = await supabase.from('friendships').insert({
      user_id: session.user.id,
      friend_id: friendIdInput.trim(),
      status: 'pending',
    });

    if (requestError) {
      setFriendError(requestError.message);
    } else {
      setFriendIdInput('');
      await refreshFriends();
    }
    setFriendBusy(false);
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

  return (
    <div className="app-shell">
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
          <button type="button" className="nav-item is-active">
            Map
          </button>
          <button type="button" className="nav-item">
            Friends
          </button>
          <button type="button" className="nav-item">
            Alerts
          </button>
          <button type="button" className="nav-item">
            Discover
          </button>
          <button type="button" className="nav-item">
            Settings
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
              disabled={notificationPermission === 'granted'}
            >
              Enable alerts
            </button>
          </div>
        </div>
        <div className="sidebar-note">
          <p className="muted">
            Test-only prototype. Sharing stays off until you opt in.
          </p>
        </div>
      </aside>

      <main className="main">
        <section className="map-panel">
          <div className="map" ref={mapContainerRef} />
        </section>
        <section className="tile-grid">
          <div className="tile">
            <h3>Nearby now</h3>
            {(serverNearby ?? nearbyFriends).length === 0 ? (
              <p className="muted">No friends within {ALERT_RADIUS_METERS}m.</p>
            ) : (
              <ul>
                {(serverNearby ?? nearbyFriends).map((friend) => (
                  <li key={friend.id}>
                    {friend.name}
                    {friend.distance_m !== undefined && (
                      <span className="distance">
                        {Math.round(friend.distance_m)}m
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="muted nearby-source">
              Source: {serverNearby ? 'Server' : 'Local'}
            </p>
          </div>
          <div className="tile">
            <h3>Discover</h3>
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
          <div className="tile">
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
          <div className="tile">
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
                          {distanceLabel ? `${distanceLabel} · ` : ''}
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
        </section>
      </main>

      <aside className="rail">
        <div className="rail-header">
          <h2>Friends</h2>
          <p className="muted">Invite, manage, and share with your circle.</p>
        </div>
        {!isAuthed && (
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
        )}
        {isAuthed && (
          <div className="card profile-card">
            <div>
              <strong>{session?.user.email}</strong>
              <span>Signed in</span>
            </div>
            <button className="ghost" onClick={signOut}>
              Sign out
            </button>
          </div>
        )}

        {isAuthed && (
          <div className="card discover-card">
            <div>
              <strong>Discovery</strong>
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

        {isAuthed && (
          <div className="card emergency-card">
            <h3>Emergency broadcast</h3>
            <p className="muted">Send a short alert to people nearby.</p>
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

        {isAuthed && (
          <div className="card request-card">
            <label>
              Add friend by id
              <input
                value={friendIdInput}
                onChange={(event) => setFriendIdInput(event.target.value)}
                placeholder="friend uuid"
              />
            </label>
            <button
              className="primary"
              onClick={sendFriendRequest}
              disabled={friendBusy}
            >
              Send request
            </button>
            {friendError && <p className="error">{friendError}</p>}
          </div>
        )}

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

        <div className="card friend-list">
          {friends.length === 0 && (
            <div className="friend-card empty">
              <div>
                <strong>No friends yet</strong>
                <span>Add friends once requests are wired.</span>
              </div>
            </div>
          )}
          {friends.map((friend) => (
            <div key={friend.id} className="friend-card">
              <div>
                <strong>{friend.name}</strong>
                <span>
                  {friend.updatedAt
                    ? `Updated ${new Date(friend.updatedAt).toLocaleTimeString()}`
                    : 'No location yet'}
                </span>
              </div>
              <button className="ghost" disabled>
                Ping
              </button>
            </div>
          ))}
        </div>
        <div className="card callout">
          <h3>Next step</h3>
          <p>Add server-side proximity alerts and web push subscriptions.</p>
        </div>
      </aside>
    </div>
  );
}
