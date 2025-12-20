-- Create categories table for job types (DM JOBS, VOIDS, FANS, etc.)
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#3B82F6',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add category_id to jobs table
ALTER TABLE public.jobs ADD COLUMN category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;

-- Insert default categories
INSERT INTO public.categories (name, slug, color, sort_order) VALUES
  ('DM Jobs', 'dm-jobs', '#F97316', 0),
  ('Voids', 'voids', '#3B82F6', 1),
  ('Fans', 'fans', '#10B981', 2),
  ('Insulation', 'insulation', '#8B5CF6', 3),
  ('Bannisters', 'bannisters', '#EC4899', 4);

-- Assign existing jobs to DM Jobs category
UPDATE public.jobs SET category_id = (SELECT id FROM public.categories WHERE slug = 'dm-jobs');

-- Create index for faster category filtering
CREATE INDEX idx_jobs_category_id ON public.jobs(category_id);

-- Disable RLS on categories (public data)
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Allow all operations on categories (public table)
CREATE POLICY "Categories are viewable by everyone" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Categories can be created by anyone" ON public.categories FOR INSERT WITH CHECK (true);
CREATE POLICY "Categories can be updated by anyone" ON public.categories FOR UPDATE USING (true);
CREATE POLICY "Categories can be deleted by anyone" ON public.categories FOR DELETE USING (true);