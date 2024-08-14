const prettyBuildGpuNames = {
    metal: "Metal",
    cuda: "CUDA",
    vulkan: "Vulkan"
};
export function getPrettyBuildGpuName(gpu) {
    if (gpu == false)
        return "no GPU";
    return prettyBuildGpuNames[gpu] ?? ('"' + gpu + '"');
}
//# sourceMappingURL=consts.js.map