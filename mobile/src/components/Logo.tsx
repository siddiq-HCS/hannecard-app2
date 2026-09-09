import { Image, StyleSheet } from 'react-native';

export function Logo({ size = 34 }: { size?: number }) {
  return <Image source={require('../../assets/logo.jpg')} style={[styles.img, { width: size, height: size }]} />;
}

const styles = StyleSheet.create({
  img: { resizeMode: 'contain' },
});
