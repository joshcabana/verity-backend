import React, { useMemo, useState } from 'react';
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';

type ImagePickerComponentProps = {
  images: string[];
  onChange: (images: string[]) => void;
  max?: number;
};

export default function ImagePickerComponent({
  images,
  onChange,
  max = 4,
}: ImagePickerComponentProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [picking, setPicking] = useState(false);

  const handleAdd = async () => {
    if (images.length >= max) {
      Alert.alert('Limit reached', `You can add up to ${max} photos.`);
      return;
    }

    setPicking(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission required', 'Please allow photo access to continue.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled) {
        const newUris = result.assets?.map((asset) => asset.uri) ?? [];
        const next = [...images, ...newUris].slice(0, max);
        onChange(next);
      }
    } catch {
      Alert.alert('Image error', 'Unable to select a photo right now.');
    } finally {
      setPicking(false);
    }
  };

  const handleRemove = (uri: string) => {
    onChange(images.filter((item) => item !== uri));
  };

  return (
    <View>
      <View style={styles.grid}>
        {images.map((uri) => (
          <View key={uri} style={styles.imageWrapper}>
            <Image source={{ uri }} style={styles.image} />
            <TouchableOpacity style={styles.remove} onPress={() => handleRemove(uri)}>
              <Text style={styles.removeText}>×</Text>
            </TouchableOpacity>
          </View>
        ))}

        {images.length < max && (
          <TouchableOpacity style={styles.addTile} onPress={handleAdd} disabled={picking}>
            <Text style={styles.addText}>{picking ? '...' : '+'}</Text>
            <Text style={styles.addLabel}>Add photo</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: {
  border: string;
  card: string;
  text: string;
  muted: string;
  danger: string;
}) =>
  StyleSheet.create({
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    imageWrapper: {
      width: '48%',
      aspectRatio: 1,
      marginBottom: spacing.sm,
      marginRight: spacing.sm,
      borderRadius: 12,
      overflow: 'hidden',
    },
    image: {
      width: '100%',
      height: '100%',
    },
    remove: {
      position: 'absolute',
      top: spacing.xs,
      right: spacing.xs,
      backgroundColor: colors.danger,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    removeText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 14,
      lineHeight: 16,
    },
    addTile: {
      width: '48%',
      aspectRatio: 1,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addText: {
      fontSize: typography.xl,
      color: colors.text,
      fontWeight: '600',
    },
    addLabel: {
      fontSize: typography.xs,
      color: colors.muted,
      marginTop: spacing.xs,
    },
  });
