import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';

type ScreenLayoutProps = {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
};

export const ScreenLayout = ({
  title,
  subtitle,
  children,
}: ScreenLayoutProps) => {
  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <View style={styles.body}>{children}</View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.muted,
    marginTop: spacing.xs,
  },
  body: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
});
