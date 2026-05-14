import { useEffect, useState } from 'react';
import { hasSupabaseConfig, supabase } from '../../lib/supabase';
import './ProfilePanel.css';

interface ProfilePanelProps {
  userId: string;
  email: string | null;
  onSignOut: () => void;
}

interface ProfileRow {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}

export default function ProfilePanel({ userId, email, onSignOut }: ProfilePanelProps) {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!userId || !hasSupabaseConfig) {
      setProfile(null);
      return;
    }

    let cancelled = false;
    setLoadError(null);

    const load = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, contact_email, contact_phone')
        .eq('id', userId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setLoadError(error.message);
        return;
      }
      const row: ProfileRow =
        data ?? {
          id: userId,
          display_name: null,
          avatar_url: null,
          contact_email: null,
          contact_phone: null,
        };
      setProfile(row);
      setDisplayName(row.display_name ?? '');
      setAvatarUrl(row.avatar_url ?? '');
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const handleSave = async () => {
    if (!hasSupabaseConfig) {
      setSaveError('Supabase config missing.');
      return;
    }
    setBusy(true);
    setSaveError(null);
    setSavedAt(null);

    const { error } = await supabase.from('profiles').upsert(
      {
        id: userId,
        display_name: displayName.trim() || null,
        avatar_url: avatarUrl.trim() || null,
      },
      { onConflict: 'id' },
    );

    setBusy(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    setSavedAt(Date.now());
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            display_name: displayName.trim() || null,
            avatar_url: avatarUrl.trim() || null,
          }
        : prev,
    );
  };

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(userId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  return (
    <section className="profile-panel">
      <div className="panel-header">
        <h2>Profile</h2>
        <p className="muted">Set how friends see you in iFoundYou.</p>
      </div>

      <div className="panel-grid">
        <div className="card profile-card-grid">
          <h3>Display name</h3>
          <p className="muted">
            This name appears in chats, the friends list, and Discover.
          </p>
          <label className="field">
            Name
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              maxLength={64}
              disabled={busy}
            />
          </label>
          <label className="field">
            Avatar URL <span className="muted">(optional)</span>
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://..."
              disabled={busy}
            />
          </label>
          <div className="profile-actions">
            <button
              className="primary"
              onClick={() => void handleSave()}
              disabled={busy}
            >
              {busy ? 'Saving…' : 'Save profile'}
            </button>
            {savedAt && <span className="muted profile-save-hint">Saved.</span>}
          </div>
          {loadError && <p className="error">{loadError}</p>}
          {saveError && <p className="error">{saveError}</p>}
        </div>

        <div className="card profile-card-grid">
          <h3>Account</h3>
          <div className="profile-account-row">
            <span className="muted">Email</span>
            <strong>{email ?? '—'}</strong>
          </div>
          <div className="profile-account-row">
            <span className="muted">User ID</span>
            <code className="profile-userid">{userId}</code>
            <button type="button" className="ghost small" onClick={handleCopyId}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="profile-account-row">
            <span className="muted">Contact email</span>
            <strong>
              {profile?.contact_email ? 'Shared' : 'Hidden'}
            </strong>
            <span className="muted profile-account-hint">
              Manage in Share tab
            </span>
          </div>
          <div className="profile-account-row">
            <span className="muted">Contact phone</span>
            <strong>{profile?.contact_phone ? 'Shared' : 'Hidden'}</strong>
            <span className="muted profile-account-hint">
              Manage in Share tab
            </span>
          </div>

          <div className="profile-actions">
            <button className="ghost" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
