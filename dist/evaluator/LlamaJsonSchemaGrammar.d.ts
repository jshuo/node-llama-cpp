import { GbnfJsonSchema, GbnfJsonSchemaToType } from "../utils/gbnfJson/types.js";
import { Llama } from "../bindings/Llama.js";
import { LlamaGrammar } from "./LlamaGrammar.js";
export declare class LlamaJsonSchemaGrammar<const T extends Readonly<GbnfJsonSchema>> extends LlamaGrammar {
    private readonly _schema;
    constructor(llama: Llama, schema: T);
    parse(json: string): GbnfJsonSchemaToType<T>;
}
