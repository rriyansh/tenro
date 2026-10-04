create table if not exists user_settings (
  user_id text primary key references "user" (id) on delete cascade,
  username text,
  avatar_id text not null default 'mark',
  language text not null default 'en',
  timezone text not null default 'UTC',
  theme text not null default 'system',
  density text not null default 'comfortable',
  font_scale text not null default 'md',
  motion text not null default 'system',
  contrast text not null default 'default',
  response_length text not null default 'normal',
  streaming boolean not null default true,
  confirm_tools boolean not null default true,
  confirm_delete boolean not null default true,
  markdown boolean not null default true,
  auto_title boolean not null default true,
  memory_enabled boolean not null default false,
  notify_in_app boolean not null default true,
  notify_agent boolean not null default true,
  notify_security boolean not null default true,
  notify_account boolean not null default true,
  notify_provider boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint user_settings_theme_check check (theme in ('system', 'dark', 'light')),
  constraint user_settings_density_check check (density in ('comfortable', 'compact')),
  constraint user_settings_font_check check (font_scale in ('sm', 'md', 'lg')),
  constraint user_settings_motion_check check (motion in ('system', 'full', 'reduce')),
  constraint user_settings_contrast_check check (contrast in ('default', 'high')),
  constraint user_settings_length_check check (response_length in ('short', 'normal', 'long')),
  constraint user_settings_avatar_check check (avatar_id in ('mark', 'smile', 'curious', 'think', 'initials'))
);

create unique index if not exists user_settings_username_idx on user_settings (username) where username is not null;

create table if not exists legal_acceptances (
  id text primary key,
  user_id text not null references "user" (id) on delete cascade,
  document_key text not null,
  version text not null,
  accepted_at timestamptz not null default now()
);

create unique index if not exists legal_accept_user_doc_idx on legal_acceptances (user_id, document_key, version);
create index if not exists legal_accept_user_idx on legal_acceptances (user_id, accepted_at desc);
