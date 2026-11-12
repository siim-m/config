export const greet = (name: string): string => 'Hello, ' + name;

// The React preset checks number conditions in .tsx files only.
export const countLabel = (count: number): string => (count ? `${count} items` : 'No items');
