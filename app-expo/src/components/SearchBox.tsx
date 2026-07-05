import { type ReactElement } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { colors, radii } from '../theme';

export interface SearchBoxProps {
  value: string;
  onChange: (text: string) => void;
}

/** A controlled text input for filtering a request list by description keyword. */
export function SearchBox({ value, onChange }: SearchBoxProps): ReactElement {
  return (
    <View style={styles.wrap}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholder="Search description"
        accessibilityLabel="Search description"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    width: '100%',
    maxWidth: 1040,
    alignSelf: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.medium,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
});
