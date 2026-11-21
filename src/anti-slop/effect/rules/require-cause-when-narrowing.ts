// Changed from the fork: a data-first source built with `.pipe(Effect.tapError(...))` counts as logged, and a
// yielded value bound to a name, such as `const ref = yield* Ref.make(0)`, or the `make` of an Effect value module,
// such as `Ref.make(0)`, is not a constructed error.
import { defineRule } from "@oxlint/plugins";

import type { ESTree, SourceCode } from "@oxlint/plugins";

import {
	collectEffectModuleNames,
	genFunction,
	isFunction,
	keyName,
	moduleCallName,
	moduleMemberName,
	precedingSteps,
	returnedExpressions,
	unwrapNode,
	walk,
	type EffectModuleNames,
	type FunctionNode,
} from "../shared/effect-modules.ts";

const narrowingOperators: ReadonlySet<string> = new Set(["mapError", "catch", "catchAll", "catchCause", "orElse"]);
const tapOperators: ReadonlySet<string> = new Set(["tapError", "tapErrorCause", "tapCause", "tapErrorTag"]);
const effectModuleNamesList: readonly ("Context" | "Effect" | "Layer" | "ManagedRuntime")[] = [
	"Context",
	"Effect",
	"Layer",
	"ManagedRuntime",
];

/** Whether the handler never reads the error it receives. */
function ignoresError(handler: FunctionNode, sourceCode: SourceCode): boolean {
	const [parameter] = handler.params;
	if (parameter === undefined) return true;
	if (parameter.type !== "Identifier") return false;
	const variable = sourceCode
		.getDeclaredVariables(handler)
		.find((candidate) => candidate.identifiers.some((identifier) => identifier === parameter));
	return variable !== undefined && variable.references.length === 0;
}

/** Effect modules whose `make` builds a value, such as a `Ref` or a `Queue`, rather than an error. */
// From Effect 3 and 4: the modules that export a `make` and are not errors.
const valueModules: ReadonlySet<string> = new Set([
	"Array",
	"BigDecimal",
	"Cache",
	"Chunk",
	"Combiner",
	"ConfigProvider",
	"Cron",
	"DateTime",
	"Deferred",
	"Equivalence",
	"ExecutionPlan",
	"FiberHandle",
	"FiberMap",
	"FiberRef",
	"FiberSet",
	"Filter",
	"Graph",
	"HashMap",
	"HashRing",
	"HashSet",
	"KeyedPool",
	"Latch",
	"LayerMap",
	"LayerRef",
	"List",
	"Logger",
	"Mailbox",
	"MutableHashMap",
	"MutableHashSet",
	"MutableList",
	"MutableRef",
	"Order",
	"PartitionedSemaphore",
	"Pool",
	"PubSub",
	"Queue",
	"RcMap",
	"RcRef",
	"Redacted",
	"Reducer",
	"Ref",
	"RequestResolver",
	"Scope",
	"ScopedCache",
	"ScopedRef",
	"Semaphore",
	"Sink",
	"SortedMap",
	"SortedSet",
	"Stream",
	"SubscriptionRef",
	"SynchronizedRef",
	"TArray",
	"TDeferred",
	"TMap",
	"TPriorityQueue",
	"TPubSub",
	"TQueue",
	"TReentrantLock",
	"TRef",
	"TSemaphore",
	"TSet",
	"TSubscriptionRef",
	"Tracer",
	"Trie",
	"Tuple",
	"TxChunk",
	"TxDeferred",
	"TxHashMap",
	"TxHashSet",
	"TxPriorityQueue",
	"TxQueue",
	"TxReentrantLock",
	"TxRef",
	"TxSemaphore",
	"TxSubscriptionRef",
]);

/** The local names a file binds to Effect's value modules: `import { Ref } from "effect"` or `import * as Ref from "effect/Ref"`. */
function effectImports(program: ESTree.Program): ReadonlySet<string> {
	const locals = new Set<string>();
	for (const statement of program.body) {
		if (statement.type !== "ImportDeclaration") continue;
		const source = statement.source.value;
		for (const specifier of statement.specifiers) {
			if (source === "effect" && specifier.type === "ImportSpecifier") {
				const name = specifier.imported.type === "Identifier" ? specifier.imported.name : specifier.imported.value;
				if (valueModules.has(name)) locals.add(specifier.local.name);
			} else if (source.startsWith("effect/") && specifier.type !== "ImportSpecifier") {
				if (valueModules.has(source.slice("effect/".length))) locals.add(specifier.local.name);
			}
		}
	}
	return locals;
}

/** `new X(...)` or `X.make(...)` for a capitalized `X` that is not an Effect module. */
function isErrorConstruction(
	node: ESTree.Node,
	names: EffectModuleNames,
	imported: ReadonlySet<string>,
): node is ESTree.NewExpression | ESTree.CallExpression {
	if (node.type === "NewExpression") return unwrapNode(node.callee).type === "Identifier" || unwrapNode(node.callee).type === "MemberExpression";
	if (node.type !== "CallExpression") return false;
	const callee = unwrapNode(node.callee);
	if (
		callee.type !== "MemberExpression" ||
		callee.computed ||
		callee.property.type !== "Identifier" ||
		callee.property.name !== "make"
	) {
		return false;
	}
	const owner = unwrapNode(callee.object);
	const ownerName = owner.type === "Identifier" ? owner.name : owner.type === "MemberExpression" && owner.property.type === "Identifier" ? owner.property.name : null;
	if (ownerName === null || !/^[A-Z]/u.test(ownerName)) return false;
	if (owner.type === "Identifier" && imported.has(owner.name)) return false;
	return !effectModuleNamesList.some((module) => moduleMemberName(callee, names, module) !== null);
}

