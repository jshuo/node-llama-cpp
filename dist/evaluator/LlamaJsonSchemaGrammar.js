import { getGbnfGrammarForGbnfJsonSchema } from "../utils/gbnfJson/getGbnfGrammarForGbnfJsonSchema.js";
import { validateObjectAgainstGbnfSchema } from "../utils/gbnfJson/utils/validateObjectAgainstGbnfSchema.js";
import { LlamaText } from "../utils/LlamaText.js";
import { LlamaGrammar } from "./LlamaGrammar.js";
export class LlamaJsonSchemaGrammar extends LlamaGrammar {
    _schema;
    constructor(llama, schema) {
        const grammar = getGbnfGrammarForGbnfJsonSchema(schema);
        super(llama, {
            grammar,
            stopGenerationTriggers: [LlamaText(["\n".repeat(4)])],
            trimWhitespaceSuffix: true
        });
        this._schema = schema;
    }
    parse(json) {
        const parsedJson = JSON.parse(json);
        validateObjectAgainstGbnfSchema(parsedJson, this._schema);
        return parsedJson;
    }
}
//# sourceMappingURL=LlamaJsonSchemaGrammar.js.map