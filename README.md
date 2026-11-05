# Rules Registry demo

A small sentence builder where **the database holds the rules**. You answer a few questions (weather, activity, footwear, what you're bringing), and the page only offers the answers that make sense given your earlier ones. Your choices turn into a sentence such as:

> It's rainy, so I'm wearing boots and bringing an umbrella.

Nothing about weather or boots is written into the page code. The questions, the answer options, the "only show this when…" rules and the sentence order are all rows in Postgres. The database rejects bad rules, and automated tests check that it does.

All data is made up and harmless (weather, footwear, activities).

- **Live:** https://rules-registry-demo.vercel.app
- **Stack:** Next.js on Vercel, Postgres on Neon, plain SQL migrations, Vitest tests run against a real Postgres in GitHub Actions.

---

## How it works in one minute

1. The page asks the database: "Given these answers, which options may appear?"
2. A function inside Postgres (`allowed_options`) answers. The page shows exactly that list and nothing else.
3. When you change an early answer, later answers that no longer fit are dropped. For example, picking Rainy after Sandals removes Sandals.
4. When you save, the server checks every answer again (`validate_selections`). If someone bypasses the page and sends "rainy + sandals" directly, they get a clear error and nothing is saved.
5. The sentence is put together by a short function that only follows the data: the order of the parts, the joining words and each option's fragment.

---

## The tables, in plain language

| Table | What it means | Example row |
|---|---|---|
| `variables` | The questions, in the order they are asked (`sort_order`, 0 = first). | `weather` – "What's the weather?" – 0 |
| `options` | The possible answers to each question, plus the words each one adds to the sentence (`sentence_fragment`). | `footwear` → `sandals`, "Sandals", "wearing sandals" |
| `option_conditions` | "This option may only appear when that option is selected." | Sandals → requires weather = Sunny |
| `sentence_parts` | Which question goes where in the sentence. `lead` opens it ("It's rainy"); `item` parts follow as a list ("wearing boots and bringing an umbrella"). | weather – position 0 – lead |
| `sentence_settings` | The joining words: ", so I'm ", ", ", " and ", "." (one row only). | |
| `submissions` | Saved sentences. Only written after every answer has been checked. | |

**How several conditions combine.** If an option has two conditions on the *same* question, either one is enough. Scarf appears when the weather is Snowy **or** Windy. Conditions on *different* questions must all be met (**and**).

### Rules the database enforces on itself

Each rule has a name, so an error tells you exactly which one was broken:

| Rule (constraint name) | What it stops |
|---|---|
| `options_fragment_not_empty` | An option with blank sentence words |
| `options_key_unique_per_variable` | Two options with the same key under one question |
| `variables_sort_order_min`, `options_sort_order_min`, `sentence_parts_position_min` | Order numbers below zero |
| `option_conditions_not_self_variable` | A condition pointing at its own question ("boots requires sandals") |
| `option_conditions_required_earlier` | A condition pointing at a question that comes **later** in the flow (and re-ordering questions so that happens) |
| `options_variable_fk`, `option_conditions_option_fk`, `option_conditions_required_fk` | Rows that point at a question or option that doesn't exist |
| `option_conditions_unique` | The same condition entered twice |
| `sentence_parts_role_valid`, `sentence_settings_single_row` | Unknown sentence roles, a second settings row |

Every rule in this table has at least one automated test. The database has 10 more named rules that don't have a test yet. They're listed under [What each test proves](#what-each-test-proves).

---

## How to change the rules

Rule changes are written as a new numbered SQL file in `db/migrations/` (for example `004_add_wellies.sql`). Files run once, in number order, so every database ends up identical. Then run `npm run db:migrate`.

**Add a new option** (e.g. Wellies under footwear):

```sql
insert into options (variable_id, key, label, sentence_fragment, sort_order)
select id, 'wellies', 'Wellies', 'wearing wellies', 4 from variables where key = 'footwear';
```

**Add a condition** (Wellies only when it's rainy):

```sql
insert into option_conditions (option_id, required_option_id)
select o.id, r.id
  from options o join variables ov on ov.id = o.variable_id and ov.key = 'footwear' and o.key = 'wellies'
  cross join options r join variables rv on rv.id = r.variable_id and rv.key = 'weather' and r.key = 'rainy';
```

**Add a new question** (e.g. "How are you getting there?"):

```sql
insert into variables (key, label, sort_order) values ('transport', 'How are you getting there?', 4);
insert into options (variable_id, key, label, sentence_fragment, sort_order)
select id, 'bus', 'Bus', 'taking the bus', 0 from variables where key = 'transport';
insert into sentence_parts (variable_id, position, role)
select id, 4, 'item' from variables where key = 'transport';
```

The page picks up all three changes automatically. No page code changes. If a row breaks a rule (blank words, a condition on a later question…), the database refuses it and names the rule.

---

## Run it yourself

You need Node 22 and a local Postgres.

```bash
npm install
createdb rr_dev
DATABASE_URL=postgres://localhost:5432/rr_dev npm run db:migrate
DATABASE_URL=postgres://localhost:5432/rr_dev npm run dev     # http://localhost:3000
```

## Run the tests

```bash
createdb rr_test          # once
npm test
```

The tests wipe and rebuild the `rr_test` database from the migrations each run. To use a different database, set `TEST_DATABASE_URL`. GitHub Actions runs the same tests against a fresh Postgres 16 on every pull request and every push to main.

### What each test proves

**`tests/engine.test.ts`: options whose rules aren't met never appear, and can't be forced through**
- With nothing selected, only options with no rules (Trainers) show. With Rainy, Sandals and Sun hat are never returned, while Boots and Umbrella are.
- "Either one" rules work: Scarf shows for Snowy or Windy, not Rainy.
- Rules can depend on any earlier question, not just the first one (Hiking boots need Hiking).
- Changing an early answer drops later answers that no longer fit, and they disappear from the sentence.
- Sending Rainy + Sandals straight to the save API gets a 422 error: *footwear: "sandals" is not allowed with the current answers. It requires weather = sunny.* No row is saved and no saved sentence contains "sandals".
- Unknown answers, malformed requests and a missing first answer are also refused.
- The live-preview API never returns or composes a disallowed option, even if one is sent to it.
- A valid set of answers is saved with exactly the sentence shown.

**`tests/constraints.test.ts`: 13 of the database's 23 named rules are tested.** Each test tries one invalid change and checks the database refused it *with that specific rule's name*. It also checks that a condition's question can't be faked by editing it directly.

- **Tested (13):** every rule in the table above, which is `options_fragment_not_empty`, `options_key_unique_per_variable`, `variables_sort_order_min`, `options_sort_order_min`, `sentence_parts_position_min`, `option_conditions_not_self_variable`, `option_conditions_required_earlier`, `options_variable_fk`, `option_conditions_option_fk`, `option_conditions_required_fk`, `option_conditions_unique`, `sentence_parts_role_valid` and `sentence_settings_single_row`.
- **Not tested yet (10):** `variables_key_unique`, `variables_key_format`, `variables_label_not_empty`, `variables_sort_order_unique`, `options_key_format`, `options_label_not_empty`, `options_id_variable_unique`, `sentence_parts_variable_fk`, `sentence_parts_position_unique` and `submissions_sentence_not_empty`. These rules are active in the database, but no automated test proves it.
- **Partly tested:** `option_conditions_required_earlier` is tested when a condition is added and when questions are re-ordered. Editing an existing condition so it points at a later question isn't tested.

**`tests/compose.test.ts`: sentences come out exactly as expected.** Six answer combinations are checked word for word against the real database. The pure function is also shown to follow the stored order rather than input order, to be deterministic, and to change its output when only the data changes.

---

## Where things live

```
db/migrations/001_registry.sql   tables, constraints, triggers
db/migrations/002_engine.sql     the engine: allowed_options, resolve_selections, validate_selections
db/migrations/003_seed_weather.sql  the demo questions, options and rules
src/lib/compose.ts               turns fragments into a sentence (data-driven, no rules)
src/lib/engine.ts                calls the SQL engine; no rule logic
src/app/                         the page and the two API routes
tests/                           the Vitest suite
```

---

Demo by [DC Tech](https://dctechltd.com).
