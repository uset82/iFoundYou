import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';

export type TabId = 'home' | 'mesh' | 'messages' | 'settings';

const tabs: { id: TabId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'mesh', label: 'Mesh' },
  { id: 'messages', label: 'Messages' },
  { id: 'settings', label: 'Settings' },
];

type TabBarProps = {
  activeTab: TabId;
  onChange: (tab: TabId) => void;
};

export const TabBar = ({ activeTab, onChange }: TabBarProps) => {
  return (
    <View style={styles.container}>
      {tabs.map(tab => {
        const isActive = tab.id === activeTab;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onChange(tab.id)}
            style={[styles.tab, isActive && styles.tabActive]}
          >
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#222232',
    backgroundColor: colors.surface,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: 999,
  },
  tabActive: {
    backgroundColor: colors.accentDark,
  },
  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  labelActive: {
    color: '#0b0b0f',
  },
});
