-- Add 'tester' to app_role enum (read-only preview testers)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'tester';