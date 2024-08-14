import process from "process";
import path from "path";
import os from "os";
import { downloadFile, downloadSequence } from "ipull";
import fs from "fs-extra";
import { normalizeGgufDownloadUrl } from "../gguf/utils/normalizeGgufDownloadUrl.js";
import { createSplitPartFilename, resolveSplitGgufParts } from "../gguf/utils/resolveSplitGgufParts.js";
import { getFilenameForBinarySplitGgufPartUrls, resolveBinarySplitGgufPartUrls } from "../gguf/utils/resolveBinarySplitGgufPartUrls.js";
import { cliModelsDirectory } from "../config.js";
import { safeEventCallback } from "./safeEventCallback.js";
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
export async function createModelDownloader(options) {
    const downloader = ModelDownloader._create(options);
    await downloader._init();
    return downloader;
}
export class ModelDownloader {
    /** @internal */ _modelUrl;
    /** @internal */ _dirPath;
    /** @internal */ _fileName;
    /** @internal */ _headers;
    /** @internal */ _showCliProgress;
    /** @internal */ _onProgress;
    /** @internal */ _tokens;
    /** @internal */ _deleteTempFileOnCancel;
    /** @internal */ _skipExisting;
    /** @internal */ _parallelDownloads;
    /** @internal */ _downloader;
    /** @internal */ _specificFileDownloaders = [];
    /** @internal */ _entrypointFilename;
    /** @internal */ _splitBinaryParts;
    /** @internal */ _totalFiles;
    /** @internal */ _tryHeaders = [];
    constructor({ modelUrl, dirPath = cliModelsDirectory, fileName, headers, showCliProgress = false, onProgress, deleteTempFileOnCancel = true, skipExisting = true, parallelDownloads = 4, tokens }) {
        if (modelUrl == null || dirPath == null)
            throw new Error("modelUrl and dirPath cannot be null");
        this._modelUrl = normalizeGgufDownloadUrl(modelUrl);
        this._dirPath = path.resolve(process.cwd(), dirPath);
        this._fileName = fileName;
        this._headers = headers;
        this._showCliProgress = showCliProgress;
        this._onProgress = safeEventCallback(onProgress);
        this._deleteTempFileOnCancel = deleteTempFileOnCancel;
        this._skipExisting = skipExisting;
        this._parallelDownloads = parallelDownloads;
        this._tokens = tokens;
        this._onDownloadProgress = this._onDownloadProgress.bind(this);
    }
    /**
     * The filename of the entrypoint file that should be used to load the model.
     */
    get entrypointFilename() {
        return this._entrypointFilename;
    }
    /**
     * The full path to the entrypoint file that should be used to load the model.
     */
    get entrypointFilePath() {
        return path.join(this._dirPath, this.entrypointFilename);
    }
    /**
     * If the model is binary spliced from multiple parts, this will return the number of those binary parts.
     */
    get splitBinaryParts() {
        return this._splitBinaryParts;
    }
    /**
     * The total number of files that will be saved to the directory.
     * For split files, this will be the number of split parts, as multiple files will be saved.
     * For binary-split files, this will be 1, as the parts will be spliced into a single file.
     */
    get totalFiles() {
        return this._totalFiles;
    }
    get totalSize() {
        return this._downloader.downloadStatues
            .map(status => status.totalBytes)
            .reduce((acc, totalBytes) => acc + totalBytes, 0);
    }
    get downloadedSize() {
        return this._downloader.downloadStatues
            .map(status => status.transferredBytes)
            .reduce((acc, transferredBytes) => acc + transferredBytes, 0);
    }
    /**
     * @returns The path to the entrypoint file that should be used to load the model
     */
    async download({ signal } = {}) {
        if (signal?.aborted)
            throw signal.reason;
        if (this._skipExisting) {
            if (this._specificFileDownloaders.length === 1 && await fs.pathExists(this.entrypointFilePath)) {
                const fileStat = await fs.stat(this.entrypointFilePath);
                if (this._specificFileDownloaders[0].status.totalBytes === fileStat.size)
                    return this.entrypointFilePath;
            }
            else {
                // TODO: skip existing split files
            }
        }
        const onAbort = () => {
            signal?.removeEventListener("abort", onAbort);
            this.cancel();
        };
        if (signal != null)
            signal.addEventListener("abort", onAbort);
        try {
            if (this._onProgress)
                this._downloader.on("progress", this._onDownloadProgress);
            await this._downloader.download();
        }
        catch (err) {
            if (signal?.aborted)
                throw signal.reason;
            throw err;
        }
        finally {
            if (this._onProgress)
                this._downloader.off("progress", this._onDownloadProgress);
            if (signal != null)
                signal.removeEventListener("abort", onAbort);
        }
        return this.entrypointFilePath;
    }
    async cancel({ deleteTempFile = this._deleteTempFileOnCancel } = {}) {
        for (const downloader of this._specificFileDownloaders) {
            if (deleteTempFile)
                await downloader.closeAndDeleteFile();
            else
                await downloader.close();
        }
        if (this._downloader !== this._specificFileDownloaders[0])
            await this._downloader?.close();
    }
    /** @internal */
    _onDownloadProgress() {
        this._onProgress?.({
            totalSize: this.totalSize,
            downloadedSize: this.downloadedSize
        });
    }
    /** @internal */
    async resolveTryHeaders() {
        if (this._tokens == null)
            return;
        const { huggingFace } = this._tokens;
        const [hfToken] = await Promise.all([
            resolveHfToken(huggingFace)
        ]);
        if (hfToken != null && hfToken !== "")
            this._tryHeaders?.push({
                ...(this._headers ?? {}),
                "Authorization": `Bearer ${hfToken}`
            });
    }
    /** @internal */
    async _init() {
        await this.resolveTryHeaders();
        const binarySplitPartUrls = resolveBinarySplitGgufPartUrls(this._modelUrl);
        await fs.ensureDir(this._dirPath);
        if (binarySplitPartUrls instanceof Array) {
            this._downloader = await downloadFile({
                partURLs: binarySplitPartUrls,
                directory: this._dirPath,
                fileName: this._fileName ?? getFilenameForBinarySplitGgufPartUrls(binarySplitPartUrls),
                cliProgress: this._showCliProgress,
                headers: this._headers ?? {},
                tryHeaders: this._tryHeaders.slice()
            });
            this._specificFileDownloaders.push(this._downloader);
            this._entrypointFilename = this._downloader.fileName;
            this._splitBinaryParts = binarySplitPartUrls.length;
            this._totalFiles = 1;
            if (this._downloader.fileName == null || this._downloader.fileName === "")
                throw new Error("Failed to get the file name from the given URL");
            return;
        }
        const splitGgufPartUrls = resolveSplitGgufParts(this._modelUrl);
        if (splitGgufPartUrls.length === 1) {
            this._downloader = await downloadFile({
                url: splitGgufPartUrls[0],
                directory: this._dirPath,
                fileName: this._fileName ?? undefined,
                cliProgress: this._showCliProgress,
                headers: this._headers ?? {},
                tryHeaders: this._tryHeaders.slice()
            });
            this._specificFileDownloaders.push(this._downloader);
            this._entrypointFilename = this._downloader.fileName;
            this._totalFiles = 1;
            if (this._downloader.fileName == null || this._downloader.fileName === "")
                throw new Error("Failed to get the file name from the given URL");
            return;
        }
        const partDownloads = splitGgufPartUrls.map((url, index) => downloadFile({
            url,
            directory: this._dirPath,
            fileName: this._fileName != null
                ? createSplitPartFilename(this._fileName, index + 1, splitGgufPartUrls.length)
                : undefined,
            headers: this._headers ?? {},
            tryHeaders: this._tryHeaders.slice()
        }));
        this._downloader = await downloadSequence({
            cliProgress: this._showCliProgress,
            parallelDownloads: this._parallelDownloads
        }, ...partDownloads);
        const firstDownload = await partDownloads[0];
        this._specificFileDownloaders = await Promise.all(partDownloads);
        this._entrypointFilename = firstDownload.fileName;
        this._totalFiles = partDownloads.length;
        if (this._entrypointFilename == null || this._entrypointFilename === "")
            throw new Error("Failed to get the file name from the given URL");
        return;
    }
    /** @internal */
    static _create(options) {
        return new ModelDownloader(options);
    }
}
async function resolveHfToken(providedToken) {
    if (providedToken !== null)
        return providedToken;
    if (process.env.HF_TOKEN != null)
        return process.env.HF_TOKEN;
    const hfHomePath = process.env.HF_HOME ||
        path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "huggingface");
    const hfTokenPath = process.env.HF_TOKEN_PATH || path.join(hfHomePath, "token");
    try {
        if (await fs.pathExists(hfTokenPath)) {
            const token = (await fs.readFile(hfTokenPath, "utf8")).trim();
            if (token !== "")
                return token;
        }
    }
    catch (err) {
        // do nothing
    }
    return undefined;
}
//# sourceMappingURL=createModelDownloader.js.map