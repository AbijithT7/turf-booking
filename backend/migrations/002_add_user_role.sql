-- 002_add_user_role.sql
-- Add role column to Users if not present
-- Allowed roles: 'user', 'admin'
ALTER TABLE Users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
