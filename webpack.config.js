const path = require("path");
const fs = require("fs");
const webpack = require("webpack");
const {EsbuildPlugin} = require("esbuild-loader");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CopyPlugin = require("copy-webpack-plugin");
const ZipPlugin = require("zip-webpack-plugin");
const pluginManifest = require("./plugin.json");
// Construct local midnight so yazl's local Date getters emit DOS time=0 on
// every builder timezone, while the calendar date remains ZIP's epoch.
const RELEASE_ZIP_MTIME = new Date(1980, 0, 1, 0, 0, 0, 0);

const packageImagePatterns = [
    ["icon", "icon.png"],
    ["preview", "preview.png"],
].flatMap(([field, legacyName]) => {
    const fileName = pluginManifest[field] || (fs.existsSync(legacyName) ? legacyName : "");
    return fileName ? [{from: fileName, to: "./dist/"}] : [];
});

module.exports = (env, argv) => {
    const production = argv.mode === "production";
    const plugins = [
        new webpack.DefinePlugin({
            // 构建时注入日志开关：开发构建开启；生产构建默认关闭（配合 logger 死代码消除实现量产静音），
            // 真机排查时可 SW_LOG=1 显式打开生产日志
            __LOG_ENABLED__: JSON.stringify(!production || process.env.SW_LOG === "1"),
        }),
        new MiniCssExtractPlugin({
            filename: production ? "dist/index.css" : "index.css",
        }),
    ];
    if (production) {
        plugins.push(
            new webpack.BannerPlugin({
                banner: () => {
                    return fs.readFileSync("LICENSE").toString();
                },
            }),
        );
        plugins.push(
            new CopyPlugin({
                patterns: [
                    ...packageImagePatterns,
                    // Normalize documentation line endings at the copy boundary so
                    // Windows and Ubuntu release runners produce identical archives.
                    // ROADMAP.md stays a repo-only dev doc (D-219); the interface
                    // map SVG ships because the market renders it from README.
                    {from: "README*.md", to: "./dist/", transform: (content) => content.toString().replace(/\r\n?/g, "\n")},
                    {from: "docs/*.svg", to: "./dist/docs/[name][ext]"},
                    {from: "docs/component-store-guide.md", to: "./dist/docs/component-store-guide.md", transform: (content) => content.toString().replace(/\r\n?/g, "\n")},
                    {from: "docs/agent-document-context-m2.md", to: "./dist/docs/agent-document-context-m2.md", transform: (content) => content.toString().replace(/\r\n?/g, "\n")},
                    {from: "plugin.json", to: "./dist/", transform: (content) => content.toString().replace(/\r\n?/g, "\n")},
                    // Ship locale files minified: sources stay pretty for diffs,
                    // the archive only needs JSON.parse-able content. This buys
                    // back real bytes against the 300 KiB hard cap.
                    {from: "src/i18n/", to: "./dist/i18n/", transform: (content) => JSON.stringify(JSON.parse(content.toString("utf8")))},
                ],
            }),
        );
        plugins.push(
            new ZipPlugin({
                filename: "package.zip",
                algorithm: "gzip",
                fileOptions: {
                    // Keep central-directory metadata stable across builds so
                    // identical sources produce byte-identical release archives.
                    mtime: RELEASE_ZIP_MTIME,
                    mode: 0o100664,
                    compress: true,
                    forceZip64Format: false,
                },
                include: [/dist/],
                pathMapper: (assetPath) => {
                    return assetPath.replace("dist/", "");
                },
            }),
        );
    } else {
        plugins.push(
            new CopyPlugin({
                patterns: [
                    {from: "src/i18n/", to: "./i18n/"},
                    {from: "icon.png", to: "./icon.png"},
                    {from: "preview.png", to: "./preview.png"},
                ],
            }),
        );
    }
    return {
        mode: argv.mode || "development",
        watch: !production,
        devtool: production ? false : "eval-source-map",
        output: {
            filename: "[name].js",
            path: path.resolve(__dirname),
            libraryTarget: "commonjs2",
            library: {
                type: "commonjs2",
            },
        },
        externals: {
            siyuan: "siyuan",
        },
        entry: {
            [production ? "dist/index" : "index"]: "./src/index.ts",
        },
        optimization: {
            minimize: production,
            minimizer: [
                // legalComments:none 剥离压缩产物中保留的许可证注释；
                // LICENSE 仍由 BannerPlugin 以完整文本形式附在产物头部。
                new EsbuildPlugin({legalComments: "none"}),
            ],
        },
        resolve: {
            extensions: [".ts", ".scss", ".js", ".json"],
        },
        module: {
            rules: [
                {
                    test: /\.ts(x?)$/,
                    include: [path.resolve(__dirname, "src")],
                    use: [
                        {
                            loader: "esbuild-loader",
                            options: {
                                // 思源桌面端为 Electron、手机端为现代 WebView（kernel minAppVersion 3.1.20），
                                // es2020 覆盖可选链/空值合并且保留 async/await 原生语法，
                                // 避免降级到 es6 时注入大段 __async/generator 辅助函数。
                                target: "es2020",
                            },
                        },
                    ],
                },
                {
                    test: /\.scss$/,
                    include: [path.resolve(__dirname, "src")],
                    use: [
                        MiniCssExtractPlugin.loader,
                        {
                            loader: "css-loader",
                        },
                        {
                            loader: "sass-loader",
                        },
                    ],
                },
            ],
        },
        plugins,
    };
};
