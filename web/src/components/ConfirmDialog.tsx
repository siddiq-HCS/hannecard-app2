import { useI18n } from '../i18n';

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel, cancelLabel, danger = true, onConfirm, onCancel }: Props) {
  const { t } = useI18n();
  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  };
  const box: React.CSSProperties = {
    background: '#fff', borderRadius: 12, padding: 24, maxWidth: 420, width: '90%', boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
  };
  return (
    <div style={overlay} onClick={onCancel}>
      <div style={box} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>{title}</h3>
        <p style={{ margin: '0 0 20px', color: '#555', fontSize: 14, lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button style={btn('#6b7280')} onClick={onCancel}>{cancelLabel ?? t('common.cancel')}</button>
          <button style={btn(danger ? '#dc2626' : '#2563eb')} onClick={onConfirm}>{confirmLabel ?? t('common.delete')}</button>
        </div>
      </div>
    </div>
  );
}

function btn(bg: string): React.CSSProperties {
  return { padding: '9px 18px', borderRadius: 8, border: 'none', background: bg, color: '#fff', cursor: 'pointer', fontWeight: 600 };
}
