import os from "os";
import { getDefaultContextSequences } from "../../evaluator/LlamaContext/LlamaContext.js";
import { resolveModelGpuLayersOption } from "./utils/resolveModelGpuLayersOption.js";
import { resolveContextContextSizeOption } from "./utils/resolveContextContextSizeOption.js";
import { scoreLevels } from "./utils/scoreLevels.js";
export class GgufInsightsConfigurationResolver {
    /** @internal */ _ggufInsights;
    constructor(ggufInsights) {
        this._ggufInsights = ggufInsights;
    }
    get ggufInsights() {
        return this._ggufInsights;
    }
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
    async scoreModelConfigurationCompatibility({ contextSize = Math.min(4096, this._ggufInsights.trainContextSize ?? 4096), embeddingContext = false, flashAttention = false } = {}, { getVramState = (() => this._ggufInsights._llama._vramOrchestrator.getMemoryState()), getRamState = (async () => ({ total: os.totalmem(), free: os.freemem() })), llamaVramPaddingSize = this._ggufInsights._llama.vramPaddingSize, llamaGpu = this._ggufInsights._llama.gpu, llamaSupportsGpuOffloading = this._ggufInsights._llama.supportsGpuOffloading } = {}) {
        const defaultTrainContextSize = 4096;
        const [vramState, ramState] = await Promise.all([
            getVramState(),
            getRamState()
        ]);
        const resolvedGpuLayers = await this.resolveModelGpuLayers("auto", {
            getVramState: async () => vramState,
            llamaVramPaddingSize,
            llamaGpu,
            llamaSupportsGpuOffloading
        });
        const canUseGpu = llamaSupportsGpuOffloading && llamaGpu !== false;
        const estimatedModelResourceUsage = this._ggufInsights.estimateModelResourceRequirements({
            gpuLayers: resolvedGpuLayers
        });
        const resolvedContextSize = await this.resolveContextContextSize("auto", {
            getVramState: async () => ({
                total: vramState.total,
                free: Math.max(0, vramState.free - estimatedModelResourceUsage.gpuVram)
            }),
            llamaGpu,
            isEmbeddingContext: embeddingContext,
            modelGpuLayers: resolvedGpuLayers,
            modelTrainContextSize: this._ggufInsights.trainContextSize ?? defaultTrainContextSize
        });
        const estimatedContextResourceUsage = this._ggufInsights.estimateContextResourceRequirements({
            contextSize: resolvedContextSize,
            isEmbeddingContext: embeddingContext,
            modelGpuLayers: resolvedGpuLayers,
            flashAttention
        });
        const rankPoints = {
            gpuLayers: 60,
            allLayersAreOffloaded: 10,
            contextSize: 30,
            ramUsageFitsInRam: 10,
            cpuOnlySmallModelSize: 60, // also defined inside `scoreModelSizeForCpuOnlyUsage`
            bonusContextSize: 10
        };
        const gpuLayersPoints = rankPoints.gpuLayers * Math.min(1, resolvedGpuLayers / this._ggufInsights.totalLayers);
        const allLayersAreOffloadedPoints = rankPoints.allLayersAreOffloaded * (resolvedGpuLayers === this._ggufInsights.totalLayers ? 1 : 0);
        const contextSizePoints = rankPoints.contextSize * Math.min(1, resolvedContextSize / contextSize);
        const ramUsageFitsInRamPoints = rankPoints.ramUsageFitsInRam * (estimatedModelResourceUsage.cpuRam <= ramState.free
            ? 1
            : estimatedModelResourceUsage.cpuRam <= ramState.total
                ? 0.5
                : (0.5 - Math.min(0.5, 0.5 * ((estimatedModelResourceUsage.cpuRam - ramState.total) / ramState.total))));
        const bonusContextSizePoints = 10 * Math.min(1, Math.max(0, resolvedContextSize - contextSize) / contextSize);
        const compatibilityScore = canUseGpu
            ? ((gpuLayersPoints + allLayersAreOffloadedPoints + contextSizePoints + ramUsageFitsInRamPoints) /
                (rankPoints.gpuLayers + rankPoints.allLayersAreOffloaded + rankPoints.contextSize + rankPoints.ramUsageFitsInRam))
            : ((contextSizePoints + ramUsageFitsInRamPoints + scoreModelSizeForCpuOnlyUsage(this._ggufInsights.modelSize)) /
                (rankPoints.contextSize + rankPoints.ramUsageFitsInRam + rankPoints.cpuOnlySmallModelSize));
        const bonusScore = bonusContextSizePoints / rankPoints.bonusContextSize;
        return {
            compatibilityScore,
            bonusScore,
            totalScore: compatibilityScore + bonusScore,
            resolvedValues: {
                gpuLayers: resolvedGpuLayers,
                contextSize: resolvedContextSize,
                modelRamUsage: estimatedModelResourceUsage.cpuRam,
                contextRamUsage: estimatedContextResourceUsage.cpuRam,
                totalRamUsage: estimatedModelResourceUsage.cpuRam + estimatedContextResourceUsage.cpuRam,
                modelVramUsage: estimatedModelResourceUsage.gpuVram,
                contextVramUsage: estimatedContextResourceUsage.gpuVram,
                totalVramUsage: estimatedModelResourceUsage.gpuVram + estimatedContextResourceUsage.gpuVram
            }
        };
    }
    async resolveModelGpuLayers(gpuLayers, { ignoreMemorySafetyChecks = false, getVramState = (() => this._ggufInsights._llama._vramOrchestrator.getMemoryState()), llamaVramPaddingSize = this._ggufInsights._llama.vramPaddingSize, llamaGpu = this._ggufInsights._llama.gpu, llamaSupportsGpuOffloading = this._ggufInsights._llama.supportsGpuOffloading, defaultContextFlashAttention = false } = {}) {
        return resolveModelGpuLayersOption(gpuLayers, {
            ggufInsights: this._ggufInsights,
            ignoreMemorySafetyChecks,
            getVramState,
            llamaVramPaddingSize,
            llamaGpu,
            llamaSupportsGpuOffloading,
            defaultContextFlashAttention
        });
    }
    async resolveContextContextSize(contextSize, { modelGpuLayers, batchSize, modelTrainContextSize, flashAttention = false, getVramState = (() => this._ggufInsights._llama._vramOrchestrator.getMemoryState()), llamaGpu = this._ggufInsights._llama.gpu, ignoreMemorySafetyChecks = false, isEmbeddingContext = false, sequences = getDefaultContextSequences() }) {
        return await resolveContextContextSizeOption({
            contextSize,
            batchSize,
            sequences,
            modelFileInsights: this._ggufInsights,
            modelGpuLayers,
            modelTrainContextSize,
            flashAttention,
            getVramState,
            llamaGpu,
            ignoreMemorySafetyChecks,
            isEmbeddingContext
        });
    }
    /** @internal */
    static _create(ggufInsights) {
        return new GgufInsightsConfigurationResolver(ggufInsights);
    }
}
function scoreModelSizeForCpuOnlyUsage(modelSize) {
    const s1GB = Math.pow(1024, 3);
    return 60 - scoreLevels(modelSize, [{
            start: s1GB,
            end: s1GB * 2.5,
            points: 40
        }, {
            start: s1GB * 2.5,
            end: s1GB * 4,
            points: 15
        }, {
            start: s1GB * 4,
            points: 5
        }]);
}
//# sourceMappingURL=GgufInsightsConfigurationResolver.js.map