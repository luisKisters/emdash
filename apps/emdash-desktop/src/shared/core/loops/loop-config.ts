import z from 'zod';
import { defineVersionedSchema } from '@shared/lib/versioned-schema/versioned-schema';

const loopConfigV1Schema = z.object({
  version: z.literal('1'),
  provider: z.string(),
  /** Model to pass to the agent CLI. Empty string means use the CLI default. */
  model: z.string(),
});

export const loopConfig = defineVersionedSchema().initial('1', loopConfigV1Schema).build();

export const loopConfigSchema = loopConfig.schema;
export type LoopConfig = typeof loopConfig.Type;
