import { defineRule } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';
import {
  functionParameterBindingName,
  functionParameterTypeAnnotation,
} from '../../shared/function-parameters.ts';
import { baselineOption, fileBaseline, staleBaselineMessage } from '../baseline.ts';

/** Services callers may hand along, such as request-scoped context, from the `exempt` option. */
function exemptServices(option: unknown): ReadonlySet<string> {
  if (typeof option !== 'object' || option === null || !('exempt' in option)) return new Set();
  const exempt = option.exempt;
  if (!Array.isArray(exempt)) return new Set();
  return new Set(exempt.filter((service): service is string => typeof service === 'string'));
}

/** Local type aliases, and the shapes local service classes name. */
type TypeDeclarations = ReadonlyMap<string, ESTree.TSType | { readonly service: string }>;
type FunctionNode = ESTree.Function | ESTree.ArrowFunctionExpression;

function typeNameText(name: ESTree.TSTypeName): string {
  if (name.type === 'Identifier') return name.name;
  if (name.type === 'ThisExpression') return 'this';
  return `${typeNameText(name.left)}.${name.right.name}`;
}

function typeQueryText(type: ESTree.TSType | undefined): string | undefined {
  if (type?.type !== 'TSTypeQuery' || type.exprName.type === 'TSImportType') return undefined;
  return typeNameText(type.exprName);
}

/** `Context.Service<Self, Shape>()('id')`: the local shape declarations a service class names. */
function serviceShapeName(node: ESTree.Class): string | undefined {
  let callee = node.superClass;
  while (callee?.type === 'CallExpression') {
    const shape = callee.typeArguments?.params[1];
    if (shape?.type === 'TSTypeReference' && shape.typeName.type === 'Identifier') {
      return shape.typeName.name;
    }
    callee = callee.callee;
  }
  return undefined;
}

function collectTypeDeclarations(program: ESTree.Program): {
  declarations: TypeDeclarations;
  imported: ReadonlySet<string>;
} {
  const declarations = new Map<string, ESTree.TSType | { readonly service: string }>();
  const imported = new Set<string>();
  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration') {
      for (const specifier of statement.specifiers) imported.add(specifier.local.name);
      continue;
    }
    const declaration =
      statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (declaration?.type === 'TSTypeAliasDeclaration') {
      declarations.set(declaration.id.name, declaration.typeAnnotation);
    }
    if (declaration?.type === 'ClassDeclaration' && declaration.id) {
      const shape = serviceShapeName(declaration);
      if (shape !== undefined) declarations.set(shape, { service: declaration.id.name });
    }
  }
  return { declarations, imported };
}

/** The service whose instance (or member) `type` describes, if any. */
function serviceOfType(
  type: ESTree.TSType,
  declarations: TypeDeclarations,
  imported: ReadonlySet<string>,
  seen = new Set<string>()
): string | undefined {
  switch (type.type) {
    case 'TSParenthesizedType':
      return serviceOfType(type.typeAnnotation, declarations, imported, seen);
    case 'TSUnionType':
      for (const member of type.types) {
        const service = serviceOfType(member, declarations, imported, seen);
        if (service !== undefined) return service;
      }
      return undefined;
    case 'TSIndexedAccessType': {
      // `X['Service']` is the instance; `X['Service']['method']` is one of its members.
      const index = type.indexType;
      if (index.type === 'TSLiteralType' && index.literal.type === 'Literal') {
        if (index.literal.value === 'Service') {
          if (type.objectType.type === 'TSTypeReference')
            return typeNameText(type.objectType.typeName);
          return typeQueryText(type.objectType);
        }
      }
      return serviceOfType(type.objectType, declarations, imported, seen);
    }
    case 'TSTypeReference': {
      const name = typeNameText(type.typeName);
      const [argument] = type.typeArguments?.params ?? [];
      if (name.endsWith('Service.Shape')) return typeQueryText(argument);
      if (name === 'Effect.Success') {
        // `Effect.Success<typeof Tag>` or `Effect.Success<typeof Tag.make>`
        const query = typeQueryText(argument)?.replace(/\.make$/u, '');
        return query !== undefined && /^[A-Z]\w*$/u.test(query) ? query : undefined;
      }
      if (type.typeName.type !== 'Identifier' || seen.has(name)) return undefined;
      const declaration = declarations.get(name);
      if (declaration !== undefined && 'service' in declaration) return declaration.service;
      if (declaration !== undefined) {
        return serviceOfType(declaration, declarations, imported, new Set([...seen, name]));
      }
      // Service shapes declared in another module follow the `<Service>Shape` naming.
      if (imported.has(name) && name.endsWith('Shape')) return name.slice(0, -'Shape'.length);
      return undefined;
    }
    default:
      return undefined;
  }
}

/** The binding a function is declared or assigned to, for baseline entries. */
function functionName(node: FunctionNode): string {
  if (node.type !== 'ArrowFunctionExpression' && node.id) return node.id.name;
  let current: ESTree.Node = node.parent;
  while (current.type === 'CallExpression' || current.type === 'TSAsExpression') {
    current = current.parent;
  }
  if (current.type === 'VariableDeclarator' && current.id.type === 'Identifier') {
    return current.id.name;
  }
  if (
    (current.type === 'MethodDefinition' || current.type === 'Property') &&
    current.key.type === 'Identifier'
  ) {
    return current.key.name;
  }
  return '<anonymous>';
}

/** Keep service instances out of function signatures; methods use dependencies captured at construction. */
export const noServiceParametersRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow function parameters typed as an Effect service instance.',
    },
    messages: {
      serviceParameter:
        'Parameter "{{parameter}}" takes the {{service}} service from the caller. Do not pass service instances as function arguments: acquire services from context during Context.Service, layer, or RPC handler layer construction, and use the captured dependency.',
      staleBaseline: staleBaselineMessage,
    },
    schema: [
      {
        type: 'object',
        properties: {
          baseline: baselineOption,
          exempt: {
            description:
              'Services callers may pass along, such as request-scoped context, by class name.',
            type: 'array',
            items: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const { declarations, imported } = collectTypeDeclarations(context.sourceCode.ast);
    const baseline = fileBaseline(context);
    const exempt = exemptServices(context.options[0]);

    const checkParameters = (node: FunctionNode): void => {
      for (const parameter of node.params) {
        const annotation = functionParameterTypeAnnotation(parameter);
        if (annotation == null) continue;
        const service = serviceOfType(annotation.typeAnnotation, declarations, imported);
        if (service === undefined || exempt.has(service)) continue;
        const name = functionParameterBindingName(parameter, context.sourceCode);
        if (baseline.allows(`${functionName(node)}.${name}`)) continue;
        context.report({
          node: parameter,
          messageId: 'serviceParameter',
          data: { parameter: name, service },
        });
      }
    };

    return {
      FunctionDeclaration: checkParameters,
      FunctionExpression: checkParameters,
      ArrowFunctionExpression: checkParameters,
      'Program:exit': baseline.reportStale,
    };
  },
});
