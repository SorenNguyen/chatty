-- pg_dump restores with an empty search_path. Keep both the function and its
-- dictionary schema-qualified so recreating Message.searchVector does not
-- depend on the restore session's search path.
CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
