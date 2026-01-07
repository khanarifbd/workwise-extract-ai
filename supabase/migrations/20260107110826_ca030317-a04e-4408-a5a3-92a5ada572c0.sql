-- Add is_flexible_booking column to jobs table
ALTER TABLE public.jobs 
ADD COLUMN is_flexible_booking boolean NOT NULL DEFAULT false;