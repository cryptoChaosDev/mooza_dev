# Android-приложение Moooza

TWA (Trusted Web Activity), пакет **`ru.moooza.app`**. Приложение открывает https://moooza.ru в движке Chrome на весь экран, без адресной строки. Поэтому всё, что выкатывается на сайт, сразу появляется и в приложении. Пересобирать APK нужно только при смене иконки, названия, цветов, ярлыков или стартового адреса, а также для новой версии в RuStore.

Распространение: RuStore и APK на сайте (`https://moooza.ru/moooza.apk`). Ссылка на APK видна только в браузерах Android и включается в админке: «Ссылка на Android-приложение (APK)», флаг `androidApkEnabled`.

## Что в репозитории

- `twa-manifest.json`: вся конфигурация приложения. Проект Gradle генерируется из него и в git не хранится.
- `build.sh`: сборка и подпись, результат кладётся в `client/public/moooza.apk`.
- Веб-часть:
  - `client/public/.well-known/assetlinks.json`: связь домена с приложением. Без неё появляется адресная строка.
  - `client/public/app-icons/`: иконки (maskable, monochrome, ярлыки).
  - `client/src/lib/androidApp.ts`: определяет запуск из приложения (`/?app=android`); гость тогда сразу попадает в Поток.

## Ключ подписи — хранить как зеницу ока

- Файл: `~/.moooza-android/moooza-release.jks`, alias `moooza`. Пароль лежит рядом, в `keystore-passwords.txt`.
- **Сделайте резервную копию** ключа и пароля, например в менеджере паролей. Без этого ключа выпустить обновление приложения невозможно: ни в RuStore, ни для тех, кто поставил APK с сайта. Придётся публиковать новое приложение с другим пакетом.
- SHA-256 отпечаток ключа прописан в `assetlinks.json`. Если ключ сменится, отпечаток нужно обновить.

## Сборка

Нужны Node, JDK 17 и Android SDK. Пути к ним Bubblewrap берёт из `~/.bubblewrap/config.json` (`jdkPath`, `androidSdkPath`).

Bubblewrap 1.25 ожидает две вещи. Первая — build-tools **36.1.0**; ставятся так: `android sdk install build-tools/36.1.0`, бинарник лежит в `Sdk/cmdline-tools/latest/bin/android.exe`. Вторая — SDK в своём формате, с папкой `bin/` в корне. Поэтому `androidSdkPath` указывает не на SDK Android Studio, а на обёртку `~/.bubblewrap/android_sdk`: в ней пустая `bin/` и junction-ссылки `build-tools`, `platforms`, `platform-tools`, `licenses`, `cmdline-tools` на `%LOCALAPPDATA%\Android\Sdk`.

```sh
export BUBBLEWRAP_KEYSTORE_PASSWORD='<storepass из keystore-passwords.txt>'
sh android/build.sh
```

После сборки выкатите web, чтобы новый `moooza.apk` попал на сайт. Файл `app-release-signed.apk` в этой папке загружается в RuStore.

**Новая версия:** перед сборкой увеличьте `appVersionCode` на 1 и обновите `appVersionName` в `twa-manifest.json`. RuStore не примет сборку с прежним `versionCode`.
