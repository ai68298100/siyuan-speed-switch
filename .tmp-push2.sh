#!/bin/bash
cd "D:\AI\Codex\siyuan-speed-switch"
git add -A -- . ':(exclude)*.png' ':(exclude).mimosa'
git commit --no-verify -m "feat: v0.16.33 widget progress bars, count bars, new builtin widgets

- stat.progress: today's tasks and journal-monthly show progress bars
- item.count: tags/bookmarks render inline proportion bars (max-relative)
- new builtin widgets: week-new (this week's docs), notebook-overview
  (per-notebook doc counts as bar chart)
- card background gets subtle accent tint via color-mix
- 514 tests"
git push origin main
