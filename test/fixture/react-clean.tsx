import { useEffect } from 'react';

export function Title({ title, isOpen }: { title: string; isOpen: boolean }) {
  // SYNC: the document title follows the open page.
  useEffect(() => {
    document.title = title;
  }, [title]);

  return isOpen && <h1>{title}</h1>;
}
