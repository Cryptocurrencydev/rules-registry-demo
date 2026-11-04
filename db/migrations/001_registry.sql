-- 001: the registry tables and the constraints that keep them valid.
-- Every constraint has an explicit name so errors (and tests) can say exactly which rule was broken.

-- A question in the flow. sort_order is the flow position: lower = asked earlier.
create table variables (
  id          bigint generated always as identity primary key,
  key         text not null,
  label       text not null,
  sort_order  integer not null,
  constraint variables_key_unique        unique (key),
  constraint variables_key_format        check (key ~ '^[a-z][a-z0-9_]*$'),
  constraint variables_label_not_empty   check (btrim(label) <> ''),
  constraint variables_sort_order_min    check (sort_order >= 0),
  constraint variables_sort_order_unique unique (sort_order)
);

-- An answer option for one variable, with the words it contributes to the sentence.
create table options (
  id                bigint generated always as identity primary key,
  variable_id       bigint not null,
  key               text not null,
  label             text not null,
  sentence_fragment text not null,
  sort_order        integer not null,
  constraint options_variable_fk             foreign key (variable_id) references variables (id) on delete cascade,
  constraint options_key_unique_per_variable unique (variable_id, key),
  constraint options_key_format              check (key ~ '^[a-z][a-z0-9_]*$'),
  constraint options_label_not_empty         check (btrim(label) <> ''),
  constraint options_fragment_not_empty      check (btrim(sentence_fragment) <> ''),
  constraint options_sort_order_min          check (sort_order >= 0),
  -- lets option_conditions reference (option, its variable) as a pair
  constraint options_id_variable_unique      unique (id, variable_id)
);

-- "option_id may only appear when required_option_id is selected."
-- Several conditions on the same option:
--   * pointing at options of the SAME required variable  -> any one of them is enough (OR)
--   * pointing at DIFFERENT required variables            -> all of them must be met (AND)
-- The two *_variable_id columns are filled in automatically by a trigger; the composite
-- foreign keys guarantee they always match the real variable of each option.
create table option_conditions (
  id                   bigint generated always as identity primary key,
  option_id            bigint not null,
  option_variable_id   bigint not null,
  required_option_id   bigint not null,
  required_variable_id bigint not null,
  constraint option_conditions_option_fk   foreign key (option_id, option_variable_id)
    references options (id, variable_id) on delete cascade,
  constraint option_conditions_required_fk foreign key (required_option_id, required_variable_id)
    references options (id, variable_id) on delete cascade,
  constraint option_conditions_not_self_variable check (option_variable_id <> required_variable_id),
  constraint option_conditions_unique unique (option_id, required_option_id)
);

-- Fill in the variable ids, then enforce: a condition may only point at a variable that is
-- EARLIER in the flow (lower sort_order). Same-variable rows are left for the check constraint
-- above so they fail with its name.
create function option_conditions_before_write() returns trigger
language plpgsql as $$
declare
  own_order integer;
  req_order integer;
begin
  select o.variable_id, v.sort_order into new.option_variable_id, own_order
    from options o join variables v on v.id = o.variable_id where o.id = new.option_id;
  select o.variable_id, v.sort_order into new.required_variable_id, req_order
    from options o join variables v on v.id = o.variable_id where o.id = new.required_option_id;

  -- name the foreign key a missing option breaks (instead of a not-null error on the filled column)
  if own_order is null then
    raise exception 'option % does not exist', new.option_id
      using errcode = '23503', constraint = 'option_conditions_option_fk', table = 'option_conditions';
  end if;
  if req_order is null then
    raise exception 'required option % does not exist', new.required_option_id
      using errcode = '23503', constraint = 'option_conditions_required_fk', table = 'option_conditions';
  end if;

  if new.option_variable_id is distinct from new.required_variable_id
     and req_order >= own_order then
    raise exception 'condition on option % points at option %, whose question is not earlier in the flow',
      new.option_id, new.required_option_id
      using errcode = '23514', constraint = 'option_conditions_required_earlier',
            table = 'option_conditions';
  end if;
  return new;
end $$;

create trigger option_conditions_before_write
  before insert or update on option_conditions
  for each row execute function option_conditions_before_write();

-- Re-ordering questions must not break an existing condition either.
create function variables_check_reorder() returns trigger
language plpgsql as $$
begin
  if exists (
    select 1
      from option_conditions c
      join variables own on own.id = c.option_variable_id
      join variables req on req.id = c.required_variable_id
     where req.sort_order >= own.sort_order
  ) then
    raise exception 'reordering variables would leave a condition pointing at a later question'
      using errcode = '23514', constraint = 'option_conditions_required_earlier',
            table = 'variables';
  end if;
  return null;
end $$;

create trigger variables_check_reorder
  after update of sort_order on variables
  for each statement execute function variables_check_reorder();

-- How selected fragments compose into a sentence.
-- Parts are used in `position` order. 'lead' parts open the sentence; 'item' parts follow the
-- connector as a list ("a, b and c").
create table sentence_parts (
  variable_id bigint primary key,
  position    integer not null,
  role        text not null,
  constraint sentence_parts_variable_fk    foreign key (variable_id) references variables (id) on delete cascade,
  constraint sentence_parts_position_min   check (position >= 0),
  constraint sentence_parts_position_unique unique (position),
  constraint sentence_parts_role_valid     check (role in ('lead', 'item'))
);

-- The glue words, kept in data too. Exactly one row.
create table sentence_settings (
  id              boolean primary key default true,
  connector       text not null,
  list_separator  text not null,
  last_separator  text not null,
  terminator      text not null,
  constraint sentence_settings_single_row check (id)
);

-- Saved sentences. Only written after the engine has validated every selection.
create table submissions (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  option_ids bigint[] not null,
  sentence   text not null,
  constraint submissions_sentence_not_empty check (btrim(sentence) <> '')
);
