import { StyleSheet, View } from 'react-native'
import { Tabs } from 'expo-router'
import { LayoutDashboard, BarChart2, Fish, Settings } from 'lucide-react-native'

const ACTIVE = '#0A7B8E'
const INACTIVE = '#AAB8C7'
const CARD = '#FFFFFF'

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACTIVE,
        tabBarInactiveTintColor: INACTIVE,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.3,
        },
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 12,
          backgroundColor: CARD,
          borderTopWidth: 0,
          borderRadius: 24,
          elevation: 8,
          shadowColor: '#000',
          shadowOpacity: 0.11,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 6 },
          height: 72,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarBackground: () => (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: CARD, borderRadius: 24 }]} />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Monitor',
          tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="graphs"
        options={{
          title: 'Graphs',
          tabBarIcon: ({ color, size }) => <BarChart2 color={color} size={size} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="feeder"
        options={{
          title: 'Feeder',
          tabBarIcon: ({ color, size }) => <Fish color={color} size={size} strokeWidth={1.8} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} strokeWidth={1.8} />,
        }}
      />
    </Tabs>
  )
}
