import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { io } from 'socket.io-client';
import { useI18n, formatDateTime } from '../i18n';
import { SOCKET_URL } from '../api/client';
import { storageGet } from '../lib/safeStorage';

interface RepLocation {
  userId: string;
  name: string;
  lat: number | null;
  lng: number | null;
  recordedAt: string | null;
  action: string | null;
}

export function MapView() {
  const { t, lang } = useI18n();
  const [locations, setLocations] = useState<RepLocation[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  async function load() {
    let token: string | null = null;
    try {
      token = storageGet('token');
    } catch {
      token = null;
    }
    const res = await fetch('/api/manager/locations', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = (await res.json()) as RepLocation[];
    setLocations(data);
    setLastUpdated(new Date());
  }

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 30000);
    return () => clearInterval(interval);
  }, []);

  // تحديث لحظي عند وصول موقع جديد من المندوب
  useEffect(() => {
    let token: string | null = null;
    try {
      token = storageGet('token');
    } catch {
      token = null;
    }
    if (!token) return;
    const socket = io(SOCKET_URL, { auth: { token } });
    socket.on('location:update', (loc: { userId: string; lat: number; lng: number; recordedAt: string }) => {
      setLocations((prev) =>
        prev.map((l) => (l.userId === loc.userId ? { ...l, lat: loc.lat, lng: loc.lng, recordedAt: loc.recordedAt } : l)),
      );
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  const withCoords = locations.filter((l) => l.lat != null && l.lng != null);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{t('map.title')}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            {lastUpdated ? `${t('map.lastUpdate')}: ${formatDateTime(lastUpdated.toISOString(), lang)}` : t('map.loading')}
          </span>
          <button onClick={() => void load()} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}>
            {t('map.refresh')}
          </button>
        </div>
      </div>
      <div style={{ height: '70vh', borderRadius: 12, overflow: 'hidden' }}>
        <MapContainer center={[24.7136, 46.6753]} zoom={11} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {withCoords.map((l) => (
            <Marker key={l.userId} position={[l.lat as number, l.lng as number]}>
              <Popup>
                <strong>{l.name}</strong>
                <br />
                {l.recordedAt ? formatDateTime(l.recordedAt, lang) : t('map.noLocation')}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
        {t('map.visibleCount')}: {withCoords.length} {t('map.of')} {locations.length}
      </div>
    </div>
  );
}
