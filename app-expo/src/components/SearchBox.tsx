import { type ReactElement } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

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
  wrap: { paddingHorizontal: 16, paddingBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0f172a',
  },
});
