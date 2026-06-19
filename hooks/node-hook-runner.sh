#!/bin/bash
# Wrapper that runs a Node hook, swallowing stderr so a crashing hook can never
# break the Claude Code session. The hook itself is responsible for exiting 0
# (allow) or 2 (block); any other failure mode degrades to exit 0 here.
exec node "$1" 2>/dev/null || exit 0
