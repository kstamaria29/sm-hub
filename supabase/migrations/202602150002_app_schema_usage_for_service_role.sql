-- v1.3: allow service-role wrappers in public schema to call app.* RPC functions.

grant usage on schema app to service_role;

notify pgrst, 'reload schema';
