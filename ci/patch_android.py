"""Run after `npx cap add android`: manifest tweaks, icons, sound, versionCode."""
import os, re, shutil, sys, glob

ROOT = 'android/app/src/main'
RES = f'{ROOT}/res'
SRC = 'android-res'

# ---- 1. copy icons / notification icon / sound ----
for d in os.listdir(SRC):
    if d == 'splash':
        continue
    dst = f'{RES}/{d}'
    os.makedirs(dst, exist_ok=True)
    for f in os.listdir(f'{SRC}/{d}'):
        shutil.copy(f'{SRC}/{d}/{f}', f'{dst}/{f}')

# adaptive icon background colour = brand navy
os.makedirs(f'{RES}/values', exist_ok=True)
open(f'{RES}/values/ic_launcher_background.xml', 'w').write(
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
    '    <color name="ic_launcher_background">#003A5F</color>\n</resources>\n')
# adaptive icon: navy background + our cyan house as foreground (PNG mipmaps copied above)
os.makedirs(f'{RES}/mipmap-anydpi-v26', exist_ok=True)
for n in ('ic_launcher', 'ic_launcher_round'):
    open(f'{RES}/mipmap-anydpi-v26/{n}.xml', 'w').write(
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@color/ic_launcher_background"/>\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
        '</adaptive-icon>\n')

# ---- 2. splash screens ----
for f in glob.glob(f'{RES}/drawable*/splash.png'):
    src = 'splash_land.png' if 'land' in f else 'splash_port.png'
    shutil.copy(f'{SRC}/splash/{src}', f)

# ---- 3. manifest ----
mf = f'{ROOT}/AndroidManifest.xml'
t = open(mf, encoding='utf-8').read()
perms = [
    'android.permission.CAMERA',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.VIBRATE',
]
add = ''.join(f'    <uses-permission android:name="{p}" />\n' for p in perms if p not in t)
if add:
    t = t.replace('<application', add + '    <application', 1)
meta = '''
        <meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_stat_prosmart" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color/ic_launcher_background" />
        <meta-data android:name="com.google.firebase.messaging.default_notification_channel_id" android:value="prosmart_alerts_v1" />
'''
if 'default_notification_channel_id' not in t:
    t = re.sub(r'(<application[^>]*>)', r'\1' + meta, t, count=1)
open(mf, 'w', encoding='utf-8').write(t)

# ---- 4. versionCode = CI run number so every build can update the previous one ----
vc = os.environ.get('RUN_NUMBER', '1')
for g in ('android/app/build.gradle',):
    s = open(g).read()
    s = re.sub(r'versionCode\s+\d+', f'versionCode {vc}', s)
    s = re.sub(r'versionName\s+"[^"]*"', f'versionName "1.0.{vc}"', s)
    open(g, 'w').write(s)
print('patched android project, versionCode', vc)
