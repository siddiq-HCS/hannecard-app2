import NetInfo from '@react-native-community/netinfo';
import { api } from '@/api/client';
import { getPendingSync, markSynced, attachServerId, pendingCount } from '@/db/store';

let deviceId = '';

function getDeviceId(): string {
  if (!deviceId) {
    deviceId = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
  return deviceId;
}

let isSyncing = false;

/**
 * مزامنة العناصر المعلقة مع الخادم عند عودة الاتصال.
 * استراتيجية التعارض: الخادم يفوز بآخر زمن (Server Timestamp wins).
 */
export async function syncPending(token: string): Promise<{ synced: number; failed: number }> {
  if (isSyncing) return { synced: 0, failed: 0 };

  const items = await getPendingSync();
  if (items.length === 0) return { synced: 0, failed: 0 };

  isSyncing = true;
  try {
    const res = await api.post(
      '/sync/bulk',
      {
        deviceId: getDeviceId(),
        items: items.map((it) => ({
          id: it.id,
          entityType: it.entityType,
          payload: it.payload,
          createdAt: new Date().toISOString(),
        })),
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );

    const body = res.data as { results: { localId: string; ok: boolean; serverId?: string }[] };
    const results = body.results;
    const byLocal: Record<string, { ok: boolean; serverId?: string }> = {};
    for (const r of results) {
      // localId هنا هو معرف عنصر الطابور
      byLocal[r.localId] = r;
    }

    let synced = 0;
    for (const item of items) {
      const r = byLocal[item.id];
      if (r?.ok) {
        const serverId = r.serverId;
        // تحديث server_id للكيان الأصلي الموجود داخل payload
        const entityLocalId = item.payload.id as string;
        if (serverId && entityLocalId) await attachServerId(entityLocalId, serverId);
        await markSynced(item.id);
        synced += 1;
      }
    }
    const failed = items.length - synced;
    return { synced, failed };
  } catch {
    return { synced: 0, failed: items.length };
  } finally {
    isSyncing = false;
  }
}

/** الاستماع لتغير حالة الاتصال ومزامنة تلقائية عند عودة الإنترنت */
export function watchConnectivity(token: string, onChange?: (online: boolean) => void) {
  return NetInfo.addEventListener(async (state) => {
    const online = Boolean(state.isConnected && state.isInternetReachable !== false);
    if (online) {
      await syncPending(token);
    }
    onChange?.(online);
  });
}

export { pendingCount };
