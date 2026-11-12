# anti-slop-react provenance

The rules come from [T3 Code](https://github.com/pingdotgg/t3code)'s `oxlint-plugin-t3code` at
`2de3370` (2026-11-12), MIT. `LICENSE` is T3 Code's. They were rewritten in this repo's style rather
than copied, so they aren't kept in step with T3's versions.

- `no-manual-memo`: without T3's `allowMemoHooks` option, and without its message's pointer to T3's
  own `useStableCallback`.
- `no-hookless-use-function`: tracks hook calls through oxlint's traversal instead of walking each
  function's body.
- `require-sync-comment-for-effect`: adapted from `no-unreasoned-state-sync`. T3 asks for a disable
  comment with a reason; this asks for a `SYNC:` comment, as anti-slop's
  `require-safety-comment-for-type-assertion` asks for `SAFETY:`, so it needs no rule that checks
  disable comments. It also checks test files, which T3 skips.
