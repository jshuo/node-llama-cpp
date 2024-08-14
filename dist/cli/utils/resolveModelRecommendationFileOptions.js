import { normalizeGgufDownloadUrl } from "../../gguf/utils/normalizeGgufDownloadUrl.js";
export function resolveModelRecommendationFileOptions(modelRecommendation) {
    return modelRecommendation.fileOptions.map((fileOption) => {
        return normalizeGgufDownloadUrl(`https://huggingface.co/${fileOption.huggingFace.model}/resolve/${fileOption.huggingFace.branch}/${fileOption.huggingFace.file}`);
    });
}
//# sourceMappingURL=resolveModelRecommendationFileOptions.js.map