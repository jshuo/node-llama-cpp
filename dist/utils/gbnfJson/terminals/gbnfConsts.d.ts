export declare const grammarNoValue = "\"\"";
export declare const reservedRuleNames: {
    readonly null: "null-rule";
    readonly boolean: "boolean-rule";
    readonly number: {
        readonly fractional: "fractional-number-rule";
        readonly integer: "integer-number-rule";
    };
    readonly string: "string-rule";
    readonly whitespace: ({ newLine, nestingScope, scopeSpaces }: {
        newLine?: "before" | "after" | false;
        nestingScope: number;
        scopeSpaces: number;
    }) => string;
};
