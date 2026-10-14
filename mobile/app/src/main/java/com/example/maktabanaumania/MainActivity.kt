package com.example.maktabanaumania

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import com.example.maktabanaumania.theme.MaktabaNaumaniaTheme

class MainActivity : AppCompatActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    enableEdgeToEdge()
    setContent {
      MaktabaNaumaniaTheme {
        // Urdu and Arabic are RTL; English is LTR — same rule as the desktop app's
        // `dir = LANG === "en" ? "ltr" : "rtl"`.
        val language = LocalConfiguration.current.locales[0].language
        val direction = if (language == "en") LayoutDirection.Ltr else LayoutDirection.Rtl
        CompositionLocalProvider(LocalLayoutDirection provides direction) {
          Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) { MainNavigation() }
        }
      }
    }
  }
}
