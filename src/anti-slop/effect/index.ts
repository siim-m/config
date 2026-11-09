import { eslintCompatPlugin } from "@oxlint/plugins";

import { noManualEffectErrorTagRule } from "./rules/no-manual-effect-error-tag.ts";
import { noServiceConstructorImportsRule } from "./rules/no-service-constructor-imports.ts";
import { noServiceParametersRule } from "./rules/no-service-parameters.ts";
import { preferEffectMatchRule } from "./rules/prefer-effect-match.ts";

/** Opt-in Oxlint rules for Effect service and Layer architecture. */
const antiSlopEffectPlugin = eslintCompatPlugin({
	meta: { name: "anti-slop-effect" },
	rules: {
		"no-manual-effect-error-tag": noManualEffectErrorTagRule,
		"no-service-constructor-imports": noServiceConstructorImportsRule,
		"no-service-parameters": noServiceParametersRule,
		"prefer-effect-match": preferEffectMatchRule,
	},
});

export default antiSlopEffectPlugin;
