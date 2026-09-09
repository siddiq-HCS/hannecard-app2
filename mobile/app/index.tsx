import { Redirect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

// نقطة دخول للويب: عند فتح /app نوجّه حسب حالة الدخول حتى لا تظهر شاشة Unmatched Route
export default function IndexScreen() {
  const { token } = useAuth();
  return <Redirect href={token ? '/(tabs)' : '/login'} />;
}