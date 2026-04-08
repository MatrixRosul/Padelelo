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
        <MaterialIcons color={Colors.primaryContainer} name="sports-tennis" size={24} />
        <Text style={styles.brand}>Padelelo</Text>
      </View>
      <View style={styles.actions}>
        <Pressable style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <MaterialIcons color={Colors.primaryContainer} name="notifications" size={22} />
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
    color: Colors.primaryContainer,
    fontSize: 16,
    fontStyle: 'italic',
    fontWeight: '900',
    letterSpacing: -0.4,
    textTransform: 'capitalize',
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  container: {
    alignItems: 'center',
    backgroundColor: Colors.tabBarGlass,
    borderBottomColor: 'rgba(195, 198, 210, 0.28)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 10,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: Colors.surfaceLow,
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  pressed: {
    opacity: 0.75,
  },
});
