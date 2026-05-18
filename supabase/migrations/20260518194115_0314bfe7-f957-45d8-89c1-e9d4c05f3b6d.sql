
-- 1. Trigger para asignar admin al primer usuario
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.user_roles) then
    insert into public.user_roles(user_id, role) values (new.id, 'admin');
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 2. Vinculación operador <-> usuario
alter table public.operadores
  add column if not exists user_id uuid unique references auth.users(id) on delete set null;

create index if not exists operadores_user_id_idx on public.operadores(user_id);

-- 3. Seed config_empresa
insert into public.config_empresa (nombre)
select 'Mi Empresa de Grúas'
where not exists (select 1 from public.config_empresa);
