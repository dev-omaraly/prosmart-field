# Pro Smart Field App

## 1) قاعدة البيانات (Supabase → SQL Editor، بالترتيب)
- `sql/step7.sql` (لو لسه ما اتشغلش)
- `sql/step8.sql`: الإشعارات + صرف المخزن
- `sql/step10.sql` ← جديد: صلاحيات أمين المخزن + تعديل/حذف الأوامر لإداري معين (وفي آخره سطر تحدد بيه الإداري صاحب الصلاحية)

## 2) تشغيل الإشعارات (مرة واحدة)
1. **Firebase**: console.firebase.google.com → Create project → Add Android app باسم الحزمة `com.prosmart.field` → نزّل `google-services.json`.
2. **GitHub Secret**: في الـ Repo → Settings → Secrets and variables → Actions → New secret
   اسمه `GOOGLE_SERVICES_JSON` وقيمته محتوى ملف `google-services.json` كله.
3. **مفتاح السيرفر**: Firebase → Project settings → Service accounts → Generate new private key (ملف JSON).
4. **Supabase → Edge Functions → Create function** باسم `send-push` والصق محتوى `supabase/functions/send-push/index.ts`.
   ثم Edge Functions → Secrets وأضف:
   - `FIREBASE_SERVICE_ACCOUNT` = محتوى ملف المفتاح (الخطوة 3) كله
   - `WEBHOOK_SECRET` = أي كلمة سر عشوائية طويلة
5. افتح `sql/step9_push_webhook.sql` وغيّر `PUT_A_RANDOM_SECRET_HERE` لنفس `WEBHOOK_SECRET` وشغّله.

## 3) بناء الـ APK
أي Push على `main` (أو Actions → Build Android APK → Run workflow) بيبني APK وينشره في **Releases → latest → ProSmart.apk**.
التحديثات بتتركّب فوق النسخة القديمة (التوقيع ثابت).

## 4) الموقع (GitHub Pages)
Settings → Pages → Source: GitHub Actions. كل Push على main بينشر الموقع.

## تشغيل محلي
npm install && npm run dev

## 5) إعادة تعيين باسورد مستخدم (اختياري)
Supabase → Edge Functions → Deploy a new function → اسمها `admin-reset-password` بالظبط → الصق `supabase/functions/admin-reset-password/index.ts` → Deploy. (مفيش Secrets إضافية.)
بعدها في الإعدادات → المستخدمين تلاقي زرار "باسورد" جنب كل مستخدم.

## 6) الأوفلاين
- الفني يفتح أوامره ويشوف تفاصيلها ويسجل وصول/مهام/تقرير/توقيع/صور من غير نت، وكله بيترفع تلقائي لما النت يرجع (شريط أعلى الشاشة بيبين الحالة).
- المخزن والمنتجات والمستخدمين والرسائل لازم نت (عشان الرصيد يفضل سليم).
- أول تسجيل دخول لازم يكون أونلاين.
