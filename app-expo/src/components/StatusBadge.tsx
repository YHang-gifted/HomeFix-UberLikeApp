import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ServiceRequestStatus } from '../../../shared/schemas';
import { colors, radii } from '../theme';

export interface StatusBadgeProps {
  status: ServiceRequestStatus;
}

const toneByStatus: Record<ServiceRequestStatus, { backgroundColor: string; color: string }> = {
  pending: { backgroundColor: colors.goldSoft, color: colors.gold },
  matched: { backgroundColor: colors.infoSoft, color: colors.info },
  accepted: { backgroundColor: colors.brandSoft, color: colors.brand },
  in_progress: { backgroundColor: colors.brandSoft, color: colors.brand },
  completed: { backgroundColor: colors.surfaceMuted, color: colors.ink },
  cancelled: { backgroundColor: colors.dangerSoft, color: colors.danger },
};

export function StatusBadge({ status }: StatusBadgeProps): ReactElement {
  const tone = toneByStatus[status];
  return (
    <View style={[styles.badge, { backgroundColor: tone.backgroundColor }]}>
      <Text style={[styles.text, { color: tone.color }]}>{status.replace('_', ' ')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radii.small,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
