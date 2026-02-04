import React from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { spacing } from '../theme/tokens';

type PhotoCarouselProps = {
  photos: string[];
};

export default function PhotoCarousel({ photos }: PhotoCarouselProps) {
  if (!photos?.length) {
    return <View style={styles.placeholder} />;
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.container}>
      {photos.map((uri, index) => (
        <Image key={`${uri}-${index}`} source={{ uri }} style={styles.image} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  image: {
    width: 180,
    height: 220,
    borderRadius: 16,
    marginRight: spacing.sm,
  },
  placeholder: {
    height: 180,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginBottom: spacing.md,
  },
});
