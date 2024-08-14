import { LlamaContextOptions } from "../../../evaluator/LlamaContext/types.js";
import { GgufInsights } from "../GgufInsights.js";
import { BuildGpu } from "../../../bindings/types.js";
export declare function resolveContextContextSizeOption({ contextSize, batchSize, sequences, modelFileInsights, modelGpuLayers, modelTrainContextSize, flashAttention, getVramState, llamaGpu, ignoreMemorySafetyChecks, isEmbeddingContext }: {
    contextSize?: LlamaContextOptions["contextSize"];
    batchSize?: LlamaContextOptions["batchSize"];
    sequences: number;
    modelFileInsights: GgufInsights;
    modelGpuLayers: number;
    modelTrainContextSize: number;
    flashAttention: boolean;
    getVramState(): Promise<{
        total: number;
        free: number;
    }>;
    llamaGpu: BuildGpu;
    ignoreMemorySafetyChecks?: boolean;
    isEmbeddingContext?: boolean;
}): Promise<number>;
