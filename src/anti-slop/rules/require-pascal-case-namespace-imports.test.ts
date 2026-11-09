import { RuleTester } from 'oxlint/plugins-dev';
import { requirePascalCaseNamespaceImportsRule } from './require-pascal-case-namespace-imports.ts';

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });
const error = (name: string) => ({ messageId: 'notPascalCase', data: { name } });

tester.run(
  'anti-slop/require-pascal-case-namespace-imports',
  requirePascalCaseNamespaceImportsRule,
  {
    valid: [
      "import * as Effect from 'effect';",
      "import type * as Schema from 'effect/Schema';",
      "import * as NodePath from 'node:path';",
      "import * as OrderQueries from './order.queries';",
      "import * as AWS from 'aws-sdk';",
      "import * as V2 from './v2';",
      // Not namespace imports.
      "import path from 'node:path';",
      "import { join } from 'node:path';",
      "import { join as joinPath } from 'node:path';",
      "export * as helpers from './helpers';",
      "const crypto = await import('node:crypto');",
      "import Path = require('node:path');",
      "export import Path = require('node:path');",
      // An alias of a namespace's member, not a module.
      'namespace Outer { export const value = 1; } import alias = Outer.value;',
    ],
    invalid: [
      { code: "import * as path from 'node:path';", errors: [error('path')] },
      { code: "import type * as ts from 'typescript';", errors: [error('ts')] },
      { code: "import * as orderQueries from './q';", errors: [error('orderQueries')] },
      { code: "import * as Node_Path from 'node:path';", errors: [error('Node_Path')] },
      { code: "import * as $ from './dollar';", errors: [error('$')] },
      { code: "import * as _Private from './private';", errors: [error('_Private')] },
      {
        code: "import Default, * as rest from './module';",
        errors: [error('rest')],
      },
      { code: "import path = require('node:path');", errors: [error('path')] },
      { code: "export import path = require('node:path');", errors: [error('path')] },
    ],
  }
);
