import * as Location from 'expo-location';

export interface Coords {
  lat: number;
  lng: number;
  accuracy?: number;
}

/**
 * الحصول على الموقع الحالي لربطه بزيارات العملاء (GPS Check-in).
 */
export async function getCurrentPosition(): Promise<Coords | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? undefined,
    };
  } catch {
    return null;
  }
}
