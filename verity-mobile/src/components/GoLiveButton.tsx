import React from 'react';
import ThemedButton from './ThemedButton';

type GoLiveButtonProps = {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

export default function GoLiveButton({
  onPress,
  disabled = false,
  loading = false,
}: GoLiveButtonProps) {
  return (
    <ThemedButton
      label={loading ? 'Joining...' : 'Go Live Now'}
      onPress={onPress}
      disabled={disabled || loading}
    />
  );
}
