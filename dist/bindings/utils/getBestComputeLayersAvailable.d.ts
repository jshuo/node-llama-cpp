import process from "process";
import { BuildGpu } from "../types.js";
import { BinaryPlatform } from "./getPlatform.js";
export declare function getBestComputeLayersAvailable(): Promise<(false | "cuda" | "vulkan" | "metal")[]>;
export declare function detectBestComputeLayersAvailable({ platform, arch, hasCudaWithStaticBinaryBuild }?: {
    platform?: BinaryPlatform;
    arch?: typeof process.arch;
    hasCudaWithStaticBinaryBuild?: boolean;
}): Promise<BuildGpu[]>;
