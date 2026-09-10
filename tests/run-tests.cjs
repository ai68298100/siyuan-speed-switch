const {readdirSync} = require("node:fs");
const {join} = require("node:path");
const {spawnSync} = require("node:child_process");

const testDirectories = [__dirname, join(__dirname, "host")];
const testFiles = testDirectories.flatMap((directory) =>
    readdirSync(directory, {withFileTypes: true})
        .filter((entry) => entry.isFile() && entry.name.endsWith(".test.cjs"))
        .map((entry) => join(directory, entry.name)),
).sort();

if (testFiles.length === 0) {
    console.error("No test files were found.");
    process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...testFiles], {stdio: "inherit"});
if (result.error) {
    console.error(result.error.message);
    process.exit(1);
}
process.exit(result.status ?? 1);
