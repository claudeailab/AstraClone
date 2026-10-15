import { mysqlTable, varchar, text, mediumtext, timestamp, int, bigint, boolean, date } from "drizzle-orm/mysql-core";

export const settings = mysqlTable("astraclone_settings", {
  key: varchar("key", { length: 255 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const secret_reminders = mysqlTable("astraclone_secret_reminders", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  expiryDate: date("expiry_date").notNull(),
  reminderDays: int("reminder_days").notNull().default(30),
  createdAt: timestamp("created_at").defaultNow(),
});

export const permission_groups = mysqlTable("astraclone_permission_groups", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description", { length: 500 }),
  permissions: text("permissions").notNull().default("[]"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const users = mysqlTable("astraclone_users", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  username: varchar("username", { length: 255 }).unique(),
  displayName: varchar("display_name", { length: 255 }),
  source: varchar("source", { length: 50 }).notNull().default("local"),
  azureOid: varchar("azure_oid", { length: 255 }),
  passwordHash: varchar("password_hash", { length: 255 }),
  groupId: int("group_id"),
  disabled: boolean("disabled").notNull().default(false),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sessions = mysqlTable("astraclone_sessions", {
  id: varchar("id", { length: 255 }).primaryKey(),
  userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const audit_logs = mysqlTable("astraclone_audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  userEmail: varchar("user_email", { length: 255 }),
  action: varchar("action", { length: 100 }).notNull(),
  resource: varchar("resource", { length: 255 }).notNull(),
  detail: text("detail"),
  ip: varchar("ip", { length: 45 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const push_subscriptions = mysqlTable("astraclone_push_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: varchar("auth", { length: 255 }).notNull(),
  label: varchar("label", { length: 255 }),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const feature_catalog = mysqlTable("astraclone_feature_catalog", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const plans = mysqlTable("astraclone_plans", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  monthlyPrice: int("monthly_price").notNull().default(0),
  yearlyPrice: int("yearly_price").notNull().default(0),
  features: text("features").notNull().default("[]"),
  stripePriceIdMonthly: varchar("stripe_price_id_monthly", { length: 255 }),
  stripePriceIdYearly: varchar("stripe_price_id_yearly", { length: 255 }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const github_connections = mysqlTable("astraclone_github_connections", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  username: varchar("username", { length: 255 }).notNull(),
  token: text("token").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const repositories = mysqlTable("astraclone_repositories", {
  id: int("id").autoincrement().primaryKey(),
  connectionId: int("connection_id").notNull().references(() => github_connections.id),
  owner: varchar("owner", { length: 100 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  githubId: bigint("github_id", { mode: "number" }),
  isPrivate: boolean("is_private").notNull().default(false),
  canPush: boolean("can_push").notNull().default(false),
  defaultBranch: varchar("default_branch", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const syncs = mysqlTable("astraclone_syncs", {
  id: int("id").autoincrement().primaryKey(),
  sourceRepoId: int("source_repo_id").notNull().references(() => repositories.id),
  destRepoId: int("dest_repo_id").notNull().references(() => repositories.id),
  direction: varchar("direction", { length: 20 }).notNull().default("one_way"),
  branches: varchar("branches", { length: 1000 }).notNull().default(""),
  syncTags: boolean("sync_tags").notNull().default(true),
  forcePush: boolean("force_push").notNull().default(false),
  mode: varchar("mode", { length: 20 }).notNull().default("full"),
  propagateDeletes: boolean("propagate_deletes").notNull().default(false),
  refState: mediumtext("ref_state"),
  intervalMinutes: int("interval_minutes").notNull().default(15),
  enabled: boolean("enabled").notNull().default(true),
  lastStatus: varchar("last_status", { length: 20 }).notNull().default("pending"),
  lastMessage: text("last_message"),
  lastRunAt: timestamp("last_run_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sync_runs = mysqlTable("astraclone_sync_runs", {
  id: int("id").autoincrement().primaryKey(),
  syncId: int("sync_id").notNull().references(() => syncs.id, { onDelete: "cascade" }),
  triggeredBy: varchar("triggered_by", { length: 20 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  message: text("message"),
  details: text("details"),
  changes: mediumtext("changes"),
  filesChanged: int("files_changed").notNull().default(0),
  startedAt: timestamp("started_at").notNull(),
  finishedAt: timestamp("finished_at"),
});
