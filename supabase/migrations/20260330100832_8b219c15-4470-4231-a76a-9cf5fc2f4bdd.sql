INSERT INTO public.user_roles (user_id, role)
VALUES ('4bbd5402-d9e0-4313-87f7-78219ff66750', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;