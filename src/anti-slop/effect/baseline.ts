import type { Context, ESTree } from '@oxlint/plugins';

/** Schema of the `baseline` option: a rule's pre-existing violations, listed by name. */
export const baselineOption = {
  description: 'Pre-existing violations, as `<repo-relative path>#<name>`.',
  type: 'array',
  items: { type: 'string' },
} as const;

export const staleBaselineMessage =
  'Baseline entry "{{entry}}" no longer matches a violation. Remove it from the rule options in the oxlint config.';

/**
 * Track the baseline entries for the file being linted. `allows` consumes a match;
 * `reportStale` reports the entries no violation used, so the list only shrinks.
 */
export function fileBaseline(context: Context): {
  allows: (name: string) => boolean;
  reportStale: (program: ESTree.Program) => void;
} {
  const [option] = context.options;
  const entries =
    typeof option === 'object' && option !== null && 'baseline' in option ? option.baseline : [];
  const root = `${context.cwd.replaceAll('\\', '/')}/`;
  const absolute = context.physicalFilename.replaceAll('\\', '/');
  const file = absolute.startsWith(root) ? absolute.slice(root.length) : absolute;
  const unused = new Set(
    (Array.isArray(entries) ? entries : [])
      .filter((entry): entry is string => typeof entry === 'string')
      .filter((entry) => entry.startsWith(`${file}#`))
      .map((entry) => entry.slice(file.length + 1))
  );
  const used = new Set<string>();
  return {
    allows: (name) => {
      if (!unused.has(name) && !used.has(name)) return false;
      unused.delete(name);
      used.add(name);
      return true;
    },
    reportStale: (program) => {
      for (const name of unused) {
        context.report({
          node: program,
          messageId: 'staleBaseline',
          data: { entry: `${file}#${name}` },
        });
      }
    },
  };
}
