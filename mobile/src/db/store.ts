import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

/**
 * متجر محلي (SQLite) لتفعيل Offline-First:
 * - كل عملية تُحفظ محلياً أولاً (clients / roller_specs / quotations / visits)
 * - تُضاف إلى طابور مزامنة pending_sync لإرسالها لاحقاً عبر /sync/bulk
 */

type SyncEntityType = 'CLIENT' | 'ROLLER_SPEC' | 'QUOTATION' | 'VISIT';

let db: SQLiteDatabase | null = null;

export async function initDb(): Promise<SQLiteDatabase> {
  if (db) return db;
  db = await openDatabaseAsync('hanycard.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      server_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS pending_sync (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

function uuid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface LocalEntity {
  id: string;
  entityType: SyncEntityType;
  payload: Record<string, unknown>;
  serverId?: string | null;
  createdAt: string;
}

async function getDb(): Promise<SQLiteDatabase> {
  return initDb();
}

/** حفظ كيان محلياً + إضافته لطابور المزامنة */
export async function saveEntity(
  entityType: SyncEntityType,
  payload: Record<string, unknown>,
  localId?: string,
): Promise<LocalEntity> {
  const d = await getDb();
  const id = localId ?? (payload.id as string) ?? uuid();
  await d.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      `INSERT INTO entities (id, entity_type, payload, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET entity_type = excluded.entity_type, payload = excluded.payload`,
      id,
      entityType,
      JSON.stringify(payload),
      new Date().toISOString(),
    );
    await txn.runAsync(
      `INSERT INTO pending_sync (id, entity_type, payload, created_at) VALUES (?, ?, ?, ?)`,
      uuid(),
      entityType,
      JSON.stringify({ id, ...payload }),
      new Date().toISOString(),
    );
  });
  return { id, entityType, payload, createdAt: new Date().toISOString() };
}

/** عناصر طابور المزامنة المعلقة */
export async function getPendingSync(): Promise<{ id: string; entityType: SyncEntityType; payload: Record<string, unknown> }[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<{ id: string; entity_type: SyncEntityType; payload: string }>(
    `SELECT id, entity_type, payload FROM pending_sync WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 200`,
  );
  return rows.map((r) => ({ id: r.id, entityType: r.entity_type, payload: JSON.parse(r.payload) as Record<string, unknown> }));
}

/** حذف عنصر من الطابور بعد مزامنة ناجحة */
export async function markSynced(pendingId: string): Promise<void> {
  const d = await getDb();
  await d.runAsync(`DELETE FROM pending_sync WHERE id = ?`, pendingId);
}

/** تحديث server_id على الكيان المحلي بعد المزامنة */
export async function attachServerId(localId: string, serverId: string): Promise<void> {
  const d = await getDb();
  await d.runAsync(`UPDATE entities SET server_id = ? WHERE id = ?`, serverId, localId);
}

/** استعلام كيانات محلية حسب النوع */
export async function getLocalEntities(entityType: SyncEntityType): Promise<LocalEntity[]> {
  const d = await getDb();
  const rows = await d.getAllAsync<{ id: string; entity_type: SyncEntityType; payload: string; server_id: string | null; created_at: string }>(
    `SELECT id, entity_type, payload, server_id, created_at FROM entities WHERE entity_type = ? ORDER BY created_at DESC`,
    entityType,
  );
  return rows.map((r) => ({
    id: r.id,
    entityType: r.entity_type,
    payload: JSON.parse(r.payload) as Record<string, unknown>,
    serverId: r.server_id,
    createdAt: r.created_at,
  }));
}

/** عدد العناصر المعلقة (لشاشة المزامنة) */
export async function pendingCount(): Promise<number> {
  const d = await getDb();
  const row = await d.getFirstAsync<{ c: number }>(`SELECT COUNT(*) as c FROM pending_sync WHERE status = 'PENDING'`);
  return row?.c ?? 0;
}
