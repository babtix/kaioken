import type { ParamType, ToolParam } from "../types.js";

/**
 * Convert the knowledge-tool `ParamType` spec into a JSON Schema object.
 *
 * The conversion is deliberately simple: choices are baked into the
 * description rather than expressed as an enum, because every provider
 * handles enums differently and the description always works.
 */
export function paramsToJsonSchema(
	params: Record<string, ToolParam>,
): Record<string, unknown> {
	const properties: Record<string, unknown> = {};
	const required: string[] = [];

	for (const [name, param] of Object.entries(params)) {
		const description = param.choices
			? `${param.description} One of: ${param.choices.join(", ")}.`
			: param.description;

		properties[name] = {
			...typeToSchema(param.type),
			description,
		};

		if (param.required) required.push(name);
	}

	return {
		type: "object",
		properties,
		...(required.length > 0 ? { required } : {}),
	};
}

function typeToSchema(type: ParamType): Record<string, unknown> {
	switch (type) {
		case "number":
			return { type: "number" };
		case "boolean":
			return { type: "boolean" };
		case "string[]":
			return { type: "array", items: { type: "string" } };
		default:
			return { type: "string" };
	}
}
