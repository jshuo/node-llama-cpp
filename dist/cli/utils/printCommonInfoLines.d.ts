import { LlamaContext } from "../../evaluator/LlamaContext/LlamaContext.js";
export declare function printCommonInfoLines({ context, minTitleLength, logBatchSize, tokenMeterEnabled, printBos, printEos }: {
    context: LlamaContext;
    minTitleLength?: number;
    logBatchSize?: boolean;
    tokenMeterEnabled?: boolean;
    printBos?: boolean;
    printEos?: boolean;
}): Promise<void>;
