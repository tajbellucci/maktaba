package com.example.maktabanaumania.theme

import androidx.compose.ui.text.font.FontFamily

// Letters that exist in Urdu's extended Arabic script but not in standard Arabic
// (retroflex/aspirated consonants, Urdu-style yeh/heh/kaf). Their presence is a
// reliable signal the text is Urdu rather than Arabic — used to pick the book-content
// font per book (unlike the UI chrome, which follows the language switch instead).
private val URDU_ONLY_LETTERS =
  charArrayOf(
    'ٹ', // ٹ tteh
    'ڈ', // ڈ ddal
    'ڑ', // ڑ rreh
    'ں', // ں noon ghunna
    'ے', // ے yeh barree
    'پ', // پ peh
    'چ', // چ tcheh
    'گ', // گ gaf
    'ژ', // ژ jeh
    'ھ', // ھ heh doachashmee
    'ک', // ک keheh (Urdu kaf; standard Arabic uses ك)
  )

/** Picks the book-content font from the text's own script, not the current UI language. */
fun fontFamilyForContent(text: String): FontFamily {
  val sample = text.take(4000)
  val hasArabicScript = sample.any { it.code in 0x0600..0x06FF }
  if (!hasArabicScript) return FontFamily.Default
  val isUrdu = sample.any { it in URDU_ONLY_LETTERS }
  return if (isUrdu) JameelNooriNastaleeq else MyLotus
}
