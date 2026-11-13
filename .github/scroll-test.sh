#!/bin/bash
V="$1"; OUT="result-$V.txt"
APK=android/app/build/outputs/apk/release/app-release.apk
{
echo "== $V  apk=$(stat -c %s $APK) bytes"
adb install -r "$APK" || echo INSTALL_FAILED
sleep 30   # let the launcher settle after boot
adb shell input keyevent KEYCODE_HOME
adb logcat -c
adb shell am start -W -n com.medladder.app/.MainActivity
sleep 25
SIZE=$(adb shell wm size | grep -o '[0-9]*x[0-9]*' | tail -1); W=${SIZE%x*}; H=${SIZE#*x}
echo "screen $W x $H"
adb logcat -d -s Capacitor/Console:* | grep DIAGSCROLL | tail -2 | sed 's/^/before: /'
for i in 1 2 3; do adb shell input swipe $((W/2)) $((H*3/4)) $((W/2)) $((H/4)) 600; sleep 1.5; done
sleep 2
adb logcat -d -s Capacitor/Console:* | grep DIAGSCROLL | tail -2 | sed 's/^/after: /'
echo "-- crashes:"; adb logcat -d -b crash | tail -20
echo "-- top window:"; adb shell dumpsys window | grep -m2 mCurrentFocus
} > "$OUT" 2>&1
cat "$OUT"
