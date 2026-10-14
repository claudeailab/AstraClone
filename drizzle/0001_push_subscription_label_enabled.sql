ALTER TABLE `astraclone_push_subscriptions` ADD COLUMN `label` varchar(255);
ALTER TABLE `astraclone_push_subscriptions` ADD COLUMN `enabled` boolean NOT NULL DEFAULT true;
