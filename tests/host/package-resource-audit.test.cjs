const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {listZipEntryStats} = require(path.join(__dirname, 'lib', 'zip.cjs'));

const root = path.resolve(__dirname, '..', '..');
const MAX_ARCHIVE_ENTRIES = 32;
const MAX_COMPRESSED_ENTRY_BYTES = 120 * 1024;

test('release archive reports bounded per-entry resource sizes', (t) => {
    const zip = path.join(root, 'package.zip');
    if (!fs.existsSync(zip)) return;

    const entries = listZipEntryStats(fs.readFileSync(zip)).sort((left, right) => left.name.localeCompare(right.name));
    assert.ok(entries.length > 0 && entries.length <= MAX_ARCHIVE_ENTRIES,
        `package.zip has ${entries.length} entries; expected at most ${MAX_ARCHIVE_ENTRIES}`);
    assert.equal(new Set(entries.map((entry) => entry.name)).size, entries.length,
        'package.zip must not contain duplicate entries');

    for (const entry of entries) {
        t.diagnostic(`${entry.name}: compressed=${entry.compressedSize} bytes, uncompressed=${entry.uncompressedSize} bytes`);
        assert.ok(Number.isInteger(entry.compressedSize) && entry.compressedSize >= 0);
        assert.ok(Number.isInteger(entry.uncompressedSize) && entry.uncompressedSize >= 0);
        assert.ok(entry.compressedSize <= MAX_COMPRESSED_ENTRY_BYTES,
            `${entry.name} is ${entry.compressedSize} compressed bytes; per-entry budget is ${MAX_COMPRESSED_ENTRY_BYTES}`);
    }
});
