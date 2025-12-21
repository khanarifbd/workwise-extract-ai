-- Create geocode cache table
CREATE TABLE public.geocode_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  address_hash text NOT NULL UNIQUE,
  address text NOT NULL,
  lat double precision,
  lng double precision,
  geocode_error boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY;

-- Public read access for geocode cache (no sensitive data)
CREATE POLICY "Geocode cache is publicly readable" 
ON public.geocode_cache 
FOR SELECT 
USING (true);

-- Only admins can manage cache
CREATE POLICY "Admins can manage geocode cache" 
ON public.geocode_cache 
FOR ALL 
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

-- Allow edge functions to insert/update via service role
CREATE POLICY "Service role can manage geocode cache" 
ON public.geocode_cache 
FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Index for fast lookups
CREATE INDEX idx_geocode_cache_address_hash ON public.geocode_cache(address_hash);

-- Update trigger
CREATE TRIGGER update_geocode_cache_updated_at
BEFORE UPDATE ON public.geocode_cache
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();