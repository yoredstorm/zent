export function Card({
  children,
  className = '',
  interactive = false,
}: {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={`zent-card p-6 animate-fade-in ${interactive ? 'zent-card-interactive' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
