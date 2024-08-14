export declare function getBuildDefaults(): Promise<{
    repo: string;
    release: string;
    gpuSupport: false | "cuda" | "vulkan" | "metal" | "auto";
}>;
