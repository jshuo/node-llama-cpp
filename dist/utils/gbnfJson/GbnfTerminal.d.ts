import { GbnfGrammarGenerator } from "./GbnfGrammarGenerator.js";
export declare abstract class GbnfTerminal {
    private _ruleName;
    protected getRuleName(grammarGenerator: GbnfGrammarGenerator): string;
    abstract getGrammar(grammarGenerator: GbnfGrammarGenerator): string;
    resolve(grammarGenerator: GbnfGrammarGenerator): string;
}
