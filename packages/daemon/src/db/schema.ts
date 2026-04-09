import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const repos = sqliteTable("repos", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull().unique(),
  branch: text("branch").notNull(),
  hasSpecs: integer("has_specs", { mode: "boolean" }).notNull().default(false),
  specCount: integer("spec_count").notNull().default(0),
  status: text("status", { enum: ["active", "missing", "archived"] })
    .notNull()
    .default("active"),
  scannedAt: integer("scanned_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const workingDirs = sqliteTable("working_dirs", {
  id: text("id").primaryKey(),
  path: text("path").notNull().unique(),
});

export const sessionState = sqliteTable(
  "session_state",
  {
    id: integer("id").primaryKey(),
    selectedRepoPath: text("selected_repo_path"),
    selectedSpecPath: text("selected_spec_path"),
    selectedFilePath: text("selected_file_path"),
    sidebarWidth: integer("sidebar_width").default(300),
    activityPanelWidth: integer("activity_panel_width").default(300),
    activityPanelOpen: integer("activity_panel_open", { mode: "boolean" }).default(true),
    mainTab: text("main_tab", { enum: ["flow", "editor", "worktrees"] }).default("flow"),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => ({
    singleSessionRow: check("session_state_single_row", sql`${table.id} = 1`),
  })
);
