const path = require("path");
const fs = require("fs");
const webpack = require("webpack");
const {EsbuildPlugin} = require("esbuild-loader");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CopyPlugin = require("copy-webpack-plugin");
const ZipPlugin = require("zip-webpack-plugin");
const pluginManifest = require("./plugin.json");

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
                    {from: "README*.md", to: "./dist/"},
                    {from: "ROADMAP.md", to: "./dist/"},
                    {from: "docs/*.svg", to: "./dist/docs/[name][ext]"},
                    {from: "plugin.json", to: "./dist/"},
                    {from: "src/i18n/", to: "./dist/i18n/"},
                ],
            }),
        );
        plugins.push(
            new ZipPlugin({
                filename: "package.zip",
                algorithm: "gzip",
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
