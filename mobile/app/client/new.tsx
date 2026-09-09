import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/api/client';
import { getCurrentPosition } from '@/services/location';
import { saveEntity } from '@/db/store';
import { colors } from '@/theme';

export default function NewClientScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  async function onSave() {
    if (!companyName || !contactPerson || !phone) {
      return Alert.alert('خطأ', 'أدخل اسم الشركة والشخص المسؤول والهاتف');
    }
    setSaving(true);
    try {
      const coords = await getCurrentPosition();
      const payload = {
        companyName,
        contactPerson,
        phone,
        taxNumber,
        address,
        latitude: coords?.lat,
        longitude: coords?.lng,
      };

      if (token) {
        try {
          const res = await api.post('/clients', payload, { headers: { Authorization: `Bearer ${token}` } });
          await saveEntity('CLIENT', res.data, res.data.id);
          Alert.alert('تم', 'تمت إضافة العميل');
          router.back();
          return;
        } catch {
          // حفظ محلي عند فشل الاتصال
        }
      }
      await saveEntity('CLIENT', payload);
      Alert.alert('حفظ محلي', 'تم الحفظ محلياً وسيتم مزامنته عند توفر الاتصال');
      router.back();
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>اسم الشركة *</Text>
      <TextInput style={styles.input} value={companyName} onChangeText={setCompanyName} />
      <Text style={styles.label}>الشخص المسؤول *</Text>
      <TextInput style={styles.input} value={contactPerson} onChangeText={setContactPerson} />
      <Text style={styles.label}>الهاتف *</Text>
      <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Text style={styles.label}>الرقم الضريبي</Text>
      <TextInput style={styles.input} value={taxNumber} onChangeText={setTaxNumber} keyboardType="number-pad" />
      <Text style={styles.label}>العنوان</Text>
      <TextInput style={styles.input} value={address} onChangeText={setAddress} multiline />
      <Text style={styles.hint}>سيتم التقاط موقع GPS تلقائياً عند الحفظ.</Text>
      <Pressable style={styles.saveBtn} onPress={onSave} disabled={saving}>
        <Text style={styles.saveText}>{saving ? 'جاري الحفظ...' : 'حفظ العميل'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  content: { padding: 20, paddingTop: 24 },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6, marginTop: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, backgroundColor: '#fff' },
  hint: { fontSize: 11, color: colors.muted, marginTop: 8 },
  saveBtn: { backgroundColor: colors.brand, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 20 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
