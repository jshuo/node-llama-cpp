import chalk from "chalk";
import { DisposedError, EventRelay, withLock } from "lifecycle-utils";
import { getConsoleLogPrefix } from "../utils/getConsoleLogPrefix.js";
import { LlamaModel } from "../evaluator/LlamaModel/LlamaModel.js";
import { DisposeGuard } from "../utils/DisposeGuard.js";
import { LlamaJsonSchemaGrammar } from "../evaluator/LlamaJsonSchemaGrammar.js";
import { LlamaGrammar } from "../evaluator/LlamaGrammar.js";
import { LlamaLocks, LlamaLogLevel } from "./types.js";
import { MemoryOrchestrator } from "./utils/MemoryOrchestrator.js";
const LlamaLogLevelToAddonLogLevel = new Map([
    [LlamaLogLevel.disabled, 0],
    [LlamaLogLevel.fatal, 1],
    [LlamaLogLevel.error, 2],
    [LlamaLogLevel.warn, 3],
    [LlamaLogLevel.info, 4],
    [LlamaLogLevel.debug, 5]
]);
const addonLogLevelToLlamaLogLevel = new Map([...LlamaLogLevelToAddonLogLevel.entries()].map(([key, value]) => [value, key]));
const defaultLogLevel = 5;
export class Llama {
    /** @internal */ _bindings;
    /** @internal */ _backendDisposeGuard = new DisposeGuard();
    /** @internal */ _memoryLock = {};
    /** @internal */ _consts;
    /** @internal */ _vramOrchestrator;
    /** @internal */ _vramPadding;
    /** @internal */ _debug;
    /** @internal */ _gpu;
    /** @internal */ _buildType;
    /** @internal */ _cmakeOptions;
    /** @internal */ _supportsGpuOffloading;
    /** @internal */ _supportsMmap;
    /** @internal */ _supportsMlock;
    /** @internal */ _llamaCppRelease;
    /** @internal */ _logger;
    /** @internal */ _logLevel;
    /** @internal */ _pendingLog = null;
    /** @internal */ _pendingLogLevel = null;
    /** @internal */ _logDispatchQueuedMicrotasks = 0;
    /** @internal */ _previousLog = null;
    /** @internal */ _previousLogLevel = null;
    /** @internal */ _nextLogNeedNewLine = false;
    /** @internal */ _disposed = false;
    onDispose = new EventRelay();
    constructor({ bindings, logLevel, logger, buildType, cmakeOptions, llamaCppRelease, debug, gpu, vramOrchestrator, vramPadding }) {
        this._bindings = bindings;
        this._gpu = gpu;
        this._supportsGpuOffloading = bindings.getSupportsGpuOffloading();
        this._supportsMmap = bindings.getSupportsMmap();
        this._supportsMlock = bindings.getSupportsMlock();
        this._consts = bindings.getConsts();
        this._debug = debug;
        this._vramOrchestrator = vramOrchestrator;
        this._vramPadding = vramPadding;
        this._logLevel = this._debug
            ? LlamaLogLevel.debug
            : (logLevel ?? LlamaLogLevel.debug);
        this._logger = logger;
        this._buildType = buildType;
        this._cmakeOptions = Object.freeze({ ...cmakeOptions });
        this._llamaCppRelease = Object.freeze({
            repo: llamaCppRelease.repo,
            release: llamaCppRelease.release
        });
        this._dispatchPendingLogMicrotask = this._dispatchPendingLogMicrotask.bind(this);
        this._onAddonLog = this._onAddonLog.bind(this);
        if (!this._debug) {
            this._bindings.setLogger(this._onAddonLog);
            this._bindings.setLoggerLogLevel(LlamaLogLevelToAddonLogLevel.get(this._logLevel) ?? defaultLogLevel);
        }
        this._onExit = this._onExit.bind(this);
        process.on("exit", this._onExit);
    }
    async dispose() {
        if (this._disposed)
            return;
        this._disposed = true;
        this.onDispose.dispatchEvent();
        await this._backendDisposeGuard.acquireDisposeLock();
        await this._bindings.dispose();
    }
    /** @hidden */
    async [Symbol.asyncDispose]() {
        await this.dispose();
    }
    get disposed() {
        return this._disposed;
    }
    get gpu() {
        return this._gpu;
    }
    get supportsGpuOffloading() {
        return this._supportsGpuOffloading;
    }
    get supportsMmap() {
        return this._supportsMmap;
    }
    get supportsMlock() {
        return this._supportsMlock;
    }
    get logLevel() {
        return this._logLevel;
    }
    set logLevel(value) {
        this._ensureNotDisposed();
        if (value === this._logLevel || this._debug)
            return;
        this._bindings.setLoggerLogLevel(LlamaLogLevelToAddonLogLevel.get(value) ?? defaultLogLevel);
        this._logLevel = value;
    }
    get logger() {
        return this._logger;
    }
    set logger(value) {
        this._logger = value;
        if (value !== Llama.defaultConsoleLogger)
            this._nextLogNeedNewLine = false;
    }
    get buildType() {
        return this._buildType;
    }
    get cmakeOptions() {
        return this._cmakeOptions;
    }
    get llamaCppRelease() {
        return this._llamaCppRelease;
    }
    get systemInfo() {
        this._ensureNotDisposed();
        return this._bindings.systemInfo();
    }
    /**
     * VRAM padding used for memory size calculations, as these calculations are not always accurate.
     * This is set by default to ensure stability, but can be configured when you call `getLlama`.
     *
     * See `vramPadding` on `getLlama` for more information.
     */
    get vramPaddingSize() {
        return this._vramPadding.size;
    }
    async getVramState() {
        this._ensureNotDisposed();
        const { total, used } = this._bindings.getGpuVramInfo();
        return {
            total,
            used,
            free: Math.max(0, total - used)
        };
    }
    async getGpuDeviceNames() {
        this._ensureNotDisposed();
        const { deviceNames } = this._bindings.getGpuDeviceInfo();
        return deviceNames;
    }
    async loadModel(options) {
        this._ensureNotDisposed();
        return await withLock(this._memoryLock, LlamaLocks.loadToMemory, options.loadSignal, async () => {
            this._ensureNotDisposed();
            const preventDisposalHandle = this._backendDisposeGuard.createPreventDisposalHandle();
            try {
                return await LlamaModel._create(options, { _llama: this });
            }
            finally {
                preventDisposalHandle.dispose();
            }
        });
    }
    async createGrammarForJsonSchema(schema) {
        return new LlamaJsonSchemaGrammar(this, schema);
    }
    async getGrammarFor(type) {
        return await LlamaGrammar.getFor(this, type);
    }
    async createGrammar(options) {
        return new LlamaGrammar(this, options);
    }
    /** @internal */
    async _init() {
        await this._bindings.init();
    }
    /**
     * Log messages related to the Llama instance
     * @internal
     */
    _log(level, message) {
        this._onAddonLog(LlamaLogLevelToAddonLogLevel.get(level) ?? defaultLogLevel, message + "\n");
    }
    /** @internal */
    _onAddonLog(level, message) {
        const llamaLogLevel = addonLogLevelToLlamaLogLevel.get(level) ?? LlamaLogLevel.fatal;
        if (this._pendingLog != null && this._pendingLogLevel != null && this._pendingLogLevel != llamaLogLevel) {
            this._callLogger(this._pendingLogLevel, this._pendingLog);
            this._pendingLog = null;
        }
        const sourceMessage = (this._pendingLog ?? "") + message;
        const lastNewLineIndex = sourceMessage.lastIndexOf("\n");
        const currentLog = lastNewLineIndex < 0
            ? sourceMessage
            : sourceMessage.slice(0, lastNewLineIndex);
        const nextLog = lastNewLineIndex < 0
            ? ""
            : sourceMessage.slice(lastNewLineIndex + 1);
        if (currentLog !== "")
            this._callLogger(llamaLogLevel, currentLog);
        if (nextLog !== "") {
            this._pendingLog = nextLog;
            this._pendingLogLevel = llamaLogLevel;
            queueMicrotask(this._dispatchPendingLogMicrotask);
            this._logDispatchQueuedMicrotasks++;
        }
        else
            this._pendingLog = null;
    }
    /** @internal */
    _dispatchPendingLogMicrotask() {
        this._logDispatchQueuedMicrotasks--;
        if (this._logDispatchQueuedMicrotasks !== 0)
            return;
        if (this._pendingLog != null && this._pendingLogLevel != null) {
            this._callLogger(this._pendingLogLevel, this._pendingLog);
            this._pendingLog = null;
        }
    }
    /** @internal */
    _callLogger(level, message) {
        // llama.cpp uses dots to indicate progress, so we don't want to print them as different lines,
        // and instead, append to the same log line
        if (logMessageIsOnlyDots(message) && this._logger === Llama.defaultConsoleLogger) {
            if (logMessageIsOnlyDots(this._previousLog) && level === this._previousLogLevel) {
                process.stdout.write(message);
            }
            else {
                this._nextLogNeedNewLine = true;
                process.stdout.write(prefixAndColorMessage(message, getColorForLogLevel(level)));
            }
        }
        else {
            if (this._nextLogNeedNewLine) {
                process.stdout.write("\n");
                this._nextLogNeedNewLine = false;
            }
            try {
                this._logger(level, message);
            }
            catch (err) {
                // the native addon code calls this function, so there's no use to throw an error here
            }
        }
        this._previousLog = message;
        this._previousLogLevel = level;
    }
    /** @internal */
    _onExit() {
        if (this._pendingLog != null && this._pendingLogLevel != null) {
            this._callLogger(this._pendingLogLevel, this._pendingLog);
            this._pendingLog = null;
        }
    }
    /** @internal */
    _ensureNotDisposed() {
        if (this._disposed)
            throw new DisposedError();
    }
    /** @internal */
    static async _create({ bindings, buildType, buildMetadata, logLevel, logger, vramPadding, skipLlamaInit = false, debug }) {
        const gpu = bindings.getGpuType() ?? false;
        const vramOrchestrator = new MemoryOrchestrator(() => {
            const { total, used } = bindings.getGpuVramInfo();
            return {
                total,
                free: Math.max(0, total - used)
            };
        });
        let resolvedVramPadding;
        if (gpu === false || vramPadding === 0)
            resolvedVramPadding = vramOrchestrator.reserveMemory(0);
        else if (vramPadding instanceof Function)
            resolvedVramPadding = vramOrchestrator.reserveMemory(vramPadding((await vramOrchestrator.getMemoryState()).total));
        else
            resolvedVramPadding = vramOrchestrator.reserveMemory(vramPadding);
        const llama = new Llama({
            bindings,
            buildType,
            cmakeOptions: buildMetadata.buildOptions.customCmakeOptions,
            llamaCppRelease: {
                repo: buildMetadata.buildOptions.llamaCpp.repo,
                release: buildMetadata.buildOptions.llamaCpp.release
            },
            logLevel,
            logger,
            debug,
            gpu,
            vramOrchestrator,
            vramPadding: resolvedVramPadding
        });
        if (!skipLlamaInit)
            await llama._init();
        return llama;
    }
    static defaultConsoleLogger(level, message) {
        switch (level) {
            case LlamaLogLevel.disabled:
                break;
            case LlamaLogLevel.fatal:
                // we don't use console.error here because it prints the stack trace
                console.warn(prefixAndColorMessage(message, getColorForLogLevel(level)));
                break;
            case LlamaLogLevel.error:
                // we don't use console.error here because it prints the stack trace
                console.warn(prefixAndColorMessage(message, getColorForLogLevel(level)));
                break;
            case LlamaLogLevel.warn:
                console.warn(prefixAndColorMessage(message, getColorForLogLevel(level)));
                break;
            case LlamaLogLevel.info:
                console.info(prefixAndColorMessage(message, getColorForLogLevel(level)));
                break;
            case LlamaLogLevel.debug:
                console.debug(prefixAndColorMessage(message, getColorForLogLevel(level)));
                break;
            default:
                void level;
                console.warn(getConsoleLogPrefix() + getColorForLogLevel(LlamaLogLevel.warn)(`Unknown log level: ${level}`));
                console.log(prefixAndColorMessage(message, getColorForLogLevel(level)));
        }
    }
}
function getColorForLogLevel(level) {
    switch (level) {
        case LlamaLogLevel.disabled: return chalk.whiteBright;
        case LlamaLogLevel.fatal: return chalk.redBright;
        case LlamaLogLevel.error: return chalk.red;
        case LlamaLogLevel.warn: return chalk.yellow;
        case LlamaLogLevel.info: return chalk.whiteBright;
        case LlamaLogLevel.debug: return chalk.white;
        default:
            void level;
            return chalk.whiteBright;
    }
}
function prefixAndColorMessage(message, color) {
    return getConsoleLogPrefix() + (message
        .split("\n")
        .map(line => color(line))
        .join("\n" + getConsoleLogPrefix()));
}
function logMessageIsOnlyDots(message) {
    if (message == null)
        return false;
    for (let i = 0; i < message.length; i++) {
        if (message[i] !== ".")
            return false;
    }
    return true;
}
//# sourceMappingURL=Llama.js.map