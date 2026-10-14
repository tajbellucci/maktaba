package com.example.maktabanaumania.ui.catalog

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ListItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.maktabanaumania.R
import com.example.maktabanaumania.data.Book
import com.example.maktabanaumania.data.DefaultDataRepository

@Composable
fun CatalogScreen(onBookClick: (Int) -> Unit, modifier: Modifier = Modifier) {
  val appContext = LocalContext.current.applicationContext
  val viewModel: CatalogViewModel = viewModel { CatalogViewModel(DefaultDataRepository(appContext)) }
  val state by viewModel.uiState.collectAsStateWithLifecycle()
  Column(modifier.fillMaxSize()) {
    when (val current = state) {
      CatalogUiState.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
      is CatalogUiState.Error ->
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
          Text(stringResource(R.string.catalog_load_error, current.message))
        }
      is CatalogUiState.Success -> {
        OutlinedTextField(
          value = current.query,
          onValueChange = viewModel::onQueryChange,
          label = { Text(stringResource(R.string.catalog_search_label)) },
          modifier = Modifier.fillMaxWidth().padding(16.dp),
        )
        LazyColumn {
          items(current.books, key = { it.id }) { book ->
            BookRow(book, onClick = { onBookClick(book.id) })
            HorizontalDivider()
          }
        }
      }
    }
  }
}

@Composable
private fun BookRow(book: Book, onClick: () -> Unit) {
  ListItem(
    headlineContent = { Text(book.title) },
    supportingContent = { Text(book.author) },
    trailingContent = { Text(if (book.present) "✓" else "✗") },
    modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
  )
}
