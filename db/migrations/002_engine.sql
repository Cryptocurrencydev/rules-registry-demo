-- 002: the engine. All rule logic lives here; the app only renders what these return.

-- Is this option allowed, given a set of selected option ids?
-- For every variable the option has conditions on, at least one of that variable's
-- required options must be selected.
create function option_is_allowed(p_option_id bigint, p_selected bigint[])
returns boolean
language sql stable as $$
  select not exists (
    select 1
      from option_conditions c
     where c.option_id = p_option_id
     group by c.required_variable_id
    having not bool_or(c.required_option_id = any (coalesce(p_selected, '{}')))
  )
$$;

-- Walk the flow in order and keep only selections that are still allowed by the ones
-- kept before them. Changing an early answer therefore drops later answers that no longer fit.
create function resolve_selections(p_selected bigint[])
returns bigint[]
language plpgsql stable as $$
declare
  kept bigint[] := '{}';
  v record;
  pick bigint;
begin
  for v in select id from variables order by sort_order loop
    select o.id into pick
      from options o
     where o.variable_id = v.id and o.id = any (coalesce(p_selected, '{}'))
     order by o.sort_order, o.id
     limit 1;
    if pick is not null and option_is_allowed(pick, kept) then
      kept := kept || pick;
    end if;
  end loop;
  return kept;
end $$;

-- The options the UI may show for the current selections (and which of them are selected).
create function allowed_options(p_selected bigint[])
returns table (
  variable_id bigint, variable_key text, variable_label text, variable_sort integer,
  option_id bigint, option_key text, option_label text, sentence_fragment text, option_sort integer,
  selected boolean
)
language sql stable as $$
  with kept as (select resolve_selections(p_selected) as ids)
  select v.id, v.key, v.label, v.sort_order,
         o.id, o.key, o.label, o.sentence_fragment, o.sort_order,
         o.id = any (kept.ids)
    from variables v
    join options o on o.variable_id = v.id
   cross join kept
   where option_is_allowed(o.id, kept.ids)
   order by v.sort_order, o.sort_order, o.id
$$;

-- Turn {"weather": "rainy", ...} into option ids. Unknown keys are refused.
create function selection_ids(p jsonb)
returns bigint[]
language plpgsql stable as $$
declare
  ids bigint[] := '{}';
  pair record;
  found bigint;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'selections must be an object of {variable: option}'
      using errcode = '22023';
  end if;
  for pair in select key, value from jsonb_each(p) loop
    if jsonb_typeof(pair.value) <> 'string' then
      raise exception 'selection for "%" must be a single option key', pair.key
        using errcode = '22023';
    end if;
    select o.id into found
      from options o join variables v on v.id = o.variable_id
     where v.key = pair.key and o.key = pair.value #>> '{}';
    if found is null then
      raise exception 'unknown option "%" for "%"', pair.value #>> '{}', pair.key
        using errcode = '22023';
    end if;
    ids := ids || found;
  end loop;
  return ids;
end $$;

-- Refuse any selection set the engine would not have offered. Used on every submit.
create function validate_selections(p_selected bigint[])
returns void
language plpgsql stable as $$
declare
  kept bigint[] := resolve_selections(p_selected);
  bad record;
  needs text;
begin
  if exists (
    select 1 from options o where o.id = any (p_selected)
     group by o.variable_id having count(*) > 1
  ) then
    raise exception 'only one option per question may be selected' using errcode = '22023';
  end if;

  select o.id, o.key as option_key, v.key as variable_key into bad
    from options o join variables v on v.id = o.variable_id
   where o.id = any (p_selected) and not (o.id = any (kept))
   order by v.sort_order
   limit 1;

  if found then
    select string_agg(rv.key || ' = ' || ro.key, ' or ' order by rv.sort_order, ro.sort_order) into needs
      from option_conditions c
      join options ro on ro.id = c.required_option_id
      join variables rv on rv.id = c.required_variable_id
     where c.option_id = bad.id;
    raise exception '%: "%" is not allowed with the current answers', bad.variable_key, bad.option_key
      using errcode = '22023', detail = 'It requires ' || coalesce(needs, 'nothing') || '.';
  end if;
end $$;
