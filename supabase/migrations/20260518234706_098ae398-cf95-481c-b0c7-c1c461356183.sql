ALTER TABLE public.roadmap_items
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.roadmap_items(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS collapsed boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_roadmap_items_parent ON public.roadmap_items(parent_id);