import React from 'react';
import { ScreenLayout } from '../components/ScreenLayout';
import { InfoCard } from '../components/InfoCard';

export const HomeScreen = () => {
  return (
    <ScreenLayout
      title="IfoundYou Companion"
      subtitle="Offline mesh messaging and location sharing."
    >
      <InfoCard
        title="Emergency Mode"
        description="Offline-first messaging, location, and push-to-talk clips when networks fail."
        tone="accent"
      />
      <InfoCard
        title="Two-layer system"
        description="This native app handles mesh; the web app handles online features and ChatGPT store exposure."
      />
      <InfoCard
        title="Next milestone"
        description="Wire BLE discovery and a store-and-forward message queue."
      />
    </ScreenLayout>
  );
};
