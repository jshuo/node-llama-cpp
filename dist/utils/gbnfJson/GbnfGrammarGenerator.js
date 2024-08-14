export class GbnfGrammarGenerator {
    rules = new Map();
    ruleId = 0;
    generateRuleName() {
        const ruleId = this.ruleId;
        this.ruleId++;
        return `rule${ruleId}`;
    }
    generateGbnfFile(rootGrammar) {
        const rules = [{
                name: "root",
                grammar: rootGrammar
            }];
        for (const [ruleName, grammar] of this.rules.entries()) {
            if (grammar == null)
                continue;
            rules.push({
                name: ruleName,
                grammar
            });
        }
        const ruleStrings = rules.map((rule) => rule.name + " ::= " + rule.grammar);
        const gbnf = ruleStrings.join("\n");
        return gbnf;
    }
}
//# sourceMappingURL=GbnfGrammarGenerator.js.map