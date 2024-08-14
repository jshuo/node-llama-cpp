import { LlamaText } from "./LlamaText.js";
/**
 * Truncate the given text starting from the specified index and try to round to the nearest word.
 * @param text - The text to truncate and round
 * @param truncateStartIndex - The index to start truncating the text at
 * @param maxRound - The maximum number of extra characters to delete to round to the nearest word
 * @returns - The truncated and rounded text
 */
export declare function truncateTextAndRoundToWords(text: string, truncateStartIndex: number, maxRound?: number): string;
export declare function truncateLlamaTextAndRoundToWords(llamaText: LlamaText, truncateStartIndex: number, maxRound?: number): LlamaText;
