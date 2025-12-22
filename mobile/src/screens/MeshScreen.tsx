import React from 'react';
import { ScreenLayout } from '../components/ScreenLayout';
import { InfoCard } from '../components/InfoCard';

export const MeshScreen = () => {
  return (
    <ScreenLayout
      title="Mesh Status"
      subtitle="Local connectivity and relay overview."
    >
      <InfoCard
        title="Transport stack"
        description="iOS: Multipeer; Cross-platform: BLE; Android: Wi-Fi Direct."
      />
      <InfoCard
        title="Routing"
        description="Store-and-forward with TTL, deduplication, and bounded retries."
      />
      <InfoCard
        title="Range"
        description="Short range on BLE/Wi-Fi; optional Meshtastic bridge for long range."
      />
    </ScreenLayout>
  );
};
