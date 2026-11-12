import { useEffect, useMemo } from 'react';

function useLabel(): string {
  return 'Count';
}

export function Counter({ count, show }: { count: number; show: boolean }) {
  const label = useLabel();
  const doubled = useMemo(() => count * 2, [count]);

  if (show) {
    useLabel();
  }

  useEffect(() => {
    document.title = label;
  }, [label]);

  return (
    <div>
      {count && <p>{doubled}</p>}
      <img src="/count.png" />
    </div>
  );
}
