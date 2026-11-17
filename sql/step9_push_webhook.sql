-- Step 9: شغّله بعد ما تنشر الـ Edge Function (send-push)
-- 1) غيّر PUT_A_RANDOM_SECRET_HERE لكلمة سر عشوائية (نفسها هتحطها في Secrets اسمه WEBHOOK_SECRET)
-- 2) كل ما يتضاف مستلم في notification_recipients، السيرفر يبعت إشعار على موبايله

drop trigger if exists push_on_new_notification on public.notification_recipients;
create trigger push_on_new_notification
after insert on public.notification_recipients
for each row execute function supabase_functions.http_request(
  'https://iubracicfdvdphvatbqg.supabase.co/functions/v1/send-push',
  'POST',
  '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1YnJhY2ljZmR2ZHBodmF0YnFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3NzIwNzEsImV4cCI6MjExMDM0ODA3MX0.A2-UYJUK1UGksHnrxYmYHRxCRFwrQ-oYrkZ_CSDo1iA","x-webhook-secret":"PUT_A_RANDOM_SECRET_HERE"}',
  '{}',
  '5000'
);
