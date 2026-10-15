export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Create tables if they don't exist
  {
    const { db } = await import("./lib/db");
    const stmts = [
      `CREATE TABLE IF NOT EXISTS \`astraclone_settings\` (
        \`key\` varchar(255) NOT NULL,
        \`value\` text NOT NULL,
        \`updated_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS \`astraclone_secret_reminders\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`name\` varchar(255) NOT NULL,
        \`expiry_date\` date NOT NULL,
        \`reminder_days\` int NOT NULL DEFAULT 30,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS \`astraclone_permission_groups\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`name\` varchar(255) NOT NULL,
        \`description\` varchar(500),
        \`permissions\` text NOT NULL DEFAULT ('[]'),
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS \`astraclone_users\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`email\` varchar(255) NOT NULL,
        \`username\` varchar(255) NULL,
        \`display_name\` varchar(255),
        \`source\` varchar(50) NOT NULL DEFAULT 'local',
        \`azure_oid\` varchar(255),
        \`password_hash\` varchar(255),
        \`group_id\` int NULL,
        \`last_login_at\` timestamp NULL,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`astraclone_users_email_unique\` (\`email\`),
        UNIQUE KEY \`astraclone_users_username_unique\` (\`username\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS \`astraclone_sessions\` (
        \`id\` varchar(255) NOT NULL,
        \`user_id\` int NOT NULL,
        \`expires_at\` timestamp NOT NULL,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`astraclone_sessions_user_id_fk\` FOREIGN KEY (\`user_id\`) REFERENCES \`astraclone_users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS \`astraclone_push_subscriptions\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`user_id\` int NOT NULL,
        \`endpoint\` text NOT NULL,
        \`p256dh\` text NOT NULL,
        \`auth\` varchar(255) NOT NULL,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`astraclone_push_sub_user_fk\` FOREIGN KEY (\`user_id\`) REFERENCES \`astraclone_users\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS \`astraclone_plans\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`name\` varchar(255) NOT NULL,
        \`monthly_price\` int NOT NULL DEFAULT 0,
        \`yearly_price\` int NOT NULL DEFAULT 0,
        \`features\` text NOT NULL DEFAULT ('[]'),
        \`stripe_price_id_monthly\` varchar(255),
        \`stripe_price_id_yearly\` varchar(255),
        \`active\` tinyint(1) NOT NULL DEFAULT 1,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS \`astraclone_feature_catalog\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`name\` varchar(255) NOT NULL,
        \`description\` varchar(500),
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS \`astraclone_audit_logs\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`user_email\` varchar(255),
        \`action\` varchar(100) NOT NULL,
        \`resource\` varchar(255) NOT NULL,
        \`detail\` text,
        \`ip\` varchar(45),
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS \`astraclone_github_connections\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`name\` varchar(255) NOT NULL,
        \`username\` varchar(255) NOT NULL,
        \`token\` text NOT NULL,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS \`astraclone_repositories\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`connection_id\` int NOT NULL,
        \`owner\` varchar(100) NOT NULL,
        \`name\` varchar(100) NOT NULL,
        \`github_id\` bigint NULL,
        \`is_private\` tinyint(1) NOT NULL DEFAULT 0,
        \`can_push\` tinyint(1) NOT NULL DEFAULT 0,
        \`default_branch\` varchar(255),
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`astraclone_repositories_connection_fk\` FOREIGN KEY (\`connection_id\`) REFERENCES \`astraclone_github_connections\` (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS \`astraclone_syncs\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`source_repo_id\` int NOT NULL,
        \`dest_repo_id\` int NOT NULL,
        \`direction\` varchar(20) NOT NULL DEFAULT 'one_way',
        \`branches\` varchar(1000) NOT NULL DEFAULT '',
        \`sync_tags\` tinyint(1) NOT NULL DEFAULT 1,
        \`force_push\` tinyint(1) NOT NULL DEFAULT 0,
        \`mode\` varchar(20) NOT NULL DEFAULT 'full',
        \`propagate_deletes\` tinyint(1) NOT NULL DEFAULT 0,
        \`ref_state\` mediumtext,
        \`interval_minutes\` int NOT NULL DEFAULT 15,
        \`enabled\` tinyint(1) NOT NULL DEFAULT 1,
        \`last_status\` varchar(20) NOT NULL DEFAULT 'pending',
        \`last_message\` text,
        \`last_run_at\` timestamp NULL,
        \`created_at\` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`astraclone_syncs_source_fk\` FOREIGN KEY (\`source_repo_id\`) REFERENCES \`astraclone_repositories\` (\`id\`),
        CONSTRAINT \`astraclone_syncs_dest_fk\` FOREIGN KEY (\`dest_repo_id\`) REFERENCES \`astraclone_repositories\` (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS \`astraclone_sync_runs\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`sync_id\` int NOT NULL,
        \`triggered_by\` varchar(20) NOT NULL,
        \`status\` varchar(20) NOT NULL,
        \`message\` text,
        \`details\` text,
        \`changes\` mediumtext,
        \`files_changed\` int NOT NULL DEFAULT 0,
        \`started_at\` timestamp NOT NULL,
        \`finished_at\` timestamp NULL,
        PRIMARY KEY (\`id\`),
        KEY \`astraclone_sync_runs_sync_idx\` (\`sync_id\`, \`started_at\`),
        CONSTRAINT \`astraclone_sync_runs_sync_fk\` FOREIGN KEY (\`sync_id\`) REFERENCES \`astraclone_syncs\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    ];
    for (const sql of stmts) {
      await db.execute(sql as unknown as Parameters<typeof db.execute>[0]);
    }

    // Schema migrations (no-op if already applied)
    const migrations = [
      "ALTER TABLE `astraclone_users` DROP COLUMN `role`",
      "ALTER TABLE `astraclone_permission_groups` DROP COLUMN `is_default`",
      "ALTER TABLE `astraclone_users` ADD COLUMN `username` varchar(255) NULL",
      "ALTER TABLE `astraclone_users` ADD UNIQUE KEY `astraclone_users_username_unique` (`username`)",
      "ALTER TABLE `astraclone_users` ADD COLUMN `disabled` boolean NOT NULL DEFAULT false",
      "ALTER TABLE `astraclone_push_subscriptions` ADD COLUMN `label` varchar(255)",
      "ALTER TABLE `astraclone_push_subscriptions` ADD COLUMN `enabled` boolean NOT NULL DEFAULT true",
      "ALTER TABLE `astraclone_syncs` DROP COLUMN `name`",
      "ALTER TABLE `astraclone_repositories` ADD COLUMN `github_id` bigint NULL AFTER `name`",
      "ALTER TABLE `astraclone_syncs` ADD COLUMN `mode` varchar(20) NOT NULL DEFAULT 'full' AFTER `force_push`",
      "ALTER TABLE `astraclone_syncs` ADD COLUMN `propagate_deletes` tinyint(1) NOT NULL DEFAULT 0 AFTER `mode`",
      "ALTER TABLE `astraclone_syncs` ADD COLUMN `ref_state` mediumtext AFTER `propagate_deletes`",
      "ALTER TABLE `astraclone_sync_runs` ADD COLUMN `changes` mediumtext AFTER `details`",
      "ALTER TABLE `astraclone_sync_runs` ADD COLUMN `files_changed` int NOT NULL DEFAULT 0 AFTER `changes`",
      `UPDATE \`astraclone_permission_groups\` SET \`permissions\` = IF(\`permissions\` LIKE '%"administrator"%', '["administrator"]', '["user"]') WHERE \`permissions\` NOT IN ('["administrator"]', '["user"]')`,
    ];
    for (const sql of migrations) {
      try {
        await db.execute(sql as unknown as Parameters<typeof db.execute>[0]);
      } catch { /* column already dropped or doesn't exist */ }
    }

    // Seed feature catalog from ASTRACLONE_FEATURE_CATALOG (once, if table is empty)
    if (process.env.ASTRACLONE_FEATURE_CATALOG) {
      const { feature_catalog } = await import("./lib/db/schema");
      const { sql: dsql } = await import("drizzle-orm");
      const [{ n }] = await db.select({ n: dsql<number>`COUNT(*)` }).from(feature_catalog);
      if (!Number(n)) {
        const names = process.env.ASTRACLONE_FEATURE_CATALOG.split(",").map((s: string) => s.trim()).filter(Boolean);
        if (names.length) await db.insert(feature_catalog).values(names.map(name => ({ name })));
        console.log(`Seeded ${names.length} features from ASTRACLONE_FEATURE_CATALOG`);
      }
    }

    // Seed plans from ASTRACLONE_PLANS (once, if plans table is empty)
    if (process.env.ASTRACLONE_PLANS) {
      try {
        const { plans: plansTable } = await import("./lib/db/schema");
        const { sql: dsql } = await import("drizzle-orm");
        const [{ n }] = await db.select({ n: dsql<number>`COUNT(*)` }).from(plansTable);
        if (!Number(n)) {
          type SeedPlan = { name: string; monthlyPrice?: number; yearlyPrice?: number; features?: string[] };
          const seedPlans: SeedPlan[] = JSON.parse(process.env.ASTRACLONE_PLANS);
          for (const p of seedPlans) {
            await db.insert(plansTable).values({
              name: p.name,
              monthlyPrice: p.monthlyPrice ?? 0,
              yearlyPrice: p.yearlyPrice ?? 0,
              features: JSON.stringify(Array.isArray(p.features) ? p.features : []),
            });
          }
          console.log(`Seeded ${seedPlans.length} plans from ASTRACLONE_PLANS`);
        }
      } catch { /* invalid JSON */ }
    }
  }

  const checks: { name: string; check: () => Promise<void> }[] = [];

  checks.push({
    name: "Database",
    check: async () => {
      const { db } = await import("./lib/db");
      await db.execute("SELECT 1" as unknown as Parameters<typeof db.execute>[0]);
    },
  });

  if (process.env.ASTRACLONE_SMTP_ENABLED === "true") {
    checks.push({
      name: "SMTP",
      check: async () => {
        const nodemailer = await import("nodemailer");
        const { getSetting } = await import("./lib/encryption");
        const host = await getSetting("smtp_host");
        if (!host) throw new Error("SMTP not configured");
        const t = nodemailer.default.createTransport({ host, port: 587 });
        await t.verify();
      },
    });
  }

  if (process.env.ASTRACLONE_ANTHROPIC_ENABLED === "true") {
    checks.push({
      name: "Anthropic",
      check: async () => {
        const { getSetting } = await import("./lib/encryption");
        const key = await getSetting("anthropic_apiKey");
        if (!key) throw new Error("Anthropic key not set");
      },
    });
  }

  if (process.env.ASTRACLONE_OPENAI_ENABLED === "true") {
    checks.push({
      name: "OpenAI",
      check: async () => {
        const { getSetting } = await import("./lib/encryption");
        const key = await getSetting("openai_apiKey");
        if (!key) throw new Error("OpenAI key not set");
      },
    });
  }

  if (process.env.ASTRACLONE_STRIPE_ENABLED === "true") {
    checks.push({
      name: "Stripe",
      check: async () => {
        const { getSetting } = await import("./lib/encryption");
        const key = await getSetting("stripe_secretKey");
        if (!key) throw new Error("Stripe key not set");
      },
    });
  }

  if (process.env.ASTRACLONE_M365_ENABLED === "true") {
    checks.push({
      name: "M365",
      check: async () => {
        const { getSetting } = await import("./lib/encryption");
        const clientId = await getSetting("m365_clientId");
        if (!clientId) throw new Error("M365 not configured");
      },
    });
  }

  {
    const { startSyncScheduler } = await import("./lib/sync-engine");
    await startSyncScheduler();
  }

  // Schedule daily M365 client secret expiry reminders
  {
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    async function checkM365Expiry() {
      try {
        const { getSetting, setSetting } = await import("./lib/encryption");
        const [expiryDate, reminderEmail, reminderDaysStr] = await Promise.all([
          getSetting("m365_expiryDate"),
          getSetting("m365_reminderEmail"),
          getSetting("m365_reminderDays"),
        ]);
        if (!expiryDate || !reminderEmail) return;

        const daysRemaining = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / MS_PER_DAY);
        const reminderDays = parseInt(reminderDaysStr ?? "30", 10);
        if (daysRemaining > reminderDays || daysRemaining < 0) return;

        const today = new Date().toISOString().slice(0, 10);
        const lastSent = await getSetting("m365_reminderLastSent");
        if (lastSent === today) return;

        const [smtpHost, smtpPort, smtpSsl, smtpUser, smtpPassword, fromName, fromEmail] = await Promise.all([
          getSetting("smtp_host"),
          getSetting("smtp_port"),
          getSetting("smtp_ssl"),
          getSetting("smtp_user"),
          getSetting("smtp_password"),
          getSetting("smtp_fromName"),
          getSetting("smtp_fromEmail"),
        ]);
        if (!smtpHost || !fromEmail) return;

        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.default.createTransport({
          host: smtpHost,
          port: Number(smtpPort ?? 587),
          secure: smtpSsl === "true",
          auth: smtpUser && smtpPassword ? { user: smtpUser, pass: smtpPassword } : undefined,
        });

        const { getPlatformInfo } = await import("./lib/platform");
        const platform = await getPlatformInfo();
        const dayLabel = `${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}`;

        await transporter.sendMail({
          from: `${fromName ?? platform.name} <${fromEmail}>`,
          to: reminderEmail,
          subject: `Action required: M365 client secret expires in ${dayLabel}`,
          text: [
            `Your Microsoft 365 client secret for ${platform.name} expires on ${expiryDate} (${dayLabel} remaining).`,
            "",
            "Please renew the secret in the Azure Portal and update it under Admin → Microsoft 365.",
            "",
            `Platform: ${platform.name}`,
            `Expiry date: ${expiryDate}`,
            `Days remaining: ${daysRemaining}`,
          ].join("\n"),
        });

        await setSetting("m365_reminderLastSent", today);
        console.log(`[M365] Expiry reminder sent to ${reminderEmail} (${dayLabel} remaining)`);
      } catch (err) {
        console.error("[M365] Failed to send expiry reminder:", err);
      }
    }

    setTimeout(checkM365Expiry, 60_000);
    setInterval(checkM365Expiry, MS_PER_DAY);
  }

  const results = await Promise.allSettled(
    checks.map(({ check }) => Promise.race([check(), new Promise<void>((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000))]))
  );

  const col1 = Math.max(...checks.map(c => c.name.length)) + 2;
  console.log("\n┌" + "─".repeat(col1 + 12) + "┐");
  console.log("│ Service" + " ".repeat(col1 - 7) + "Status     │");
  console.log("├" + "─".repeat(col1 + 12) + "┤");
  checks.forEach(({ name }, i) => {
    const ok = results[i].status === "fulfilled";
    const status = ok ? "✅ OK      " : "❌ FAIL    ";
    console.log(`│ ${name.padEnd(col1)}${status}│`);
  });
  console.log("└" + "─".repeat(col1 + 12) + "┘\n");
}
