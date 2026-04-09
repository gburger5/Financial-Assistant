/**
 * Type declaration shim for @strands-agents/sdk/anthropic subpath export.
 * Required because tsconfig uses moduleResolution: "node" which cannot
 * resolve package.json "exports" subpaths. The runtime import works fine.
 */
declare module '@strands-agents/sdk/anthropic' {
  import type { Model } from '@strands-agents/sdk';

  interface AnthropicModelOptions {
    apiKey?: string;
    modelId?: string;
    maxTokens?: number;
    temperature?: number;
    clientConfig?: Record<string, unknown>;
    client?: unknown;
  }

  export class AnthropicModel extends Model {
    constructor(options?: AnthropicModelOptions);
  }
}
