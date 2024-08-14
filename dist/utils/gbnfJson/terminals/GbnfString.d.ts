import { GbnfTerminal } from "../GbnfTerminal.js";
export declare class GbnfString extends GbnfTerminal {
    getGrammar(): string;
    protected getRuleName(): string;
}
