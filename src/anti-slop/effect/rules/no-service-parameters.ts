import { defineRule } from '@oxlint/plugins';
import type { ESTree } from '@oxlint/plugins';
import {
  functionParameterBindingName,
  functionParameterTypeAnnotation,
} from '../../shared/function-parameters.ts';
import { baselineOption, fileBaseline, staleBaselineMessage } from '../baseline.ts';
import { isFunction, returnedExpressions, unwrapNode } from '../shared/effect-modules.ts';

/** Services callers may hand along, such as request-scoped context, from the `exempt` option. */
function exemptServices(option: unknown): ReadonlySet<string> {
  if (typeof option !== 'object' || option === null || !('exempt' in option)) return new Set();
  const exempt = option.exempt;
  if (!Array.isArray(exempt)) return new Set();
  return new Set(exempt.filter((service): service is string => typeof service === 'string'));
}

type LocalType = ESTree.TSInterfaceDeclaration | ESTree.TSTypeAliasDeclaration;
/** What a service's shape holds, as far as this file shows: operations, plain data, or can't tell. */
type ShapeKind = 'operations' | 'data' | 'unknown';

/** What the file declares and imports, for telling a service's shape from other types. */
interface TypeDeclarations {
  /** Local interfaces and type aliases by name. */
  readonly types: ReadonlyMap<string, LocalType>;
  /** The shapes local service classes name, mapped to their class, unless the shape is plain data. */
  readonly shapes: ReadonlyMap<string, string>;
  /** Local service classes whose shape is plain data, such as the signed-in user. */
  readonly dataServices: ReadonlySet<string>;
  readonly imported: ReadonlySet<string>;
}
type FunctionNode = ESTree.Function | ESTree.ArrowFunctionExpression;

/** Wrappers that hold what their type argument holds, when reading a shape such as `Pick<SmsShape, 'send'>`. */
const PART_OF: ReadonlySet<string> = new Set(['Pick', 'Omit', 'Partial', 'Required', 'Readonly']);
/** Member types that make a shape a set of operations rather than data: effects and state handles. */
const OPERATION_TYPES: ReadonlySet<string> = new Set([
  'Effect',
  'Effect.Effect',
  'Stream',
  'Stream.Stream',
  'Ref.Ref',
  'SynchronizedRef.SynchronizedRef',
  'SubscriptionRef.SubscriptionRef',
  'Queue.Queue',
  'Queue.Dequeue',
  'Queue.Enqueue',
  'PubSub.PubSub',
  'Deferred.Deferred',
]);
/** A schema's decoded or encoded type, such as `Schema.Schema.Type<typeof User>`, is data. */
const SCHEMA_DATA_TYPES: ReadonlySet<string> = new Set([
  'Schema.Schema.Type',
  'Schema.Schema.Encoded',
  'Schema.Type',
  'Schema.Encoded',
]);
/** `Schema.Class`, `Data.TaggedClass` and the like: classes that hold data. */
const DATA_CLASS_MODULES: ReadonlySet<string> = new Set(['Schema', 'Data']);
const DATA_CLASS_FACTORIES: ReadonlySet<string> = new Set(['Class', 'TaggedClass']);

function typeNameText(name: ESTree.TSTypeName): string {
  if (name.type === 'Identifier') return name.name;
  if (name.type === 'ThisExpression') return 'this';
  return `${typeNameText(name.left)}.${name.right.name}`;
}

function typeQueryText(type: ESTree.TSType | undefined): string | undefined {
  if (type?.type !== 'TSTypeQuery' || type.exprName.type === 'TSImportType') return undefined;
  return typeNameText(type.exprName);
}

/** `Schema.Schema.Type` for that member chain, or '' for anything else. */
const memberText = (node: ESTree.Node): string =>
  node.type === 'Identifier'
    ? node.name
    : node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier'
      ? `${memberText(node.object)}.${node.property.name}`
      : '';

const propertyName = (node: ESTree.Node): string | undefined =>
  node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier'
    ? node.property.name
    : undefined;

/**
 * The shape a service class names: `Context.Service<Self, Shape>()('id')` in Effect 4, or
 * `Context.Tag('id')<Self, Shape>()` in Effect 3.
 */
