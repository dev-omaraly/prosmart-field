import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from './supabase';

// Same id is used by the Edge Function and by AndroidManifest (see ci/patch_android.py).
// Android freezes a channel's sound after creation: to change the sound, bump the version (…_v2) everywhere.
export const CHANNEL_ID = 'prosmart_alerts_v1';

// Push only works inside the APK and only when the build had google-services.json (VITE_PUSH_ENABLED=1)
export const pushAvailable = () => Capacitor.isNativePlatform() && import.meta.env.VITE_PUSH_ENABLED === '1';

const TOKEN_KEY = 'prosmart_push_token';
let listening = false;

export type PushOpen = (notificationId: string) => void;

/** Create the loud / lock-screen channel. Safe to call on every launch. */
export async function setupChannel() {
  if (!pushAvailable()) return;
  try {
    await PushNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'تنبيهات PROSMART',
      description: 'أوامر الشغل والتنبيهات من الإدارة',
      importance: 5, // heads-up + sound
      visibility: 1, // show full content on lock screen
      sound: 'prosmart_alert.wav',
      vibration: true,
      lights: true,
      lightColor: '#00E5FF',
    });
  } catch (e) {
    console.warn('channel', e);
  }
}

/** Ask permission, register with FCM and save the token for the signed-in user. */
export async function registerPush(onOpen: PushOpen) {
  if (!pushAvailable()) return;
  try {
    if (!listening) {
      listening = true;
      await PushNotifications.addListener('registration', async (t) => {
        localStorage.setItem(TOKEN_KEY, t.value);
        await supabase.rpc('register_device', { tok: t.value });
      });
      await PushNotifications.addListener('registrationError', (e) => console.warn('push reg error', e));
      // app is open: no system banner, so play the chime and let the UI refresh
      await PushNotifications.addListener('pushNotificationReceived', () => {
        try {
          const a = new Audio('./alert.wav');
          a.play().catch(() => {});
        } catch { /* ignore */ }
        window.dispatchEvent(new Event('prosmart:push'));
      });
      // user tapped the notification (app was in background or closed)
      await PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
        const id = a.notification.data?.notification_id as string | undefined;
        if (id) onOpen(id);
      });
    }
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return;
    await setupChannel();
    await PushNotifications.register();
  } catch (e) {
    console.warn('push', e);
  }
}

/** Call before sign-out so the phone stops getting the previous user's alerts. */
export async function unregisterPush() {
  const tok = localStorage.getItem(TOKEN_KEY);
  if (!tok) return;
  try {
    await supabase.rpc('unregister_device', { tok });
  } catch { /* ignore */ }
  localStorage.removeItem(TOKEN_KEY);
}
