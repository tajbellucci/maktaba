package com.example.maktabanaumania.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.example.maktabanaumania.AppLanguage
import com.example.maktabanaumania.R

@Composable
fun HomeScreen(onOpenCatalog: () -> Unit, modifier: Modifier = Modifier) {
  Column(
    modifier = modifier.fillMaxSize().padding(24.dp),
    verticalArrangement = Arrangement.Center,
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Text(stringResource(R.string.home_title), style = MaterialTheme.typography.headlineMedium)
    Text(stringResource(R.string.home_subtitle), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 8.dp, bottom = 24.dp))
    Button(onClick = onOpenCatalog) { Text(stringResource(R.string.home_open_catalog)) }

    Row(modifier = Modifier.padding(top = 32.dp)) {
      // Language names are shown in their own script regardless of the active UI
      // language — the same fixed self-labels desktop's langSelf uses.
      OutlinedButton(onClick = { AppLanguage.set("ur") }, modifier = Modifier.padding(horizontal = 4.dp)) { Text("اردو") }
      OutlinedButton(onClick = { AppLanguage.set("ar") }, modifier = Modifier.padding(horizontal = 4.dp)) { Text("عربي") }
      OutlinedButton(onClick = { AppLanguage.set("en") }, modifier = Modifier.padding(horizontal = 4.dp)) { Text("English") }
    }
  }
}
