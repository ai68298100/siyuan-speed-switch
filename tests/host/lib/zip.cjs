"use strict";

/**
 * Minimal dependency-free ZIP reader for release-archive gates.
 *
 * The audit tests used to shell out to `tar -tf`, which only works where the
 * first `tar` on PATH is libarchive's bsdtar (it reads zip and accepts Windows
 * drive-letter paths). GNU tar on Git Bash treats `D:` as a remote hostname and
 * cannot read zip at all, so the same tests failed depending on shell
 * environment. Parsing the central directory with node:zlib keeps the gates
 * deterministic on every host.
 */

const zlib = require("node:zlib");

function findEocd(buffer) {
    // EOCD signature 0x06054b50; the comment (max 65535 bytes) may follow it.
    const minIndex = Math.max(0, buffer.length - 22 - 65535);
    for (let index = buffer.length - 22; index >= minIndex; index -= 1) {
        if (buffer.readUInt32LE(index) === 0x06054b50) return index;
    }
    return -1;
}

function listZipEntries(buffer) {
    const eocd = findEocd(buffer);
    if (eocd < 0) throw new Error("not a zip archive (no end-of-central-directory record)");
    const entryCount = buffer.readUInt16LE(eocd + 10);
    let offset = buffer.readUInt32LE(eocd + 16);
    const entries = [];
    for (let index = 0; index < entryCount; index += 1) {
        if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error(`corrupt central directory at ${offset}`);
        const nameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        const localOffset = buffer.readUInt32LE(offset + 42);
        entries.push({
            name: buffer.slice(offset + 46, offset + 46 + nameLength).toString("utf8"),
            localOffset,
        });
        offset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
}

function readZipEntry(buffer, entryName) {
    const entry = listZipEntries(buffer).find((candidate) => candidate.name === entryName);
    if (!entry) throw new Error(`entry not found in zip: ${entryName}`);
    const local = entry.localOffset;
    if (buffer.readUInt32LE(local) !== 0x04034b50) throw new Error(`corrupt local header for ${entryName}`);
    const compressionMethod = buffer.readUInt16LE(local + 8);
    const compressedSize = buffer.readUInt32LE(local + 18);
    const nameLength = buffer.readUInt16LE(local + 26);
    const extraLength = buffer.readUInt16LE(local + 28);
    const dataStart = local + 30 + nameLength + extraLength;
    const data = buffer.slice(dataStart, dataStart + compressedSize);
    if (compressionMethod === 0) return data;
    if (compressionMethod === 8) return zlib.inflateRawSync(data);
    throw new Error(`unsupported compression method ${compressionMethod} for ${entryName}`);
}

function listZipEntryNames(buffer) {
    return listZipEntries(buffer).map((entry) => entry.name);
}

module.exports = {listZipEntryNames, readZipEntry};
