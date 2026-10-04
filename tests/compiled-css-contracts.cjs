const {stripComments} = require("./source-scan.cjs");

function readCompiledCssContracts(css) {
    const source = stripComments(css);
    return {
        reducedMotion: /\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/.test(source),
        reducedData: /\(\s*prefers-reduced-data\s*:\s*reduce\s*\)/.test(source),
        safeArea: /env\(\s*safe-area-inset-bottom\s*,\s*0px\s*\)/.test(source),
        errorMix: /color-mix\(\s*in\s+srgb\s*,\s*var\(\s*--b3-theme-error\s*\)/.test(source),
    };
}

module.exports = {readCompiledCssContracts};