function serviceShape(node: ESTree.Class): ESTree.TSType | undefined {
  let call = node.superClass;
  while (call?.type === 'CallExpression') {
    const shape = call.typeArguments?.params[1];
    const factory = call.callee;
    const isFactory =
      propertyName(factory) === 'Service' ||
      (factory.type === 'CallExpression' && propertyName(factory.callee) === 'Tag');
    if (shape !== undefined && isFactory) return shape;
    call = factory;
  }
  return undefined;
}

/**
 * The identifier a call or member chain starts from, such as `Schema` in
 * `Schema.Struct({}) satisfies Schema.Schema<User>`.
 */
function chainRoot(node: ESTree.Node | null | undefined): string | undefined {
  let current = node === null || node === undefined ? node : unwrapNode(node);
  while (current?.type === 'CallExpression' || current?.type === 'MemberExpression') {
    current = unwrapNode(current.type === 'CallExpression' ? current.callee : current.object);
  }
  return current?.type === 'Identifier' ? current.name : undefined;
}

const EFFECT_ROOTS: ReadonlySet<string> = new Set(['Effect', 'Stream']);

/** A type annotation naming an Effect, a Stream or a state handle, or a function returning one. */
const isOperationAnnotation = (type: ESTree.TSType | undefined): boolean =>
  (type?.type === 'TSTypeReference' && OPERATION_TYPES.has(typeNameText(type.typeName))) ||
  (type?.type === 'TSParenthesizedType' && isOperationAnnotation(type.typeAnnotation)) ||
  (type?.type === 'TSFunctionType' && isOperationAnnotation(type.returnType.typeAnnotation));

/** An expression that builds an Effect or a Stream, in either arm of a conditional. */
const isEffectValue = (node: ESTree.Node | null | undefined): boolean => {
  const value = node === null || node === undefined ? node : unwrapNode(node);
  if (value?.type === 'ConditionalExpression') {
    return isEffectValue(value.consequent) || isEffectValue(value.alternate);
  }
  return EFFECT_ROOTS.has(chainRoot(value) ?? '');
};

/** Whether a function is a generator, or is typed as or returns an Effect or a Stream. */
const returnsEffect = (fn: ESTree.Node | null | undefined): boolean =>
  isFunction(fn) &&
  (fn.generator ||
    isOperationAnnotation(fn.returnType?.typeAnnotation) ||
    returnedExpressions(fn).some(isEffectValue));

/** An instance method, getter or field of a class that returns, holds or is typed as an Effect or Stream. */
function isClassOperation(member: ESTree.ClassElement): boolean {
  if (member.type === 'MethodDefinition') {
    return (
      member.kind !== 'constructor' &&
      member.kind !== 'set' &&
      !member.static &&
      returnsEffect(member.value)
    );
  }
  if (member.type !== 'PropertyDefinition' || member.static) return false;
  return (
    returnsEffect(member.value) ||
    isEffectValue(member.value) ||
    isOperationAnnotation(member.typeAnnotation?.typeAnnotation)
  );
}

/**
 * A `Schema.Class` or `Data.Class` with no operations of its own; helpers that compute over its
 * fields, such as `isAdmin()`, are still data.
 */
function isDataClass(node: ESTree.Class): boolean {
  let callee = node.superClass;
  while (callee?.type === 'CallExpression') callee = callee.callee;
  return (
    callee?.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    DATA_CLASS_MODULES.has(callee.object.name) &&
    DATA_CLASS_FACTORIES.has(propertyName(callee) ?? '') &&
    !node.body.body.some(isClassOperation)
  );
}

const combine = (kinds: readonly ShapeKind[]): ShapeKind =>
  kinds.includes('operations') ? 'operations' : kinds.includes('unknown') ? 'unknown' : 'data';

/**
 * Reads what a shape holds. An operation is a method, or a member typed as a function, an Effect,
 * a Stream or a state handle such as a Ref, through local aliases and nested objects. A shape is
 * data only when the file shows all of it; one built from a type the rule can't see into, such as
 * `Effect.Success<typeof make>`, stays a service. `importedData` decides what an import not named
 * `…Shape` is: data for a parameter typed by that name, unknown for the service's own instance.
 */
