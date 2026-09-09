import { Component, type ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message?: string;
}

/**
 * حاجز أخطاء شامل (ErrorBoundary) يمنع ظهور الشاشة البيضاء عند أي خطأ غير متوقع
 * في أي مكان داخل التطبيق، ويُظهر واجهة عربية واضحة مع زر إعادة تحميل.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown) {
    // تسجيل الخطأ في وحدة التحكم للمساعدة في التشخيص دون تعطيل المستخدم
    if (Platform.OS === 'web') {
      try {
        // eslint-disable-next-line no-console
        console.error('[AppErrorBoundary] caught error:', error);
      } catch {
        /* ignore */
      }
    }
  }

  private reload = () => {
    if (Platform.OS === 'web') {
      globalThis.location?.reload();
      return;
    }
    // على الجوال: إغلاق الحاجز (قد يستمر عطل آخر لكن نعطي فرصة للاستمرارية)
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={s.container}>
          <Text style={s.emoji}>⚠️</Text>
          <Text style={s.title}>حدث خطأ غير متوقع</Text>
          <Text style={s.subtitle}>تعذّر عرض هذه الشاشة. أعد تحميل الصفحة للمتابعة.</Text>
          {!!this.state.message && <Text style={s.detail} numberOfLines={3}>{this.state.message}</Text>}
          <Pressable style={s.button} onPress={this.reload} accessibilityRole="button">
            <Text style={s.buttonText}>{Platform.OS === 'web' ? 'إعادة تحميل الصفحة' : 'إعادة المحاولة'}</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emoji: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '800', color: '#f8fafc', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#94a3b8', textAlign: 'center', marginBottom: 16 },
  detail: { fontSize: 12, color: '#64748b', textAlign: 'center', marginBottom: 24, maxWidth: 360 },
  button: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonText: { color: '#0f172a', fontWeight: '700', fontSize: 16 },
});
