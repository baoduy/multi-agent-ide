"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MagentaConfigSchema = void 0;
const zod_1 = require("zod");
exports.MagentaConfigSchema = zod_1.z.object({
    workingDirs: zod_1.z.array(zod_1.z.string()).default([]),
});
