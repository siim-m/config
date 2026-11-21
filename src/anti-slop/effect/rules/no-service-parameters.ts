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

type LocalType = ESTree.TSInterfaceDeclaration | ESTree.TSTypeAliasDeclaration;

/** What the file declares and imports, for telling a service's shape from other types. */
interface TypeDeclarations {
  /** Local interfaces and type aliases by name. */
  readonly types: ReadonlyMap<string, LocalType>;
  /** The shapes local service classes name, mapped to their class, when the shape holds operations. */
  readonly shapes: ReadonlyMap<string, string>;
  readonly imported: ReadonlySet<string>;
}
type FunctionNode = ESTree.Function | ESTree.ArrowFunctionExpression;

/** Wrappers whose result is still part of the type they take, such as `Pick<MailerShape, 'send'>`. */
const PART_OF: ReadonlySet<string> = new Set(['Pick', 'Omit', 'Partial', 'Required', 'Readonly']);
/** Member types that make a shape a set of operations rather than data. */
const OPERATION_TYPES: ReadonlySet<string> = new Set([
  'Effect',
  'Effect.Effect',
  'Stream',
  'Stream.Stream',
]);

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

const isOperationType = (type: ESTree.TSType): boolean =>
  type.type === 'TSFunctionType' ||
  (type.type === 'TSParenthesizedType' && isOperationType(type.typeAnnotation)) ||
  (type.type === 'TSUnionType' && type.types.some(isOperationType)) ||
  (type.type === 'TSTypeReference' && OPERATION_TYPES.has(typeNameText(type.typeName)));

const isOperation = (member: ESTree.TSSignature): boolean =>
  member.type === 'TSMethodSignature' ||
  member.type === 'TSCallSignatureDeclaration' ||
  (member.type === 'TSPropertySignature' &&
    member.typeAnnotation !== null &&
    isOperationType(member.typeAnnotation.typeAnnotation));

/**
 * Whether a local type declares an operation: a method, or a member typed as a function, an Effect
 * or a Stream. A shape with none, such as the signed-in user, is data its callers may pass along.
 */
function hasOperations(
  type: ESTree.TSType | LocalType,
  types: ReadonlyMap<string, LocalType>,
  seen: ReadonlySet<string>
): boolean {
  const local = (name: string): boolean => {
    const declaration = types.get(name);
    return (
      declaration !== undefined &&
      !seen.has(name) &&
      hasOperations(declaration, types, new Set([...seen, name]))
    );
  };
  switch (type.type) {
    case 'TSInterfaceDeclaration':
      return (
        type.body.body.some(isOperation) ||
        type.extends.some(
          ({ expression }) => expression.type === 'Identifier' && local(expression.name)
        )
      );
    case 'TSTypeAliasDeclaration':
      return hasOperations(type.typeAnnotation, types, seen);
    case 'TSTypeLiteral':
      return type.members.some(isOperation);
    case 'TSParenthesizedType':
      return hasOperations(type.typeAnnotation, types, seen);
    case 'TSUnionType':
    case 'TSIntersectionType':
      return type.types.some((member) => hasOperations(member, types, seen));
    case 'TSTypeReference':
      return type.typeName.type === 'Identifier' && local(type.typeName.name);
    default:
      return false;
  }
}

function collectTypeDeclarations(program: ESTree.Program): TypeDeclarations {
  const types = new Map<string, LocalType>();
  const imported = new Set<string>();
  const classes: ESTree.Class[] = [];
  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration') {
      for (const specifier of statement.specifiers) imported.add(specifier.local.name);
      continue;
    }
    const declaration =
      statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (
      declaration?.type === 'TSTypeAliasDeclaration' ||
      declaration?.type === 'TSInterfaceDeclaration'
    ) {
      types.set(declaration.id.name, declaration);
    }
    if (declaration?.type === 'ClassDeclaration') classes.push(declaration);
  }
  // A shape declared here counts when it holds operations; an imported one when it follows the
  // `<Service>Shape` naming, since its declaration is out of sight.
  const shapes = new Map<string, string>();
  for (const declaration of classes) {
    const shape = serviceShapeName(declaration);
    if (shape === undefined || declaration.id === null) continue;
    const local = types.get(shape);
    const holdsOperations =
      local !== undefined
        ? hasOperations(local, types, new Set([shape]))
        : imported.has(shape) && shape.endsWith('Shape');
    if (holdsOperations) shapes.set(shape, declaration.id.name);
  }
  return { types, shapes, imported };
}

/** The service whose instance (or member) `type` describes, if any. */
function serviceOfType(
  type: ESTree.TSType,
  declarations: TypeDeclarations,
  seen = new Set<string>()
): string | undefined {
  switch (type.type) {
    case 'TSParenthesizedType':
      return serviceOfType(type.typeAnnotation, declarations, seen);
    case 'TSUnionType':
    case 'TSIntersectionType':
      for (const member of type.types) {
        const service = serviceOfType(member, declarations, seen);
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
      return serviceOfType(type.objectType, declarations, seen);
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
      if (PART_OF.has(name) && argument !== undefined) {
        return serviceOfType(argument, declarations, seen);
      }
      if (type.typeName.type !== 'Identifier' || seen.has(name)) return undefined;
      const service = declarations.shapes.get(name);
      if (service !== undefined) return service;
      const local = declarations.types.get(name);
      if (local?.type === 'TSTypeAliasDeclaration') {
        return serviceOfType(local.typeAnnotation, declarations, new Set([...seen, name]));
      }
      // Service shapes declared in another module follow the `<Service>Shape` naming.
      if (declarations.imported.has(name) && name.endsWith('Shape')) {
        return name.slice(0, -'Shape'.length);
      }
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
    const declarations = collectTypeDeclarations(context.sourceCode.ast);
    const baseline = fileBaseline(context);
    const exempt = exemptServices(context.options[0]);

    const checkParameters = (node: FunctionNode): void => {
      for (const parameter of node.params) {
        const annotation = functionParameterTypeAnnotation(parameter);
        if (annotation == null) continue;
        const service = serviceOfType(annotation.typeAnnotation, declarations);
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
