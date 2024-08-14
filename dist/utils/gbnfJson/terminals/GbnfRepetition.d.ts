import { GbnfTerminal } from "../GbnfTerminal.js";
import { GbnfGrammarGenerator } from "../GbnfGrammarGenerator.js";
export declare class GbnfRepetition extends GbnfTerminal {
    readonly value: GbnfTerminal;
    readonly minRepetitions: number;
    readonly maxRepetitions: number | null;
    constructor(value: GbnfTerminal, minRepetitions: number, maxRepetitions: number | null);
    getGrammar(grammarGenerator: GbnfGrammarGenerator): string;
}
