import path from "path";
import fs from "fs-extra";
import { getGrammarsFolder } from "../utils/getGrammarsFolder.js";
import { LlamaText } from "../utils/LlamaText.js";
export class LlamaGrammar {
    /** @internal */ _llama;
    /** @internal */ _grammar;
    _stopGenerationTriggers;
    _trimWhitespaceSuffix;
    _grammarText;
    /**
     * > GBNF files are supported.
     * > More info here: [
     * github:ggerganov/llama.cpp:grammars/README.md
     * ](https://github.com/ggerganov/llama.cpp/blob/f5fe98d11bdf9e7797bcfb05c0c3601ffc4b9d26/grammars/README.md)
     * @param llama
     * @param options
     */
    constructor(llama, { grammar, stopGenerationTriggers = [], trimWhitespaceSuffix = false, debugPrintGrammar = false }) {
        this._llama = llama;
        this._grammar = new this._llama._bindings.AddonGrammar(grammar, {
            addonExports: this._llama._bindings,
            debugPrintGrammar
        });
        this._stopGenerationTriggers = stopGenerationTriggers ?? [];
        this._trimWhitespaceSuffix = trimWhitespaceSuffix;
        this._grammarText = grammar;
    }
    get grammar() {
        return this._grammarText;
    }
    get stopGenerationTriggers() {
        return this._stopGenerationTriggers;
    }
    get trimWhitespaceSuffix() {
        return this._trimWhitespaceSuffix;
    }
    static async getFor(llama, type) {
        const grammarsFolder = await getGrammarsFolder(llama.buildType);
        const grammarFile = path.join(grammarsFolder, type + ".gbnf");
        if (await fs.pathExists(grammarFile)) {
            const grammar = await fs.readFile(grammarFile, "utf8");
            return new LlamaGrammar(llama, {
                grammar,
                stopGenerationTriggers: [LlamaText(["\n".repeat(10)])], // this is a workaround for the model not stopping to generate text,
                trimWhitespaceSuffix: true
            });
        }
        throw new Error(`Grammar file for type "${type}" was not found in "${grammarsFolder}"`);
    }
}
//# sourceMappingURL=LlamaGrammar.js.map