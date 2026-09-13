import { useEffect, useState } from 'react';

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l([...items]);
}

function push(kind: ToastKind, text: string, ms: number) {
  const id = nextId++;
  items = [...items, { id, kind, text }];
  emit();
  if (ms > 0) {
    setTimeout(() => {
      items = items.filter((t) => t.id !== id);
      emit();
    }, ms);
  }
}

// الكائن الجاهز: toast.success / toast.error / toast.info — يُستخدم من أي صفحة بدون سياق
export const toast = {
  success: (text: string, ms = 4000) => push('success', text, ms),
  error: (text: string, ms = 6000) => push('error', text, ms),
  info: (text: string, ms = 4000) => push('info', text, ms),
};

// مكوّن رفيع داخل التطبيق يعرض الإشعارات أعلى الشاشة
export function Toaster() {
  const [list, setList] = useState<ToastItem[]>(items);

  useEffect(() => {
    const l: Listener = (next) => setList(next);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  if (list.length === 0) return null;

  const color = (k: ToastKind) =>
    k === 'success' ? 'rgba(34, 197, 94, 0.16)' : k === 'error' ? 'rgba(239, 68, 68, 0.16)' : 'rgba(59, 130, 246, 0.16)';
  const border = (k: ToastKind) =>
    k === 'success' ? 'rgba(34, 197, 94, 0.4)' : k === 'error' ? 'rgba(239, 68, 68, 0.45)' : 'rgba(59, 130, 246, 0.4)';
  const text = (k: ToastKind) => (k === 'success' ? '#4ade80' : k === 'error' ? '#f87171' : '#60a5fa');

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        maxWidth: '92vw',
        pointerEvents: 'none',
      }}
    >
      {list.map((t) => (
        <div
          key={t.id}
          style={{
            background: color(t.kind),
            border: `1px solid ${border(t.kind)}`,
            color: text(t.kind),
            borderRadius: 10,
            padding: '10px 16px',
            fontSize: 14,
            fontWeight: 500,
            boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
            backdropFilter: 'blur(6px)',
            maxWidth: '100%',
            textAlign: 'center',
          }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}