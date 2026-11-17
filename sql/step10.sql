-- Step 10: صلاحيات (أمين المخزن / تعديل وحذف الأوامر لإداري معين) — شغّله مرة واحدة في SQL Editor
-- بعدين شغّل السطر الأخير (اختار الإداري صاحب الصلاحية بإيميله)

-- ───────── دوال مساعدة ─────────
alter table profiles add column if not exists can_manage_orders boolean not null default false;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role::text from profiles where id = auth.uid() and is_active
$$;

create or replace function public.can_manage_orders() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select can_manage_orders from profiles
                   where id = auth.uid() and is_active and role::text = 'admin'), false)
$$;

grant execute on function public.my_role(), public.can_manage_orders() to authenticated;

-- ───────── المخزن: الإداري + أمين المخزن بس يقدروا يضيفوا/يعدلوا/يصرفوا ─────────
do $$
declare t text;
begin
  foreach t in array array['products', 'stock_items', 'stock_movements'] loop
    -- صلاحية كاملة للإداري وأمين المخزن
    execute format('drop policy if exists stock_staff_all on public.%I', t);
    execute format($p$create policy stock_staff_all on public.%I for all to authenticated
      using (public.my_role() in ('admin','storekeeper'))
      with check (public.my_role() in ('admin','storekeeper'))$p$, t);
    -- حاجز: أي حد غيرهم ممنوع يكتب حتى لو في policy قديمة بتسمح
    execute format('drop policy if exists stock_guard_ins on public.%I', t);
    execute format($p$create policy stock_guard_ins on public.%I as restrictive for insert to authenticated
      with check (public.my_role() in ('admin','storekeeper'))$p$, t);
    execute format('drop policy if exists stock_guard_upd on public.%I', t);
    execute format($p$create policy stock_guard_upd on public.%I as restrictive for update to authenticated
      using (public.my_role() in ('admin','storekeeper'))$p$, t);
    execute format('drop policy if exists stock_guard_del on public.%I', t);
    execute format($p$create policy stock_guard_del on public.%I as restrictive for delete to authenticated
      using (public.my_role() in ('admin','storekeeper'))$p$, t);
  end loop;
end $$;

-- أمين المخزن يشوف الأوامر المفتوحة (رقم + اسم عميل بس) عشان يصرف عليها، من غير تليفون/عنوان العميل
create or replace function public.orders_for_issue() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.my_role() in ('admin', 'storekeeper') then
    coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'order_no', w.order_no,
                                                  'client_name', w.client_name, 'status', w.status))
              from (select * from work_orders where status::text <> 'cancelled'
                    order by scheduled_at desc limit 100) w), '[]'::jsonb)
  else '[]'::jsonb end
$$;
grant execute on function public.orders_for_issue() to authenticated;

-- ───────── تعديل وحذف أوامر الشغل: للإداري المصرّح له بس ─────────
-- تعديل بيانات الأمر (العميل/العنوان/الميعاد/التفاصيل/التيم ليدر)
create or replace function public.guard_work_order_edit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and (new.client_name, new.client_phone, new.location_text, new.location_url,
          new.scheduled_at, new.details, new.team_leader_id)
         is distinct from
         (old.client_name, old.client_phone, old.location_text, old.location_url,
          old.scheduled_at, old.details, old.team_leader_id)
     and not public.can_manage_orders() then
    raise exception 'تعديل أمر الشغل متاح للإداري المصرّح له بس';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_work_order_edit on work_orders;
create trigger trg_guard_work_order_edit before update on work_orders
  for each row execute function public.guard_work_order_edit();

-- الحذف المباشر ممنوع على الكل ما عدا المصرّح له
drop policy if exists wo_delete_guard on work_orders;
create policy wo_delete_guard on work_orders as restrictive for delete to authenticated
  using (public.can_manage_orders());

-- حذف أمر بكل توابعه (بيشتغل من التطبيق)
create or replace function public.delete_work_order(wo uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_orders() then
    raise exception 'مش مصرّح لك تحذف أوامر الشغل';
  end if;
  delete from report_credentials where report_id in (select id from site_reports where work_order_id = wo);
  delete from site_reports where work_order_id = wo;
  delete from work_order_photos where work_order_id = wo;
  delete from work_order_tasks where work_order_id = wo;
  delete from work_order_techs where work_order_id = wo;
  delete from work_orders where id = wo;
end $$;
grant execute on function public.delete_work_order(uuid) to authenticated;

-- محدش يعدّل صلاحية "تعديل/حذف الأوامر" إلا اللي معاه الصلاحية دي
create or replace function public.guard_profile_flags() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and new.can_manage_orders is distinct from old.can_manage_orders
     and not public.can_manage_orders() then
    raise exception 'مش مصرّح لك تغيّر الصلاحية دي';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_profile_flags on profiles;
create trigger trg_guard_profile_flags before update on profiles
  for each row execute function public.guard_profile_flags();

-- ───────── آخر خطوة: اختار الإداري صاحب الصلاحية (غيّر الإيميل) ─────────
-- لو بتدخل بـ username فالإيميل هو  username@prosmart.app
-- update profiles set can_manage_orders = true
--   where id = (select id from auth.users where email = 'اكتب-الايميل-هنا');
