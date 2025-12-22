import React, { useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar, StyleSheet, View } from 'react-native';
import { colors } from './src/theme';
import { TabBar, TabId } from './src/components/TabBar';
import {
  HomeScreen,
  MeshScreen,
  MessagesScreen,
  SettingsScreen,
} from './src/screens';

const App = () => {
  const [activeTab, setActiveTab] = useState<TabId>('home');

  const screen = useMemo(() => {
    switch (activeTab) {
      case 'mesh':
        return <MeshScreen />;
      case 'messages':
        return <MessagesScreen />;
      case 'settings':
        return <SettingsScreen />;
      case 'home':
      default:
        return <HomeScreen />;
    }
  }, [activeTab]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>{screen}</View>
      <TabBar activeTab={activeTab} onChange={setActiveTab} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});

export default App;
