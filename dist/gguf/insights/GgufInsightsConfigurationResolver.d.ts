import { BuildGpu } from "../../bindings/types.js";
import { LlamaModelOptions } from "../../evaluator/LlamaModel/LlamaModel.js";
import { LlamaContextOptions } from "../../evaluator/LlamaContext/types.js";
import type { GgufInsights } from "./GgufInsights.js";
export declare class GgufInsightsConfigurationResolver {
    private constructor();
    get ggufInsights(): GgufInsights;
    /**
     * Score the compatibility of the model configuration with the current GPU and VRAM state.
     * Assumes a model is loaded with the default `"auto"` configurations.
     * Scored based on the following criteria:
     * - The number of GPU layers that can be offloaded to the GPU (only if there's a GPU. If there's no GPU then by how small the model is)
     * - Whether all layers can be offloaded to the GPU (gives additional points)
     * - Whether the resolved context size is at least as large as the specified `contextSize`
     *
     * IF the resolved context size is larger than the specified context size, for each multiplier of the specified `contextSize`
     * that the resolved context size is larger by, 1 bonus point is given in the `bonusScore`.
     *
     * `contextSize` defaults to `4096` (if the model train context size is lower than this, the model train context size is used instead).
     */
    scoreModelConfigurationCompatibility({ contextSize, embeddingContext, flashAttention }?: {
        contextSize?: number;
        embeddingContext?: boolean;
        flashAttention?: boolean;
    }, { getVramState, getRamState, llamaVramPaddingSize, llamaGpu, llamaSupportsGpuOffloading }?: {
        getVramState?(): Promise<{
            total: number;
            free: number;
        }>;
        getRamState?(): Promise<{
            total: number;
            free: number;
        }>;
        llamaVramPaddingSize?: number;
        llamaGpu?: BuildGpu;
        llamaSupportsGpuOffloading?: boolean;
    }): Promise<{
        /**
         * A number between `0` (inclusive) and `1` (inclusive) representing the compatibility score.
         */
        compatibilityScore: number;
        /**
         * A number starting at `0` with no upper limit representing the bonus score.
         * For each multiplier of the specified `contextSize` that the resolved context size is larger by, 1 bonus point is given.
         */
        bonusScore: number;
        /**
         * The total score, which is the sum of the compatibility and bonus scores.
         */
        totalScore: number;
        /**
         * The resolved values used to calculate the scores.
         */
        resolvedValues: {
            gpuLayers: number;
            contextSize: number;
            modelRamUsage: number;
            contextRamUsage: number;
            totalRamUsage: number;
            modelVramUsage: number;
            contextVramUsage: number;
            totalVramUsage: number;
        };
    }>;
    resolveModelGpuLayers(gpuLayers: LlamaModelOptions["gpuLayers"], { ignoreMemorySafetyChecks, getVramState, llamaVramPaddingSize, llamaGpu, llamaSupportsGpuOffloading, defaultContextFlashAttention }?: {
        ignoreMemorySafetyChecks?: boolean;
        getVramState?(): Promise<{
            total: number;
            free: number;
        }>;
        llamaVramPaddingSize?: number;
        llamaGpu?: BuildGpu;
        llamaSupportsGpuOffloading?: boolean;
        defaultContextFlashAttention?: boolean;
    }): Promise<number>;
    resolveContextContextSize(contextSize: LlamaContextOptions["contextSize"], { modelGpuLayers, batchSize, modelTrainContextSize, flashAttention, getVramState, llamaGpu, ignoreMemorySafetyChecks, isEmbeddingContext, sequences }: {
        modelGpuLayers: number;
        modelTrainContextSize: number;
        flashAttention?: boolean;
        batchSize?: LlamaContextOptions["batchSize"];
        sequences?: number;
        getVramState?(): Promise<{
            total: number;
            free: number;
        }>;
        llamaGpu?: BuildGpu;
        ignoreMemorySafetyChecks?: boolean;
        isEmbeddingContext?: boolean;
    }): Promise<number>;
}
