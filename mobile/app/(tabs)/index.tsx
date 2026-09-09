import { Redirect } from 'expo-router';

export default function Index() {
  // الصفحة الافتراضية للمندوب عند فتح التطبيق: "حسابي" (Profile)
  return <Redirect href="/profile" />;
}
