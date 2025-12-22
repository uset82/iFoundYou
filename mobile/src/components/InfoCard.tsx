import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';

type InfoCardProps = {
  title: string;
  description: string;
  tone?: 'default' | 'accent' | 'danger';
};

const toneColors = {
  default: colors.surface,
  accent: colors.accentDark,
  danger: colors.danger,
};

export const InfoCard = ({ title, description, tone = 'default' }: InfoCardProps) => {
  return (
    <View style={[styles.card, { borderColor: toneColors[tone] }]}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
  },
  title: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 16,
  },
  description: {
    color: colors.muted,
    marginTop: spacing.xs,
  },
});