function shapeKind(
  types: ReadonlyMap<string, LocalType>,
  /** Local schemas and data classes, whose `Type` is data. */
  schemas: ReadonlySet<string>,
  imported: ReadonlySet<string>,
  importedData: boolean
): (type: ESTree.TSType) => ShapeKind {
  /** What `typeof X.Type` or `Schema.Schema.Type<typeof X>` holds, by what `X` is. */
  const schemaType = (query: string | undefined): ShapeKind => {
    // `User` for a local schema, or the import a name like `Models.User` starts from.
    const [root = '', ...rest] = (query ?? '').replace(/\.(?:Type|Encoded)$/u, '').split('.');
    if (rest.length === 0 && schemas.has(root)) return 'data';
    return importedData && imported.has(root) ? 'data' : 'unknown';
  };
  const named = (name: string, seen: ReadonlySet<string>): ShapeKind => {
    const local = types.get(name);
    if (local !== undefined)
      return seen.has(name) ? 'unknown' : kind(local, new Set([...seen, name]));
    if (schemas.has(name)) return 'data';
    if (imported.has(name)) return importedData && !name.endsWith('Shape') ? 'data' : 'unknown';
    return 'unknown';
  };
  // A member the rule can't see into, such as `readonly id: UserId`, is data.
  const member = (signature: ESTree.TSSignature, seen: ReadonlySet<string>): ShapeKind => {
    if (signature.type === 'TSMethodSignature' || signature.type === 'TSCallSignatureDeclaration')
      return 'operations';
    const isValue =
      signature.type === 'TSPropertySignature' || signature.type === 'TSIndexSignature';
    if (!isValue || signature.typeAnnotation === null) return 'data';
    return kind(signature.typeAnnotation.typeAnnotation, seen) === 'operations'
      ? 'operations'
      : 'data';
  };
  const kind = (type: ESTree.TSType | LocalType, seen: ReadonlySet<string>): ShapeKind => {
    switch (type.type) {
      case 'TSInterfaceDeclaration':
        return combine([
          ...type.body.body.map((signature) => member(signature, seen)),
          ...type.extends.map(({ expression, typeArguments }) => {
            if (expression.type === 'Identifier') return named(expression.name, seen);
            // Effect 3's `interface Person extends Schema.Schema.Type<typeof Person> {}`.
            const [argument] = typeArguments?.params ?? [];
            return SCHEMA_DATA_TYPES.has(memberText(expression))
              ? schemaType(typeQueryText(argument))
              : 'unknown';
          }),
        ]);
      case 'TSTypeAliasDeclaration':
      case 'TSParenthesizedType':
        return kind(type.typeAnnotation, seen);
      case 'TSTypeLiteral':
        return combine(type.members.map((signature) => member(signature, seen)));
      case 'TSFunctionType':
        return 'operations';
      case 'TSUnionType':
      case 'TSIntersectionType':
        return combine(type.types.map((part) => kind(part, seen)));
      case 'TSTypeQuery': {
        // `typeof User.Type`: the data a schema decodes to.
        const query = typeQueryText(type) ?? '';
        return /\.(?:Type|Encoded)$/u.test(query) ? schemaType(query) : 'unknown';
      }
      case 'TSTypeReference': {
        const name = typeNameText(type.typeName);
        if (OPERATION_TYPES.has(name)) return 'operations';
        const [argument] = type.typeArguments?.params ?? [];
        if (SCHEMA_DATA_TYPES.has(name)) return schemaType(typeQueryText(argument));
        if (PART_OF.has(name) && argument !== undefined) return kind(argument, seen);
        return type.typeName.type === 'Identifier' ? named(name, seen) : 'unknown';
      }
      default:
        return type.type.endsWith('Keyword') || type.type === 'TSLiteralType' ? 'data' : 'unknown';
    }
  };
  return (type) => kind(type, new Set());
}

