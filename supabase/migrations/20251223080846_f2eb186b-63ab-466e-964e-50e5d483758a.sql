-- Add booking_notes column to jobs table for tenant interaction notes
ALTER TABLE public.jobs 
ADD COLUMN booking_notes text;