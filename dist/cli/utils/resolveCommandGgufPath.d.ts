import { Llama } from "../../bindings/Llama.js";
export declare function resolveCommandGgufPath(ggufPath: string | undefined, llama: Llama, fetchHeaders?: Record<string, string>, { targetDirectory, flashAttention }?: {
    targetDirectory?: string;
    flashAttention?: boolean;
}): Promise<string>;