function collectTypeDeclarations(program: ESTree.Program): TypeDeclarations {
  const types = new Map<string, LocalType>();
  const imported = new Set<string>();
  const classes: ESTree.Class[] = [];
  const constants: ESTree.VariableDeclarator[] = [];
  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration') {
      for (const specifier of statement.specifiers) imported.add(specifier.local.name);
      continue;
    }
    const declaration =
      statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration'
        ? statement.declaration
        : statement;
    if (
      declaration?.type === 'TSTypeAliasDeclaration' ||
      declaration?.type === 'TSInterfaceDeclaration'
    ) {
      types.set(declaration.id.name, declaration);
    }
    if (declaration?.type === 'ClassDeclaration') classes.push(declaration);
    if (declaration?.type === 'VariableDeclaration') constants.push(...declaration.declarations);
  }
  const schemas = new Set([
    ...classes.flatMap((node) => (node.id !== null && isDataClass(node) ? [node.id.name] : [])),
    ...constants.flatMap(({ id, init }) =>
      id.type === 'Identifier' && chainRoot(init) === 'Schema' ? [id.name] : []
    ),
  ]);
  const parameterKind = shapeKind(types, schemas, imported, true);
  const instanceKind = shapeKind(types, schemas, imported, false);
  const shapes = new Map<string, string>();
  const dataServices = new Set<string>();
  for (const node of classes) {
    const shape = serviceShape(node);
    if (shape === undefined || node.id === null) continue;
    if (instanceKind(shape) === 'data') dataServices.add(node.id.name);
    // A parameter typed by the shape's own name, such as `Person`, unless that name is a generic
    // the file doesn't declare, such as `Record`. A local `…Shape` is read like the instance.
    if (shape.type !== 'TSTypeReference' || shape.typeName.type !== 'Identifier') continue;
    const name = shape.typeName.name;
    if (shape.typeArguments !== null && !types.has(name)) continue;
    const kind = name.endsWith('Shape') ? instanceKind(shape) : parameterKind(shape);
    if (kind !== 'data') shapes.set(name, node.id.name);
  }
  return { types, shapes, dataServices, imported };
}

/**
 * The service whose instance (or member) `type` describes, if any, skipping services that are
 * exempt or hold only data.
 */
function serviceOfType(
  type: ESTree.TSType,
  declarations: TypeDeclarations,
  exempt: ReadonlySet<string>,
  seen = new Set<string>()
): string | undefined {
  const accept = (service: string | undefined) =>
    service === undefined || exempt.has(service) || declarations.dataServices.has(service)
      ? undefined
      : service;
  switch (type.type) {
    case 'TSParenthesizedType':
      return serviceOfType(type.typeAnnotation, declarations, exempt, seen);
    case 'TSUnionType':
    case 'TSIntersectionType':
      for (const member of type.types) {
        const service = serviceOfType(member, declarations, exempt, seen);
        if (service !== undefined) return service;
      }
      return undefined;
    case 'TSIndexedAccessType': {
      // `X['Service']` is the instance; `X['Service']['method']` is one of its members.
      const index = type.indexType;
      if (index.type === 'TSLiteralType' && index.literal.type === 'Literal') {
        if (index.literal.value === 'Service') {
          if (type.objectType.type === 'TSTypeReference')
            return accept(typeNameText(type.objectType.typeName));
          return accept(typeQueryText(type.objectType));
        }
      }
      return serviceOfType(type.objectType, declarations, exempt, seen);
    }
    case 'TSTypeReference': {
      const name = typeNameText(type.typeName);
      const [argument] = type.typeArguments?.params ?? [];
      if (name.endsWith('Service.Shape')) return accept(typeQueryText(argument));
      if (name === 'Effect.Success') {
        // `Effect.Success<typeof Tag>` or `Effect.Success<typeof Tag.make>`
        const query = typeQueryText(argument)?.replace(/\.make$/u, '');
        return query !== undefined && /^[A-Z]\w*$/u.test(query) ? accept(query) : undefined;
      }
      if (type.typeName.type !== 'Identifier' || seen.has(name)) return undefined;
      const service = declarations.shapes.get(name);
      if (service !== undefined) return accept(service);
      const local = declarations.types.get(name);
      if (local?.type === 'TSTypeAliasDeclaration') {
        return serviceOfType(local.typeAnnotation, declarations, exempt, new Set([...seen, name]));
      }
      // Service shapes declared in another module follow the `<Service>Shape` naming.
      if (declarations.imported.has(name) && name.endsWith('Shape')) {
        return accept(name.slice(0, -'Shape'.length));
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
        const service = serviceOfType(annotation.typeAnnotation, declarations, exempt);
        if (service === undefined) continue;
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
