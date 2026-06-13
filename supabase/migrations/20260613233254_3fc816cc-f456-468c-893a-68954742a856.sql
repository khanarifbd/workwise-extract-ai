
CREATE TABLE public.sor_code_books (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  status TEXT NOT NULL DEFAULT 'pending',
  code_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sor_code_books TO authenticated;
GRANT ALL ON public.sor_code_books TO service_role;
ALTER TABLE public.sor_code_books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage SOR code books"
  ON public.sor_code_books FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER set_sor_code_books_updated_at
  BEFORE UPDATE ON public.sor_code_books
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.sor_code_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  book_id UUID NOT NULL REFERENCES public.sor_code_books(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit TEXT,
  keywords TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sor_code_entries_book_id_idx ON public.sor_code_entries(book_id);
CREATE INDEX sor_code_entries_code_idx ON public.sor_code_entries(code);
CREATE INDEX sor_code_entries_category_idx ON public.sor_code_entries(category);

GRANT SELECT ON public.sor_code_entries TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.sor_code_entries TO authenticated;
GRANT ALL ON public.sor_code_entries TO service_role;
ALTER TABLE public.sor_code_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read SOR codes"
  ON public.sor_code_entries FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins manage SOR codes"
  ON public.sor_code_entries FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Storage policies for sor-code-books bucket
CREATE POLICY "Admins read SOR books storage"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'sor-code-books' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins upload SOR books storage"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'sor-code-books' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins update SOR books storage"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'sor-code-books' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins delete SOR books storage"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'sor-code-books' AND public.is_admin(auth.uid()));
