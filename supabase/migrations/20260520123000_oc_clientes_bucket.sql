-- Bucket para PDFs de OC de clientes
-- Nota: requiere privilegios en Supabase para crear buckets.

insert into storage.buckets (id, name, public)
values ('oc-clientes', 'oc-clientes', true)
on conflict (id) do nothing;
