-- Step 7: admin-created accounts + tighter access

-- Self sign-ups start INACTIVE; only the admin activates accounts
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, phone, is_active)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', ''),
          new.raw_user_meta_data->>'phone',
          false);
  return new;
end $$;

-- Only active users can see the people list (plus each user's own row)
drop policy if exists "profiles read" on profiles;
create policy "profiles read" on profiles for select to authenticated
  using (app_role() is not null or id = auth.uid());
