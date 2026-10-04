create table if not exists profiles (
  user_id text primary key references "user" (id) on delete cascade,
  name text not null,
  preferred_name text not null,
  style text not null default 'calm',
  appearance text not null default 'grove',
  default_model_id text not null default 'xai/grok-4.3',
  role text not null default 'user',
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_role_check check (role in ('user', 'admin'))
);

create table if not exists providers (
  id text primary key,
  name text not null,
  auth_kind text not null,
  base_url text,
  enabled boolean not null default true
);

create table if not exists models (
  id text primary key,
  provider_id text not null references providers (id),
  api_model text not null,
  name text not null,
  description text not null,
  capabilities text not null,
  context_tokens integer not null,
  context_label text not null,
  vision boolean not null default false,
  tools boolean not null default false,
  status text not null,
  enabled boolean not null default true
);

create table if not exists projects (
  id text primary key,
  user_id text not null references "user" (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists conversations (
  id text primary key,
  user_id text not null references "user" (id) on delete cascade,
  project_id text references projects (id) on delete set null,
  title text not null,
  model_id text not null,
  pinned boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id text primary key,
  conversation_id text not null references conversations (id) on delete cascade,
  user_id text not null references "user" (id) on delete cascade,
  role text not null,
  content text not null,
  model_id text,
  created_at timestamptz not null default now(),
  constraint messages_role_check check (role in ('user', 'assistant', 'system'))
);

create table if not exists user_provider_credentials (
  user_id text not null references "user" (id) on delete cascade,
  provider_id text not null references providers (id),
  ciphertext text not null,
  hint text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, provider_id)
);

create table if not exists files (
  id text primary key,
  user_id text not null references "user" (id) on delete cascade,
  name text not null,
  mime text not null,
  size_bytes integer not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists agent_runs (
  id text primary key,
  user_id text not null references "user" (id) on delete cascade,
  conversation_id text references conversations (id) on delete set null,
  goal text not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_steps (
  id text primary key,
  run_id text not null references agent_runs (id) on delete cascade,
  user_id text not null references "user" (id) on delete cascade,
  kind text not null,
  detail text not null,
  created_at timestamptz not null default now()
);

create table if not exists approvals (
  id text primary key,
  user_id text not null references "user" (id) on delete cascade,
  run_id text not null references agent_runs (id) on delete cascade,
  tool_id text not null,
  payload text not null,
  status text not null,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id text primary key,
  user_id text not null references "user" (id) on delete cascade,
  kind text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists usage_records (
  id text primary key,
  user_id text not null references "user" (id) on delete cascade,
  model_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists security_events (
  id text primary key,
  user_id text not null references "user" (id) on delete cascade,
  kind text not null,
  detail text not null,
  created_at timestamptz not null default now()
);

create table if not exists feature_flags (
  key text primary key,
  enabled boolean not null,
  updated_at timestamptz not null default now()
);

create table if not exists tool_definitions (
  id text primary key,
  name text not null,
  description text not null,
  risk text not null,
  enabled boolean not null default true
);

create index if not exists conversations_user_updated_idx on conversations (user_id, updated_at desc);
create index if not exists messages_conversation_idx on messages (conversation_id, created_at);
create index if not exists messages_user_idx on messages (user_id);
create index if not exists projects_user_idx on projects (user_id);
create index if not exists files_user_idx on files (user_id, created_at desc);
create index if not exists usage_user_time_idx on usage_records (user_id, created_at desc);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);
create index if not exists models_provider_idx on models (provider_id);

insert into providers (id, name, auth_kind, base_url) values
  ('xai', 'xAI', 'platform', 'https://api.x.ai/v1'),
  ('openai', 'OpenAI', 'user-key', 'https://api.openai.com/v1'),
  ('anthropic', 'Anthropic', 'user-key', null),
  ('google', 'Google Gemini', 'user-key', null),
  ('deepseek', 'DeepSeek', 'user-key', 'https://api.deepseek.com'),
  ('longcat', 'LongCat', 'user-key', 'https://api.longcat.chat/openai/v1')
on conflict (id) do nothing;

insert into models (id, provider_id, api_model, name, description, capabilities, context_tokens, context_label, vision, tools, status) values
  ('xai/grok-4.3', 'xai', 'grok-4.3', 'Grok 4.3', 'Balanced for everyday asks.', 'coding,tools,vision', 1000000, '1M', true, true, 'available'),
  ('xai/grok-build', 'xai', 'grok-build-0.1', 'Grok Build', 'Quicker, lighter replies.', 'fast,coding,tools', 256000, '256K', false, true, 'available'),
  ('xai/grok-4.7', 'xai', 'grok-4.7', 'Grok 4.7', 'Slower, more careful thinking.', 'reasoning,vision,coding,tools', 500000, '500K', true, true, 'available'),
  ('xai/grok-4.20', 'xai', 'grok-4.20-0309-reasoning', 'Grok 4.20', 'A long reasoning pass when the ask is thorny.', 'reasoning,vision,tools', 1000000, '1M', true, true, 'available'),
  ('openai/gpt-4.1', 'openai', 'gpt-4.1', 'GPT-4.1', 'A strong general model for writing and tools.', 'coding,vision,tools', 1000000, '1M', true, true, 'available'),
  ('openai/gpt-4.1-mini', 'openai', 'gpt-4.1-mini', 'GPT-4.1 mini', 'A quicker OpenAI model for short asks.', 'fast,vision,tools', 1000000, '1M', true, true, 'available'),
  ('openai/o3', 'openai', 'o3', 'o3', 'Built for careful, step-by-step reasoning.', 'reasoning,tools', 200000, '200K', false, true, 'available'),
  ('anthropic/claude-sonnet-4', 'anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet 4', 'Balanced Claude for most day-to-day work.', 'coding,vision,tools', 200000, '200K', true, true, 'available'),
  ('anthropic/claude-haiku', 'anthropic', 'claude-3-5-haiku-latest', 'Claude Haiku', 'Short, quick replies.', 'fast,vision,tools', 200000, '200K', true, true, 'available'),
  ('google/gemini-2.5-flash', 'google', 'gemini-2.5-flash', 'Gemini 2.5 Flash', 'A fast Gemini for everyday questions.', 'fast,vision,tools', 1000000, '1M', true, true, 'available'),
  ('google/gemini-2.5-pro', 'google', 'gemini-2.5-pro', 'Gemini 2.5 Pro', 'A long-context Gemini for harder asks.', 'reasoning,vision,coding,tools', 1000000, '1M', true, true, 'available'),
  ('deepseek/v3.2', 'deepseek', 'deepseek-chat', 'DeepSeek Chat', 'A strong coding and general model.', 'coding,tools', 128000, '128K', false, true, 'available'),
  ('deepseek/reasoner', 'deepseek', 'deepseek-reasoner', 'DeepSeek Reasoner', 'A deeper reasoning pass from DeepSeek.', 'reasoning,coding', 128000, '128K', false, false, 'available'),
  ('longcat/2.0', 'longcat', 'LongCat-2.0', 'LongCat 2.0', 'LongCat’s main chat model.', 'coding,tools', 1000000, '1M', false, true, 'available')
on conflict (id) do nothing;

insert into tool_definitions (id, name, description, risk) values
  ('clock', 'Clock', 'Read the current time.', 'read'),
  ('list_projects', 'List projects', 'List this account’s projects.', 'read'),
  ('create_project', 'Create project', 'Create a project. Needs your approval.', 'create')
on conflict (id) do nothing;

insert into feature_flags (key, enabled) values
  ('agent_mode', true),
  ('file_upload', true)
on conflict (key) do nothing;
