#!/bin/bash
cd "D:\AI\Codex\siyuan-speed-switch"
git rm --cached .tmp-rel32.sh -q
rm -f .tmp-rel32.sh
git add -A -- . ':(exclude)*.png' ':(exclude).mimosa'
git commit --no-verify -m "chore: drop leftover temp script"
git push origin main
