import React from 'react';
import { ScreenLayout } from '../components/ScreenLayout';
import { InfoCard } from '../components/InfoCard';
import { isSupabaseConfigured } from '../config';

export const SettingsScreen = () => {
  return (
    <ScreenLayout
      title="Settings"
      subtitle="Connectivity and safety controls."
    >
      <InfoCard
        title="Supabase"
        description={
          isSupabaseConfigured
            ? 'Configured for sync.'
            : 'Not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.'
        }
        tone={isSupabaseConfigured ? 'accent' : 'danger'}
      />
      <InfoCard
        title="Battery"
        description="Emergency Mode will prioritize mesh reliability over battery life."
      />
      <InfoCard
        title="Privacy"
        description="Use QR pairing and signed headers to avoid spoofing."
      />
    </ScreenLayout>
  );
};
