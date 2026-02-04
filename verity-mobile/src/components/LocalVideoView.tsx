import React from 'react';
import { StyleSheet, View } from 'react-native';
import { RtcSurfaceView } from 'react-native-agora';

export default function LocalVideoView() {
  return (
    <View style={styles.container}>
      <RtcSurfaceView
        canvas={{
          uid: 0,
        }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
