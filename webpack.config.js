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
                new EsbuildPlugin(),
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
                                target: "es6",
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