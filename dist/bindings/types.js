export const buildGpuOptions = ["metal", "cuda", "vulkan", false];
export const nodeLlamaCppGpuOptions = [
    "auto",
    ...buildGpuOptions
];
export const nodeLlamaCppGpuOffStringOptions = ["false", "off", "none", "disable", "disabled"];
export function parseNodeLlamaCppGpuOption(option) {
    function optionIsGpuOff(opt) {
        return nodeLlamaCppGpuOffStringOptions.includes(opt);
    }
    if (optionIsGpuOff(option))
        return false;
    else if (option === "auto")
        return "auto";
    if (buildGpuOptions.includes(option))
        return option;
    return "auto";
}
export function convertBuildOptionsJSONToBuildOptions(buildOptionsJSON) {
    return {
        ...buildOptionsJSON,
        customCmakeOptions: new Map(Object.entries(buildOptionsJSON.customCmakeOptions))
    };
}
export function convertBuildOptionsToBuildOptionsJSON(buildOptions) {
    return {
        ...buildOptions,
        customCmakeOptions: Object.fromEntries(buildOptions.customCmakeOptions)
    };
}
export var LlamaLogLevel;
(function (LlamaLogLevel) {
    LlamaLogLevel["disabled"] = "disabled";
    LlamaLogLevel["fatal"] = "fatal";
    LlamaLogLevel["error"] = "error";
    LlamaLogLevel["warn"] = "warn";
    LlamaLogLevel["info"] = "info";
    LlamaLogLevel["debug"] = "debug";
})(LlamaLogLevel || (LlamaLogLevel = {}));
export const LlamaLogLevelValues = Object.freeze([
    LlamaLogLevel.disabled,
    LlamaLogLevel.fatal,
    LlamaLogLevel.error,
    LlamaLogLevel.warn,
    LlamaLogLevel.info,
    LlamaLogLevel.debug
]);
export var LlamaVocabularyType;
(function (LlamaVocabularyType) {
    LlamaVocabularyType["none"] = "none";
    LlamaVocabularyType["spm"] = "spm";
    LlamaVocabularyType["bpe"] = "bpe";
    LlamaVocabularyType["wpm"] = "wpm";
})(LlamaVocabularyType || (LlamaVocabularyType = {}));
export const LlamaVocabularyTypeValues = Object.freeze([
    LlamaVocabularyType.none,
    LlamaVocabularyType.spm,
    LlamaVocabularyType.bpe,
    LlamaVocabularyType.wpm
]);
/**
 *Check if a log level is higher than another log level
 */
export function LlamaLogLevelGreaterThan(a, b) {
    return LlamaLogLevelValues.indexOf(a) < LlamaLogLevelValues.indexOf(b);
}
/**
 *Check if a log level is higher than or equal to another log level
 */
export function LlamaLogLevelGreaterThanOrEqual(a, b) {
    return LlamaLogLevelValues.indexOf(a) <= LlamaLogLevelValues.indexOf(b);
}
export var LlamaLocks;
(function (LlamaLocks) {
    LlamaLocks["loadToMemory"] = "loadToMemory";
})(LlamaLocks || (LlamaLocks = {}));
//# sourceMappingURL=types.js.map