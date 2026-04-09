import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors } from '../theme/colors';

type AppTopBarProps = {
  rightBadge?: string;
};

export function AppTopBar({ rightBadge }: AppTopBarProps) {
  return (
    <View style={styles.container}>
      <View style={styles.brandRow}>
        <MaterialIcons color={Colors.primary} name="sports-tennis" size={24} />
        <Text style={styles.brand}>Padelelo</Text>
      </View>
      <View style={styles.actions}>
        <Pressable style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <MaterialIcons color={Colors.primary} name="notifications" size={22} />
        </Pressable>
        {rightBadge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{rightBadge}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  badge: {
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 999,
    height: 22,
    justifyContent: 'center',
    minWidth: 24,
    paddingHorizontal: 8,
  },
  badgeText: {
    color: Colors.onPrimary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  brand: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.2,
    textTransform: 'capitalize',
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  container: {
    alignItems: 'center',
    backgroundColor: Colors.glassSurface,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 10,
    paddingHorizontal: 20,
    paddingTop: 8,
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.06,
    shadowRadius: 40,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceLowest,
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    width: 34,
  },
  pressed: {
    opacity: 0.75,
  },
});
