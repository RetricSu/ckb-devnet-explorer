#!/usr/bin/env node
// Entry point for `npx` and global installs. The source stays TypeScript with no build
// step; tsx compiles it on the fly, the same way `npm run serve` does.
import { register } from "tsx/esm/api";

register();
await import("../src/cli.ts");
