import { Llama } from "../../bindings/Llama.js";
export declare function interactivelyAskForModel({ llama, modelsDirectory, allowLocalModels, downloadIntent, flashAttention }: {
    llama: Llama;
    modelsDirectory?: string;
    allowLocalModels?: boolean;
    downloadIntent?: boolean;
    flashAttention?: boolean;
}): Promise<string>;
