import React from 'react';
import { ScreenLayout } from '../components/ScreenLayout';
import { InfoCard } from '../components/InfoCard';

export const MessagesScreen = () => {
  return (
    <ScreenLayout
      title="Messages"
      subtitle="Offline queue and delivery state."
    >
      <InfoCard
        title="Offline queue"
        description="Messages are stored locally and forwarded when peers are discovered."
      />
      <InfoCard
        title="Voice clips"
        description="Push-to-talk clips are the default for voice in mesh mode."
      />
      <InfoCard
        title="Sync"
        description="When internet returns, messages can sync to Supabase."
      />
    </ScreenLayout>
  );
};
