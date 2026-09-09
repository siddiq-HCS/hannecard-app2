import { useEffect, useState } from 'react';
import { api } from '../api/client';

interface Attachment {
  id: string;
  filePath: string;
}

// يعرض صور المهمة كمعاينات قابلة للتكبير عند الضغط، عبر جلب الصورة بترويسة المصادقة
export function TaskImages({ attachments, token }: { attachments: Attachment[]; token: string | null }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const objectUrls: string[] = [];
    setUrls({});
    for (const a of attachments) {
      if (!token) continue;
      api
        .get(`/task-attachments/${a.id}/file`, { headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' })
        .then((res) => {
          if (!active) return;
          const url = URL.createObjectURL(res.data as Blob);
          objectUrls.push(url);
          setUrls((prev) => ({ ...prev, [a.id]: url }));
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
      for (const u of objectUrls) URL.revokeObjectURL(u);
    };
  }, [attachments, token]);

  if (!attachments.length) return null;

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {attachments.map((a) =>
          urls[a.id] ? (
            <img
              key={a.id}
              src={urls[a.id]}
              alt="attachment"
              onClick={() => setZoom(urls[a.id])}
              style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in', border: '1px solid #e5e7eb' }}
            />
          ) : (
            <div key={a.id} style={{ width: 64, height: 64, borderRadius: 8, background: '#f3f4f6' }} />
          ),
        )}
      </div>

      {zoom && (
        <div
          onClick={() => setZoom(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
        >
          <img src={zoom} alt="zoom" style={{ maxWidth: '92vw', maxHeight: '92vh', objectFit: 'contain', borderRadius: 8 }} />
        </div>
      )}
    </>
  );
}
