import base from './src/oxfmt.ts';

export default {
  ...base,
  // The vendored plugin keeps upstream's formatting, so its updates stay plain copies.
  ignorePatterns: ['dist/**', 'src/anti-slop/**', 'bun.lock'],
};
