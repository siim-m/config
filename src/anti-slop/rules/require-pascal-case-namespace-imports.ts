import { defineRule } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';

const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/;

/**
 * Require a namespace import's local name to be PascalCase: a module
 * namespace reads like the modules it stands beside, as `Effect` and
 * `Schema` do, never like a value. TypeScript's
 * `import name = require('module')` imports a namespace too; an
 * `import name = Namespace.Member` alias does not.
 */
export const requirePascalCaseNamespaceImportsRule = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require PascalCase for the local name of a namespace import.',
    },
    messages: {
      notPascalCase:
        'Name the namespace import `{{name}}` in PascalCase, as `import * as Schema from …` is: a capital first letter, then letters and digits.',
    },
  },
  createOnce(context) {
    const check = (local: ESTree.BindingIdentifier) => {
      if (PASCAL_CASE.test(local.name)) return;
      context.report({ node: local, messageId: 'notPascalCase', data: { name: local.name } });
    };
    return {
      ImportNamespaceSpecifier(node) {
        check(node.local);
      },
      TSImportEqualsDeclaration(node) {
        if (node.moduleReference.type === 'TSExternalModuleReference') check(node.id);
      },
    };
  },
});
