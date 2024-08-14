import { EventRelay } from "lifecycle-utils";
import { LlamaModel, LlamaModelOptions } from "../evaluator/LlamaModel/LlamaModel.js";
import { GbnfJsonSchema } from "../utils/gbnfJson/types.js";
import { LlamaJsonSchemaGrammar } from "../evaluator/LlamaJsonSchemaGrammar.js";
import { LlamaGrammar, LlamaGrammarOptions } from "../evaluator/LlamaGrammar.js";
import { LlamaGpuType, LlamaLogLevel } from "./types.js";
export declare class Llama {
    readonly onDispose: EventRelay<void>;
    private constructor();
    dispose(): Promise<void>;
    /** @hidden */
    [Symbol.asyncDispose](): Promise<void>;
    get disposed(): boolean;
    get gpu(): LlamaGpuType;
    get supportsGpuOffloading(): boolean;
    get supportsMmap(): boolean;
    get supportsMlock(): boolean;
    get logLevel(): LlamaLogLevel;
    set logLevel(value: LlamaLogLevel);
    get logger(): (level: LlamaLogLevel, message: string) => void;
    set logger(value: (level: LlamaLogLevel, message: string) => void);
    get buildType(): "localBuild" | "prebuilt";
    get cmakeOptions(): Readonly<Record<string, string>>;
    get llamaCppRelease(): {
        readonly repo: string;
        readonly release: string;
    };
    get systemInfo(): string;
    /**
     * VRAM padding used for memory size calculations, as these calculations are not always accurate.
     * This is set by default to ensure stability, but can be configured when you call `getLlama`.
     *
     * See `vramPadding` on `getLlama` for more information.
     */
    get vramPaddingSize(): number;
    getVramState(): Promise<{
        total: number;
        used: number;
        free: number;
    }>;
    getGpuDeviceNames(): Promise<string[]>;
    loadModel(options: LlamaModelOptions): Promise<LlamaModel>;
    createGrammarForJsonSchema<const T extends Readonly<GbnfJsonSchema>>(schema: T): Promise<LlamaJsonSchemaGrammar<T>>;
    getGrammarFor(type: Parameters<typeof LlamaGrammar.getFor>[1]): Promise<LlamaGrammar>;
    createGrammar(options: LlamaGrammarOptions): Promise<LlamaGrammar>;
    static defaultConsoleLogger(level: LlamaLogLevel, message: string): void;
}