/** Whether any argument is an object literal with a `cause` property or a spread that may supply one. */
function passesCause(node: ESTree.NewExpression | ESTree.CallExpression): boolean {
	return node.arguments.some((argument) => {
		const expression = unwrapNode(argument);
		return (
			expression.type === "ObjectExpression" &&
			expression.properties.some(
				(property) => property.type === "SpreadElement" || (!property.computed && keyName(property.key) === "cause"),
			)
		);
	});
}

/** The constructed errors a handler produces without descending into nested functions. */
function constructedErrors(
	handler: FunctionNode,
	names: EffectModuleNames,
	imported: ReadonlySet<string>,
): readonly (ESTree.NewExpression | ESTree.CallExpression)[] {
	const found: (ESTree.NewExpression | ESTree.CallExpression)[] = [];
	const consider = (node: ESTree.Node) => {
		const expression = unwrapNode(node);
		if (expression.type === "YieldExpression" && expression.argument !== null) {
			consider(expression.argument);
			return;
		}
		if (isErrorConstruction(expression, names, imported)) found.push(expression);
	};
	for (const returned of returnedExpressions(handler)) consider(returned);
	if (handler.body === null) return found;
	walk(handler.body, (node) => {
		// An Effect.gen generator runs as the handler's own effect; other nested functions run later, if at all.
		if (isFunction(node)) return node.type === "FunctionExpression" && genFunction(node.parent, names) === node;
		if (moduleCallName(node, names, "Effect") === "fail" && node.type === "CallExpression") {
			const [argument] = node.arguments;
			if (argument !== undefined) consider(argument);
		}
		// A yielded value bound to a name, such as `const ref = yield* Ref.make(0)`, is not the error the handler fails with.
		if (node.type === "YieldExpression" && node.delegate && node.argument !== null && node.parent.type !== "VariableDeclarator") {
			consider(node.argument);
		}
		return true;
	});
	return [...new Set(found)];
}

/** The steps that build a data-first source: the steps of `source.pipe(...)` or `pipe(source, ...)`, or the source itself. */
function sourceSteps(source: ESTree.Node): readonly ESTree.Node[] {
	const expression = unwrapNode(source);
	if (expression.type !== "CallExpression") return [expression];
	const callee = unwrapNode(expression.callee);
	if (callee.type === "MemberExpression" && !callee.computed && callee.property.type === "Identifier" && callee.property.name === "pipe") {
		return [expression, ...expression.arguments];
	}
	if (callee.type === "Identifier" && callee.name === "pipe") return [expression, ...expression.arguments.slice(1)];
	return [expression];
}

/** Whether `node` is a call of a tap operator, or the operator itself. */
function isTapStep(node: ESTree.Node, names: EffectModuleNames): boolean {
	const expression = unwrapNode(node);
	const member = moduleCallName(expression, names, "Effect") ?? moduleMemberName(expression, names, "Effect");
	return member !== null && tapOperators.has(member);
}

/** Require narrowing handlers that replace an error to keep the original as `cause`. */
export const requireCauseWhenNarrowingRule = defineRule({
	meta: {
		type: "problem",
		docs: {
			description:
				"Require Effect.mapError/catch/catchAll/catchCause/orElse handlers that construct a new error to keep the original error as `cause`.",
		},
		messages: {
			missingCause:
				"This {{operator}} handler discards the original error and constructs a new one without it. Name the handler's parameter and pass it as `cause` (`(error) => new {{error}}({ ..., cause: error })`, or `new Error(message, { cause: error })` for a native Error), or log it first with `Effect.tapError(Effect.logError)` before narrowing.",
		},
	},
	create(context) {
		const names = collectEffectModuleNames(context.sourceCode.ast);
		const imported = effectImports(context.sourceCode.ast);

		return {
			CallExpression(node) {
				const operator = moduleCallName(node, names, "Effect");
				if (operator === null || !narrowingOperators.has(operator)) return;
				const handler = node.arguments.at(-1);
				if (handler === undefined || !isFunction(handler)) return;
				if (!ignoresError(handler, context.sourceCode)) return;
				const constructed = constructedErrors(handler, names, imported).find((construction) => !passesCause(construction));
				if (constructed === undefined) return;
				const dataFirstSource = node.arguments.length > 1 ? node.arguments[0] : undefined;
				const earlier = dataFirstSource === undefined ? precedingSteps(node) : sourceSteps(dataFirstSource);
				if (earlier.some((step) => isTapStep(step, names))) return;
				const callee = unwrapNode(constructed.callee);
				// `X.make(...)` names `X`; `new A.B(...)` names `A.B`.
				const errorName =
					callee.type === "MemberExpression" && constructed.type === "CallExpression"
						? context.sourceCode.getText(callee.object)
						: context.sourceCode.getText(callee);
				context.report({ node: constructed, messageId: "missingCause", data: { operator: `Effect.${operator}`, error: errorName } });
			},
		};
	},
});
