-- 003: synthetic demo data (weather, activity, footwear, carry). No real-world content.

insert into variables (key, label, sort_order) values
  ('weather',  'What''s the weather?',      0),
  ('activity', 'What are you doing?',       1),
  ('footwear', 'What are you wearing?',     2),
  ('carry',    'What are you bringing?',    3);

insert into options (variable_id, key, label, sentence_fragment, sort_order)
select v.id, o.key, o.label, o.fragment, o.sort_order
  from (values
    ('weather',  'sunny',    'Sunny',          'it''s sunny',             0),
    ('weather',  'rainy',    'Rainy',          'it''s rainy',             1),
    ('weather',  'snowy',    'Snowy',          'it''s snowing',           2),
    ('weather',  'windy',    'Windy',          'it''s windy',             3),
    ('activity', 'beach',    'Beach day',      'heading to the beach',    0),
    ('activity', 'hiking',   'Hiking',         'going hiking',            1),
    ('activity', 'commute',  'Commuting',      'commuting to work',       2),
    ('activity', 'snowman',  'Building a snowman', 'building a snowman',  3),
    ('footwear', 'sandals',  'Sandals',        'wearing sandals',         0),
    ('footwear', 'trainers', 'Trainers',       'wearing trainers',        1),
    ('footwear', 'boots',    'Boots',          'wearing boots',           2),
    ('footwear', 'hiking_boots', 'Hiking boots', 'wearing hiking boots',  3),
    ('carry',    'umbrella', 'Umbrella',       'bringing an umbrella',    0),
    ('carry',    'sun_hat',  'Sun hat',        'bringing a sun hat',      1),
    ('carry',    'scarf',    'Scarf',          'bringing a scarf',        2),
    ('carry',    'water',    'Water bottle',   'bringing a water bottle', 3)
  ) as o(variable_key, key, label, fragment, sort_order)
  join variables v on v.key = o.variable_key;

-- (option) requires (required option). Same required variable = OR, different = AND.
insert into option_conditions (option_id, required_option_id)
select opt.id, req.id
  from (values
    ('activity', 'beach',        'weather',  'sunny'),
    ('activity', 'snowman',      'weather',  'snowy'),
    ('footwear', 'sandals',      'weather',  'sunny'),
    ('footwear', 'boots',        'weather',  'rainy'),
    ('footwear', 'boots',        'weather',  'snowy'),
    ('footwear', 'hiking_boots', 'activity', 'hiking'),
    ('carry',    'umbrella',     'weather',  'rainy'),
    ('carry',    'sun_hat',      'weather',  'sunny'),
    ('carry',    'scarf',        'weather',  'snowy'),
    ('carry',    'scarf',        'weather',  'windy'),
    ('carry',    'water',        'activity', 'hiking'),
    ('carry',    'water',        'activity', 'beach')
  ) as c(var_key, opt_key, req_var_key, req_opt_key)
  join variables ov on ov.key = c.var_key
  join options opt on opt.variable_id = ov.id and opt.key = c.opt_key
  join variables rv on rv.key = c.req_var_key
  join options req on req.variable_id = rv.id and req.key = c.req_opt_key;

-- Sentence: "<weather>, so I'm <activity>, <footwear> and <carry>."
insert into sentence_parts (variable_id, position, role)
select v.id, p.position, p.role
  from (values ('weather', 0, 'lead'), ('activity', 1, 'item'), ('footwear', 2, 'item'), ('carry', 3, 'item'))
       as p(variable_key, position, role)
  join variables v on v.key = p.variable_key;

insert into sentence_settings (connector, list_separator, last_separator, terminator)
values (', so I''m ', ', ', ' and ', '.');
