package com.example.maktabanaumania.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import com.example.maktabanaumania.R

// Direct port of desktop's --font-urdu / --font-arabic CSS variables (style.css):
// Jameel Noori Nastaleeq for Urdu content, My Lotus for Arabic, system default for English.
val JameelNooriNastaleeq = FontFamily(Font(R.font.jameel_noori_nastaleeq))
val MyLotus = FontFamily(Font(R.font.my_lotus))

/** Same rule as desktop's applyLang(): the active language decides the script face. */
fun fontFamilyForLanguage(language: String): FontFamily =
  when (language) {
    "ur" -> JameelNooriNastaleeq
    "ar" -> MyLotus
    else -> FontFamily.Default
  }

fun appTypography(fontFamily: FontFamily): Typography {
  val base = Typography()
  return Typography(
    displayLarge = base.displayLarge.copy(fontFamily = fontFamily),
    displayMedium = base.displayMedium.copy(fontFamily = fontFamily),
    displaySmall = base.displaySmall.copy(fontFamily = fontFamily),
    headlineLarge = base.headlineLarge.copy(fontFamily = fontFamily),
    headlineMedium = base.headlineMedium.copy(fontFamily = fontFamily),
    headlineSmall = base.headlineSmall.copy(fontFamily = fontFamily),
    titleLarge = base.titleLarge.copy(fontFamily = fontFamily),
    titleMedium = base.titleMedium.copy(fontFamily = fontFamily),
    titleSmall = base.titleSmall.copy(fontFamily = fontFamily),
    bodyLarge = base.bodyLarge.copy(fontFamily = fontFamily),
    bodyMedium = base.bodyMedium.copy(fontFamily = fontFamily),
    bodySmall = base.bodySmall.copy(fontFamily = fontFamily),
    labelLarge = base.labelLarge.copy(fontFamily = fontFamily),
    labelMedium = base.labelMedium.copy(fontFamily = fontFamily),
    labelSmall = base.labelSmall.copy(fontFamily = fontFamily),
  )
}
