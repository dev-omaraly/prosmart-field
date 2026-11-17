-- Step 8: push notifications + auto notifications + stock issue to work orders
-- شغّله مرة واحدة في Supabase > SQL Editor

-- ───────── 1) أجهزة الموبايل (توكن الإشعارات) ─────────
create table if not exists device_tokens (
  token      text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  platform   text not null default 'android',
  updated_at timestamptz not null default now()
);
create index if not exists device_tokens_user_idx on device_tokens(user_id);
alter table device_tokens enable row level security;
-- مفيش policies عمدًا: الوصول بس من الدوال دي (والـ Edge Function بالـ service role)

create or replace function register_device(tok text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into device_tokens (token, user_id, updated_at) values (tok, auth.uid(), now())
  on conflict (token) do update set user_id = auth.uid(), updated_at = now();
end $$;

create or replace function unregister_device(tok text) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from device_tokens where token = tok and user_id = auth.uid();
end $$;

grant execute on function register_device(text), unregister_device(text) to authenticated;

-- ───────── 2) ربط الرسالة بأمر الشغل (عشان الضغط عليها يفتح الأمر) ─────────
alter table notifications add column if not exists work_order_id uuid references work_orders(id) on delete set null;

-- ───────── 3) إشعار تلقائي للفني/التيم ليدر لما يتعيّن على أمر شغل ─────────
-- (لو حصل أي خطأ هنا، إنشاء الأمر نفسه مش بيتأثر)
create or replace function notify_tech_assigned() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o work_orders%rowtype;
  nid uuid;
  lead boolean;
begin
  begin
    select * into o from work_orders where id = new.work_order_id;
    lead := (o.team_leader_id = new.tech_id);
    insert into notifications (title, body, work_order_id)
    values (
      case when lead then 'أمر شغل جديد #' || o.order_no || ' — أنت التيم ليدر'
           else 'أمر شغل جديد #' || o.order_no end,
      'العميل: ' || o.client_name || E'\n' ||
      'العنوان: ' || o.location_text || E'\n' ||
      'الميعاد: ' || to_char(o.scheduled_at at time zone 'Africa/Cairo', 'YYYY-MM-DD HH24:MI') ||
      coalesce(E'\n\nالتفاصيل:\n' || o.details, ''),
      o.id)
    returning id into nid;
    insert into notification_recipients (notification_id, user_id) values (nid, new.tech_id);
  exception when others then
    raise warning 'notify_tech_assigned failed: %', sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists trg_notify_tech_assigned on work_order_techs;
create trigger trg_notify_tech_assigned after insert on work_order_techs
  for each row execute function notify_tech_assigned();

-- ───────── 4) إشعار للفني لما الإداري يوافق/يرفض مهمته ─────────
create or replace function notify_task_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o work_orders%rowtype;
  nid uuid;
begin
  if new.status is distinct from old.status and new.status in ('approved', 'rejected') then
    begin
      select * into o from work_orders where id = new.work_order_id;
      insert into notifications (title, body, work_order_id)
      values (
        case when new.status = 'approved' then 'تمت الموافقة على مهمتك ✓' else 'مهمتك اترفضت — محتاجة مراجعة' end,
        'أمر #' || o.order_no || ' · ' || o.client_name || E'\nالمهمة: ' || new.title ||
        case when new.status = 'approved' then E'\nالبونص: ' || new.bonus || ' ج' else '' end,
        o.id)
      returning id into nid;
      insert into notification_recipients (notification_id, user_id) values (nid, new.assigned_to);
    exception when others then
      raise warning 'notify_task_review failed: %', sqlerrm;
    end;
  end if;
  return new;
end $$;

drop trigger if exists trg_notify_task_review on work_order_tasks;
create trigger trg_notify_task_review after update on work_order_tasks
  for each row execute function notify_task_review();

-- ───────── 5) صرف المخزن على أمر شغل ─────────
alter table stock_movements add column if not exists work_order_id uuid references work_orders(id) on delete set null;
create index if not exists stock_movements_wo_idx on stock_movements(work_order_id);
