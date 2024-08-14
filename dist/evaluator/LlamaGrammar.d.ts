import { LlamaText } from "../utils/LlamaText.js";
import { Llama } from "../bindings/Llama.js";
import { Token } from "../types.js";
export type LlamaGrammarOptions = {
    /** GBNF grammar */
    grammar: string;
    /**
     * print the parsed grammar to stdout.
     * Useful for debugging.
     */
    debugPrintGrammar?: boolean;
    /** Consider any of these as EOS for the generated text. Only supported by `LlamaChat` and `LlamaChatSession` */
    stopGenerationTriggers?: readonly (LlamaText | string | readonly (string | Token)[])[];
    /** Trim whitespace from the end of the generated text. Only supported by `LlamaChat` and `LlamaChatSession` */
    trimWhitespaceSuffix?: boolean;
};
export declare class LlamaGrammar {
    private readonly _stopGenerationTriggers;
    private readonly _trimWhitespaceSuffix;
    private readonly _grammarText;
    /**
     * > GBNF files are supported.
     * > More info here: [
     * github:ggerganov/llama.cpp:grammars/README.md
     * ](https://github.com/ggerganov/llama.cpp/blob/f5fe98d11bdf9e7797bcfb05c0c3601ffc4b9d26/grammars/README.md)
     * @param llama
     * @param options
     */
    constructor(llama: Llama, { grammar, stopGenerationTriggers, trimWhitespaceSuffix, debugPrintGrammar }: LlamaGrammarOptions);
    get grammar(): string;
    get stopGenerationTriggers(): readonly (string | import("../utils/LlamaText.js")._LlamaText | readonly (string | Token)[])[];
    get trimWhitespaceSuffix(): boolean;
    static getFor(llama: Llama, type: "json" | "list" | "arithmetic" | "japanese" | "chess"): Promise<LlamaGrammar>;
}
