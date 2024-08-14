export const ggufDefaultFetchRetryOptions = {
    retries: 10,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 1000 * 16
};
export const defaultExtraAllocationSize = 1024 * 1024 * 1.5; // 1.5MB
export const noDirectSubNestingGGufMetadataKeys = [
    "general.license",
    "tokenizer.chat_template"
];
//# sourceMappingURL=consts.js.map