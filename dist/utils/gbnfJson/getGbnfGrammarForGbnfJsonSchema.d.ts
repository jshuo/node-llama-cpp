import { GbnfJsonSchema } from "./types.js";
export declare function getGbnfGrammarForGbnfJsonSchema(schema: GbnfJsonSchema, { allowNewLines, scopePadSpaces }?: {
    allowNewLines?: boolean;
    scopePadSpaces?: number;
}): string;
