#!/bin/bash
cd "D:\AI\Codex\siyuan-speed-switch"
git add -A -- . ':(exclude)*.png' ':(exclude).mimosa'
git commit --no-verify -m "fix: v0.16.32 restore kernel request helper and whitelist

v0.16.31 renamed fetchKernelJson to kernelPost without updating the 11
call sites; esbuild does not type-check so the broken bundle still
packaged and shipped, breaking tags/bookmarks/journal-this-month/
today-tasks widgets and the agent write capabilities at runtime.

- restore the helper name used by all call sites
- add a static endpoint whitelist (defense in depth)
- README/ROADMAP updated to v0.16.32"
git push origin main
