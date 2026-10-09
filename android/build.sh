#!/bin/sh
# Сборка и подпись Android-приложения Moooza (TWA) — см. README.md.
# Пароль ключа — BUBBLEWRAP_KEYSTORE_PASSWORD (хранилище PKCS12: у ключа тот же пароль).
set -e
cd "$(dirname "$0")"

KEYSTORE="${MOOOZA_KEYSTORE:-$HOME/.moooza-android/moooza-release.jks}"
: "${BUBBLEWRAP_KEYSTORE_PASSWORD:?Задайте BUBBLEWRAP_KEYSTORE_PASSWORD (storepass из keystore-passwords.txt)}"
export BUBBLEWRAP_KEY_PASSWORD="${BUBBLEWRAP_KEY_PASSWORD:-$BUBBLEWRAP_KEYSTORE_PASSWORD}"

# Bubblewrap запускает gradlew.bat через cmd; при NoDefaultCurrentDirectoryInExePath
# cmd не ищет его в текущей папке — кладём папку проекта в PATH. jarsigner (подпись
# .aab) он вызывает без пути — добавляем bin JDK из ~/.bubblewrap/config.json.
JDK="$(node -p "require(require('os').homedir() + '/.bubblewrap/config.json').jdkPath")"
export PATH="$PWD:$JDK/bin:$PATH"

BW="npx -y @bubblewrap/cli@1.25.0"
# Проект Gradle — производный от twa-manifest.json, генерируется заново.
$BW update --skipVersionUpgrade
$BW build --signingKeyPath="$KEYSTORE" --signingKeyAlias=moooza
# Демон Gradle держит файлы app/build — без остановки следующий update падает с EBUSY.
JAVA_HOME="$JDK" ./gradlew --stop >/dev/null 2>&1 || true

cp app-release-signed.apk ../client/public/moooza.apk
echo "Готово: android/app-release-signed.apk (RuStore) и client/public/moooza.apk (сайт)"
