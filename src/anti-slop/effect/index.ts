import { eslintCompatPlugin } from "@oxlint/plugins";

import { noManualEffectErrorTagRule } from "./rules/no-manual-effect-error-tag.ts";
import { noOrDieRule } from "./rules/no-ordie.ts";
import { noServiceConstructorImportsRule } from "./rules/no-service-constructor-imports.ts";
import { noServiceParametersRule } from "./rules/no-service-parameters.ts";
import { noUnboundedRetryRule } from "./rules/no-unbounded-retry.ts";
import { preferEffectMatchRule } from "./rules/prefer-effect-match.ts";
import { requireCauseWhenNarrowingRule } from "./rules/require-cause-when-narrowing.ts";
import { throwInEffectGenRule } from "./rules/throw-in-effect-gen.ts";

/** Opt-in Oxlint rules for Effect service and Layer architecture. */
const antiSlopEffectPlugin = eslintCompatPlugin({
	meta: { name: "anti-slop-effect" },
	rules: {
		"no-manual-effect-error-tag": noManualEffectErrorTagRule,
		"no-ordie": noOrDieRule,
		"no-service-constructor-imports": noServiceConstructorImportsRule,
		"no-service-parameters": noServiceParametersRule,
		"no-unbounded-retry": noUnboundedRetryRule,
		"prefer-effect-match": preferEffectMatchRule,
		"require-cause-when-narrowing": requireCauseWhenNarrowingRule,
		"throw-in-effect-gen": throwInEffectGenRule,
	},
});

export default antiSlopEffectPlugin;
