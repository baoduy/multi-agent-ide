import type { Config } from "drizzle-kit";

export default {
  schema: "./packages/daemon/src/db/schema.ts",
  out: "./packages/daemon/src/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: `${process.env.HOME}/.magenta/magenta.db`,
  },
} satisfies Config;
