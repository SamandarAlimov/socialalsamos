
-- Alsamos extension schema hardening v9
-- Supabase recommends relocatable extensions outside the exposed public schema.

create schema if not exists extensions;
alter extension citext set schema extensions;

notify pgrst,'reload schema';
