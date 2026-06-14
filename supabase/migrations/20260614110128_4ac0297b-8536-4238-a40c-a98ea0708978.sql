
DELETE FROM public.sor_code_entries WHERE category = 'From Jobs';

UPDATE public.sor_code_books b
SET code_count = (SELECT COUNT(*) FROM public.sor_code_entries e WHERE e.book_id = b.id)
WHERE b.id = '11111111-1111-1111-1111-111111111111';
