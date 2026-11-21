import { RuleTester } from "oxlint/plugins-dev";

import { requireCauseWhenNarrowingRule } from "./require-cause-when-narrowing.ts";

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "ts" } } });
const imports = `
	import * as Effect from "effect/Effect";
`;
const missingCause = (operator: string, error: string) => ({ messageId: "missingCause", data: { operator, error } });

tester.run("anti-slop-effect/require-cause-when-narrowing", requireCauseWhenNarrowingRule, {
	valid: [
		`${imports}
		const a = decode(text).pipe(Effect.mapError((cause) => BadRequest.make({ reason: "Invalid JSON", cause })));
		const b = decode(text).pipe(Effect.mapError((error) => new BadRequest({ reason: error.message })));
		const c = decode(text).pipe(Effect.mapError(() => BadRequest.make({ reason: "Invalid JSON", ...details })));`,
		// Capture before narrowing.
		`${imports}
		const a = decode(text).pipe(Effect.tapError(Effect.logError), Effect.mapError(() => BadRequest.make({ reason: "Invalid JSON" })));
		const b = Effect.fn("decode")(function* () {}, Effect.tapCause(Effect.logError), Effect.catch(() => Effect.fail(new Failed())));
		const c = Effect.mapError(Effect.tapErrorCause(decode(text), Effect.logError), () => new Failed());`,
		// A value the handler builds and binds is not the error it fails with.
		`${imports}
		const a = fetchUser(id).pipe(Effect.catch(() => Effect.gen(function* () {
			const ref = yield* Ref.make(0);
			return yield* Ref.get(ref);
		})));`,
		// Effect's own constructors build values, not errors.
		`${imports}
		import { Ref } from "effect";
		const a = fetchUser(id).pipe(Effect.catch(() => Ref.make(0)));
		const b = fetchUser(id).pipe(Effect.catch(() => Effect.gen(function* () {
			return yield* Ref.make(0);
		})));`,
		`${imports}
		import * as Queue from "effect/Queue";
		const a = fetchUser(id).pipe(Effect.catch(() => Queue.make()));`,
		`${imports}
		import { ScopedCache, ScopedRef, TxRef } from "effect";
		const a = Effect.catch(load, () => ScopedRef.make(() => 0));
		const b = Effect.catch(load, () => ScopedCache.make({ lookup, capacity: 1 }));
		const c = Effect.catch(load, () => TxRef.make(0));`,
		// A data-first source built with a tap counts too.
		`${imports}
		const a = Effect.mapError(decode(text).pipe(Effect.tapError(Effect.logError)), () => new Failed());
		const b = Effect.mapError(pipe(decode(text), Effect.tapError(Effect.logError)), () => new Failed());`,
		// Specific expected tags are handled on purpose.
		`${imports}
		const a = load.pipe(Effect.catchTag("NotFound", () => Effect.fail(new Missing())));
		const b = load.pipe(Effect.catchTags({ NotFound: () => Effect.fail(new Missing()) }));`,
		// Recovering with a value, or constructing inside a nested function, is not narrowing.
		`${imports}
		const a = load.pipe(Effect.orElse(() => Effect.succeed(new Fallback())));
		const b = load.pipe(Effect.catch(() => Effect.sync(() => new Fallback())));
		const c = load.pipe(Effect.catch(() => Effect.succeed(Option.make(1))));`,
		// Not Effect's Effect.
		`
		import * as Effect from "other-library";
		const a = load.pipe(Effect.mapError(() => new Failed()));`,
	],
	invalid: [
		// The message names the class being constructed.
		{
			code: `${imports}
			import * as HttpClientError from "effect/http/HttpClientError";
			const a = Effect.mapError(load, () => new HttpClientError.HttpClientErrorSchema({ kind: "TransportError" }));`,
			errors: [missingCause("Effect.mapError", "HttpClientError.HttpClientErrorSchema")],
		},
		// An error schema imported from Effect is still an error.
		{
			code: `${imports}
			import { HttpClientErrorSchema } from "effect/http/HttpClientError";
			const a = Effect.mapError(load, () => HttpClientErrorSchema.make({ kind: "TransportError" }));`,
			errors: [missingCause("Effect.mapError", "HttpClientErrorSchema")],
		},
		{
			code: `${imports}
			const a = decode(text).pipe(Effect.mapError(() => BadRequest.make({ reason: "Invalid JSON" })));`,
			errors: [missingCause("Effect.mapError", "BadRequest")],
		},
		{
			code: `${imports}
			const a = Effect.mapError(decode(text), (_error) => new McpDialFailed({ message: "bad frame" }));`,
			errors: [missingCause("Effect.mapError", "McpDialFailed")],
		},
		{
			code: `${imports}
			const a = read.pipe(Effect.catch(() => AuthUnavailable.make({ error: "unavailable" })));
			const b = read.pipe(Effect.catchAll(() => Effect.fail(new Unavailable())));
			const c = read.pipe(Effect.orElse(() => Effect.gen(function* () {
				return yield* new Unavailable({ reason: "down" });
			})));
			const d = read.pipe(Effect.catchCause(() => { return Effect.fail(Errors.Unavailable.make()); }));`,
			errors: [
				missingCause("Effect.catch", "AuthUnavailable"),
				missingCause("Effect.catchAll", "Unavailable"),
				missingCause("Effect.orElse", "Unavailable"),
				missingCause("Effect.catchCause", "Errors.Unavailable"),
			],
		},
		{
			code: `${imports}
			const a = read.pipe(Effect.tapError(Effect.logError)).pipe(Effect.map(f), Effect.mapError(() => new Failed()));
			const b = read.pipe(Effect.mapError(() => new Failed()), Effect.tapError(Effect.logError));`,
			errors: [missingCause("Effect.mapError", "Failed")],
		},
	],
});
