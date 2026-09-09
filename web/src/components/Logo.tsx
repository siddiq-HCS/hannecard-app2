export function Logo({ className = '', size = 40, column = false }: { className?: string; size?: number; column?: boolean }) {
  return (
    <img
      src="/logo-app.png"
      alt="Hannecard Saudi"
      draggable={false}
      className={`object-contain ${className}`}
      style={{
        height: size,
        width: 'auto',
        maxWidth: '100%',
        display: 'block',
        margin: column ? '0 auto' : undefined,
      }}
    />
  );
}