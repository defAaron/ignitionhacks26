/**
 * Gate 1 — schema. Parses raw builder output against the active wave's frozen
 * contract via the zod mirrors (rule zero: componentsOutputV1Schema pairs with
 * shared/schemas/components-v1.json, V2 with components-v2.json).
 */

import {
  componentsOutputV1Schema,
  componentsOutputV2Schema,
  type ComponentsOutput,
} from "../../types/schemas";
import type { ValidationIssue, Wave } from "./types";

export type SchemaGateResult =
  | { ok: true; output: ComponentsOutput }
  | { ok: false; issues: ValidationIssue[] };

/** Parse unknown JSON against the wave's components schema. Pure. */
export function schemaGate(json: unknown, wave: Wave): SchemaGateResult {
  const schema = wave === 1 ? componentsOutputV1Schema : componentsOutputV2Schema;
  const parsed = schema.safeParse(json);
  if (parsed.success) {
    // Every valid v1 document is a valid v2 document (op enum subset),
    // so the wave-2 type is the safe common denominator.
    return { ok: true, output: parsed.data as ComponentsOutput };
  }
  return {
    ok: false,
    issues: parsed.error.issues.map((i) => {
      const commandIndex =
        i.path[0] === "components" && typeof i.path[1] === "number" ? i.path[1] : undefined;
      return {
        gate: "schema" as const,
        code: i.code,
        message: `${i.path.join(".") || "(root)"}: ${i.message}`,
        ...(commandIndex !== undefined ? { command_index: commandIndex } : {}),
      };
    }),
  };
}
