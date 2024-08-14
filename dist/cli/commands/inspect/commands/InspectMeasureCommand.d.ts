import { CommandModule } from "yargs";
import { BuildGpu } from "../../../../bindings/types.js";
type InspectMeasureCommand = {
    modelPath?: string;
    header?: string[];
    gpu?: BuildGpu | "auto";
    minLayers: number;
    maxLayers?: number;
    minContextSize: number;
    maxContextSize?: number;
    flashAttention?: boolean;
    measures: number;
    printHeaderBeforeEachLayer?: boolean;
    evaluateText?: string;
    repeatEvaluateText?: number;
};
export declare const InspectMeasureCommand: CommandModule<object, InspectMeasureCommand>;
export {};
