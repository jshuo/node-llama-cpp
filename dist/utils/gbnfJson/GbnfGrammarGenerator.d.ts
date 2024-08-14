export declare class GbnfGrammarGenerator {
    rules: Map<string, string | null>;
    private ruleId;
    generateRuleName(): string;
    generateGbnfFile(rootGrammar: string): string;
}
