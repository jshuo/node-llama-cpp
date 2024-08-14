import { CommandModule } from "yargs";
import { BuildGpu } from "../../bindings/types.js";
type InfillCommand = {
    modelPath?: string;
    header?: string[];
    gpu?: BuildGpu | "auto";
    systemInfo: boolean;
    prefix?: string;
    prefixFile?: string;
    suffix?: string;
    suffixFile?: string;
    contextSize?: number;
    batchSize?: number;
    flashAttention?: boolean;
    threads: number;
    temperature: number;
    minP: number;
    topK: number;
    topP: number;
    gpuLayers?: number;
    repeatPenalty: number;
    lastTokensRepeatPenalty: number;
    penalizeRepeatingNewLine: boolean;
    repeatFrequencyPenalty?: number;
    repeatPresencePenalty?: number;
    maxTokens: number;
    debug: boolean;
    meter: boolean;
    printTimings: boolean;
};
export declare const InfillCommand: CommandModule<object, InfillCommand>;
export {};
