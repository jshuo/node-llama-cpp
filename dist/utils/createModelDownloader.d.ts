export type ModelDownloaderOptions = {
    modelUrl: string;
    /**
     * The directory to save the model file to.
     * Default to `node-llama-cpp`'s default global models directory (`~/.node-llama-cpp/models`).
     */
    dirPath?: string;
    fileName?: string;
    headers?: Record<string, string>;
    /**
     * Defaults to `false`.
     */
    showCliProgress?: boolean;
    onProgress?: (status: {
        totalSize: number;
        downloadedSize: number;
    }) => void;
    /**
     * If true, the downloader will skip the download if the file already exists, and its size matches the size of the remote file.
     *
     * Defaults to `true`.
     */
    skipExisting?: boolean;
    /**
     * If true, the temporary file will be deleted when the download is canceled.
     *
     * Defaults to `true`.
     */
    deleteTempFileOnCancel?: boolean;
    /**
     * The number of parallel downloads to use when downloading split files.
     *
     * Defaults to `4`.
     */
    parallelDownloads?: number;
    tokens?: {
        huggingFace?: string;
    };
};
/**
 * Create a model downloader to download a model from a URL.
 * Uses [`ipull`](https://github.com/ido-pluto/ipull) to download a model file as fast as possible with parallel connections
 * and other optimizations.
 *
 * If the url points to a `.gguf` file that is split into multiple parts (for example, `model-00001-of-00009.gguf`),
 * all the parts will be downloaded to the specified directory.
 *
 * If the url points to a `.gguf` file that is binary spliced into multiple parts (for example, `model.gguf.part1of9`),
 * all the parts will be spliced into a single file and be downloaded to the specified directory.
 *
 * If the url points to a `.gguf` file that is not split or binary spliced (for example, `model.gguf`),
 * the file will be downloaded to the specified directory.
 * @example
 * ```typescript
 * import {fileURLToPath} from "url";
 * import path from "path";
 * import {createModelDownloader, getLlama} from "node-llama-cpp";
 *
 * const __dirname = path.dirname(fileURLToPath(import.meta.url));
 *
 * const downloader = await createModelDownloader({
 *     modelUrl: "https://example.com/model.gguf",
 *     dirPath: path.join(__dirname, "models")
 * });
 * const modelPath = await downloader.download();
 *
 * const llama = await getLlama();
 * const model = llama.loadModel({
 *     modelPath
 * });
 * ```
 */
export declare function createModelDownloader(options: ModelDownloaderOptions): Promise<ModelDownloader>;
export declare class ModelDownloader {
    private constructor();
    /**
     * The filename of the entrypoint file that should be used to load the model.
     */
    get entrypointFilename(): string;
    /**
     * The full path to the entrypoint file that should be used to load the model.
     */
    get entrypointFilePath(): string;
    /**
     * If the model is binary spliced from multiple parts, this will return the number of those binary parts.
     */
    get splitBinaryParts(): number | undefined;
    /**
     * The total number of files that will be saved to the directory.
     * For split files, this will be the number of split parts, as multiple files will be saved.
     * For binary-split files, this will be 1, as the parts will be spliced into a single file.
     */
    get totalFiles(): number;
    get totalSize(): number;
    get downloadedSize(): number;
    /**
     * @returns The path to the entrypoint file that should be used to load the model
     */
    download({ signal }?: {
        signal?: AbortSignal;
    }): Promise<string>;
    cancel({ deleteTempFile }?: {
        /**
         * Delete the temporary file that was created during the download.
         *
         * Defaults to the value of `deleteTempFileOnCancel` in the constructor.
         */
        deleteTempFile?: boolean;
    }): Promise<void>;
}
