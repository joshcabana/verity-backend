import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RtcSurfaceView } from 'react-native-agora';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/tokens';

type RemoteVideoViewProps = {
  uid: number | null;
};

export default function RemoteVideoView({ uid }: RemoteVideoViewProps) {
  const { colors } = useTheme();

  if (!uid) {
    return (
      <View style={styles.placeholder}>
        <Text style={[styles.placeholderText, { color: colors.muted }]}>
          Waiting for partner...
        </Text>
      </View>
    );
  }

  return (
    <RtcSurfaceView
      canvas={{
        uid,
      }}
      style={StyleSheet.absoluteFill}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: typography.sm,
  },
});
