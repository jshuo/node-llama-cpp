import { LlamaGpuType, LlamaLogLevel } from "./types.js";
import { Llama } from "./Llama.js";
export type LlamaOptions = {
    /**
     * The compute layer implementation type to use for llama.cpp.
     * - **`"auto"`**: Automatically detect and use the best GPU available (Metal on macOS, and CUDA or Vulkan on Windows and Linux)
     * - **`"metal"`**: Use Metal.
     *   Only supported on macOS.
     *   Enabled by default on Apple Silicon Macs.
     * - **`"cuda"`**: Use CUDA.
     * - **`"vulkan"`**: Use Vulkan.
     * - **`false`**: Disable any GPU support and only use the CPU.
     *
     * `"auto"` by default.
     */
    gpu?: "auto" | LlamaGpuType | {
        type: "auto";
        exclude?: LlamaGpuType[];
    };
    /**
     * Set the minimum log level for llama.cpp.
     * Defaults to `"warn"`.
     */
    logLevel?: LlamaLogLevel;
    /**
     * Set a custom logger for llama.cpp logs.
     */
    logger?: (level: LlamaLogLevel, message: string) => void;
    /**
     * Set what build method to use.
     * - **`"auto"`**: If a local build is found, use it.
     * Otherwise, if a prebuilt binary is found, use it.
     * Otherwise, build from source.
     * - **`"never"`**: If a local build is found, use it.
     * Otherwise, if a prebuilt binary is found, use it.
     * Otherwise, throw a `NoBinaryFoundError` error.
     * - **`"forceRebuild"`**: Always build from source.
     * Be cautious with this option, as it will cause the build to fail on Windows when the binaries are in use by another process.
     *
     * If running from inside an Asar archive in Electron, building from source is not possible, so it'll never build from source.
     * To allow building from source in Electron apps, make sure you ship `node-llama-cpp` as an unpacked module.
     *
     * Defaults to `"auto"`.
     * On Electron, defaults to `"never"`.
     */
    build?: "auto" | "never" | "forceRebuild";
    /**
     * Set custom CMake options for llama.cpp
     */
    cmakeOptions?: Record<string, string>;
    /**
     * When a prebuilt binary is found, only use it if it was built with the same build options as the ones specified in `buildOptions`.
     * Disabled by default.
     */
    existingPrebuiltBinaryMustMatchBuildOptions?: boolean;
    /**
     * Use prebuilt binaries if they match the build options.
     * Enabled by default.
     */
    usePrebuiltBinaries?: boolean;
    /**
     * Print binary compilation progress logs.
     * Enabled by default.
     */
    progressLogs?: boolean;
    /**
     * Don't download llama.cpp source if it's not found.
     * When set to `true`, and llama.cpp source is not found, a `NoBinaryFoundError` error will be thrown.
     * Disabled by default.
     */
    skipDownload?: boolean;
    /**
     * Pad the available VRAM for the memory size calculations, as these calculations are not always accurate.
     * Recommended to ensure stability.
     * This only affects the calculations of `"auto"` in function options and is not reflected in the `getVramState` function.
     *
     * Defaults to `6%` of the total VRAM or 1GB, whichever is lower.
     * Set to `0` to disable.
     */
    vramPadding?: number | ((totalVram: number) => number);
    /**
     * Enable debug mode to find issues with llama.cpp.
     * Makes logs print directly to the console from `llama.cpp` and not through the provided logger.
     *
     * Defaults to `false`.
     *
     * The default can be set using the `NODE_LLAMA_CPP_DEBUG` environment variable.
     */
    debug?: boolean;
};
export type LastBuildOptions = {
    /**
     * Set the minimum log level for llama.cpp.
     * Defaults to "debug".
     */
    logLevel?: LlamaLogLevel;
    /**
     * Set a custom logger for llama.cpp logs.
     */
    logger?: (level: LlamaLogLevel, message: string) => void;
    /**
     * If a local build is not found, use prebuilt binaries.
     * Enabled by default.
     */
    usePrebuiltBinaries?: boolean;
    /**
     * If a local build is not found, and prebuilt binaries are not found, when building from source,
     * print binary compilation progress logs.
     * Enabled by default.
     */
    progressLogs?: boolean;
    /**
     * If a local build is not found, and prebuilt binaries are not found, don't download llama.cpp source if it's not found.
     * When set to `true`, and llama.cpp source is needed but is not found, a `NoBinaryFoundError` error will be thrown.
     * Disabled by default.
     */
    skipDownload?: boolean;
    /**
     * Pad the available VRAM for the memory size calculations, as these calculations are not always accurate.
     * Recommended to ensure stability.
     * This only affects the calculations of `"auto"` in function options and is not reflected in the `getVramState` function.
     *
     * Defaults to `6%` of the total VRAM or 1GB, whichever is lower.
     * Set to `0` to disable.
     */
    vramPadding?: number | ((totalVram: number) => number);
    /**
     * Enable debug mode to find issues with llama.cpp.
     * Makes logs print directly to the console from `llama.cpp` and not through the provided logger.
     *
     * Defaults to `false`.
     *
     * The default can be set using the `NODE_LLAMA_CPP_DEBUG` environment variable.
     */
    debug?: boolean;
};
export declare const getLlamaFunctionName = "getLlama";
export declare const defaultLlamaVramPadding: (totalVram: number) => number;
/**
 * Get a `llama.cpp` binding.
 *
 * Defaults to use a local binary built using the `download` or `build` CLI commands if one exists,
 * otherwise, uses a prebuilt binary, and fallbacks to building from source if a prebuilt binary is not found.
 *
 * Pass `"lastBuild"` to default to use the last successful build created using the `download` or `build` CLI commands if one exists.
 */
export declare function getLlama(options?: LlamaOptions): Promise<Llama>;
export declare function getLlama(type: "lastBuild", lastBuildOptions?: LastBuildOptions): Promise<Llama>;
export declare function getLlamaForOptions({ gpu, logLevel, logger, build, cmakeOptions, existingPrebuiltBinaryMustMatchBuildOptions, usePrebuiltBinaries, progressLogs, skipDownload, vramPadding, debug }: LlamaOptions, { updateLastBuildInfoOnCompile, skipLlamaInit }?: {
    updateLastBuildInfoOnCompile?: boolean;
    skipLlamaInit?: boolean;
}): Promise<Llama>;
