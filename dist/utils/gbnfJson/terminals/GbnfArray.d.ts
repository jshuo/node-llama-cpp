import { GbnfTerminal } from "../GbnfTerminal.js";
import { GbnfGrammarGenerator } from "../GbnfGrammarGenerator.js";
import { GbnfJsonScopeState } from "../utils/GbnfJsonScopeState.js";
export declare class GbnfArray extends GbnfTerminal {
    readonly items: GbnfTerminal;
    readonly scopeState: GbnfJsonScopeState;
    constructor(items: GbnfTerminal, scopeState?: GbnfJsonScopeState);
    getGrammar(grammarGenerator: GbnfGrammarGenerator): string;
}
