import process from "process";
import { BinaryPlatform } from "./utils/getPlatform.js";
import { BinaryPlatformInfo } from "./utils/getPlatformInfo.js";
export declare const buildGpuOptions: readonly ["metal", "cuda", "vulkan", false];
export type LlamaGpuType = "metal" | "cuda" | "vulkan" | false;
export declare const nodeLlamaCppGpuOptions: readonly ["auto", "metal", "cuda", "vulkan", false];
export declare const nodeLlamaCppGpuOffStringOptions: readonly ["false", "off", "none", "disable", "disabled"];
export type BuildGpu = (typeof buildGpuOptions)[number];
export type BuildOptions = {
    customCmakeOptions: Map<string, string>;
    progressLogs: boolean;
    platform: BinaryPlatform;
    platformInfo: BinaryPlatformInfo;
    arch: typeof process.arch;
    gpu: BuildGpu;
    llamaCpp: {
        repo: string;
        release: string;
    };
};
export type BuildOptionsJSON = Omit<BuildOptions, "customCmakeOptions"> & {
    customCmakeOptions: Record<string, string>;
};
export declare function parseNodeLlamaCppGpuOption(option: (typeof nodeLlamaCppGpuOptions)[number] | (typeof nodeLlamaCppGpuOffStringOptions)[number]): BuildGpu | "auto";
export declare function convertBuildOptionsJSONToBuildOptions(buildOptionsJSON: BuildOptionsJSON): BuildOptions;
export declare function convertBuildOptionsToBuildOptionsJSON(buildOptions: BuildOptions): BuildOptionsJSON;
export type BuildMetadataFile = {
    buildOptions: BuildOptionsJSON;
};
export declare enum LlamaLogLevel {
    disabled = "disabled",
    fatal = "fatal",
    error = "error",
    warn = "warn",
    info = "info",
    debug = "debug"
}
export declare const LlamaLogLevelValues: readonly [LlamaLogLevel.disabled, LlamaLogLevel.fatal, LlamaLogLevel.error, LlamaLogLevel.warn, LlamaLogLevel.info, LlamaLogLevel.debug];
export declare enum LlamaVocabularyType {
    none = "none",
    spm = "spm",
    bpe = "bpe",
    wpm = "wpm"
}
export declare const LlamaVocabularyTypeValues: readonly [LlamaVocabularyType.none, LlamaVocabularyType.spm, LlamaVocabularyType.bpe, LlamaVocabularyType.wpm];
/**
 *Check if a log level is higher than another log level
 */
export declare function LlamaLogLevelGreaterThan(a: LlamaLogLevel, b: LlamaLogLevel): boolean;
/**
 *Check if a log level is higher than or equal to another log level
 */
export declare function LlamaLogLevelGreaterThanOrEqual(a: LlamaLogLevel, b: LlamaLogLevel): boolean;
export declare const enum LlamaLocks {
    loadToMemory = "loadToMemory"
}
