package com.example.maktabanaumania

import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat

/** Mirrors desktop's setLang(): an explicit in-app language choice, independent of the
 * device's system language, persisted automatically by AppCompat across restarts. */
object AppLanguage {
  fun set(languageTag: String) {
    AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(languageTag))
  }
}
