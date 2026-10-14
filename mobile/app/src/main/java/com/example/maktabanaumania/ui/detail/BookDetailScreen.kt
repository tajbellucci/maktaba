package com.example.maktabanaumania.ui.detail

import android.widget.Toast
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
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
import com.example.maktabanaumania.data.PdfOpener
import com.example.maktabanaumania.data.heldByLine
import com.example.maktabanaumania.data.isOverdue
import kotlinx.coroutines.launch

@Composable
fun BookDetailScreen(bookId: Int, onReadBook: (String) -> Unit, modifier: Modifier = Modifier) {
  val appContext = LocalContext.current.applicationContext
  val viewModel: BookDetailViewModel = viewModel(key = "detail-$bookId") { BookDetailViewModel(DefaultDataRepository(appContext), bookId) }
  val book by viewModel.book.collectAsStateWithLifecycle()
  val current = book
  if (current == null) {
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
    return
  }
  val scope = rememberCoroutineScope()
  LazyColumn(modifier.fillMaxSize().padding(16.dp)) {
    item {
      Text(current.title, style = MaterialTheme.typography.headlineSmall)
      Text(current.author, style = MaterialTheme.typography.bodyLarge)
      Text(current.category, style = MaterialTheme.typography.bodyMedium)
      Text("${current.volumes}", style = MaterialTheme.typography.bodyMedium)
      if (current.notes.isNotBlank()) Text(current.notes, style = MaterialTheme.typography.bodySmall)

      CirculationStatus(current, modifier = Modifier.padding(top = 12.dp))

      val fileUrl = current.files.firstOrNull()
      if (fileUrl != null) {
        when (current.format) {
          "unicode" -> Button(onClick = { onReadBook(fileUrl) }, modifier = Modifier.padding(top = 16.dp)) { Text(stringResource(R.string.detail_read_book)) }
          "pdf" ->
            Button(
              onClick = {
                scope.launch {
                  PdfOpener(appContext)
                    .downloadAndGetIntent(fileUrl)
                    .onSuccess { intent -> appContext.startActivity(intent) }
                    .onFailure { Toast.makeText(appContext, it.message, Toast.LENGTH_LONG).show() }
                }
              },
              modifier = Modifier.padding(top = 16.dp),
            ) {
              Text(stringResource(R.string.detail_open_pdf))
            }
        }
      }

      if (current.history.isNotEmpty()) {
        Text(stringResource(R.string.history_title), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 24.dp, bottom = 8.dp))
      }
    }
    items(current.history) { entry ->
      Row(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Text(entry.date, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(end = 8.dp))
        Text(historyActionLabel(entry.action), style = MaterialTheme.typography.bodySmall)
        if (entry.detail.isNotBlank()) Text(" — ${entry.detail}", style = MaterialTheme.typography.bodySmall)
      }
      HorizontalDivider()
    }
  }
}

@Composable
private fun CirculationStatus(book: Book, modifier: Modifier = Modifier) {
  Column(modifier) {
    val statusLabel =
      when (book.status) {
        "issued" -> stringResource(R.string.status_issued)
        "missing" -> stringResource(R.string.status_missing)
        else -> stringResource(R.string.status_available)
      }
    Row {
      Text(statusLabel, style = MaterialTheme.typography.bodyMedium)
      if (book.isOverdue()) {
        Text(" · ${stringResource(R.string.status_overdue)}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
      }
    }
    if (book.status == "issued") {
      val kindLabel = if (book.issueType == "department") stringResource(R.string.held_by_department) else stringResource(R.string.held_by_person)
      val holder = book.heldByLine(stringResource(R.string.borrower_hidden))
      Text("$kindLabel · $holder", style = MaterialTheme.typography.bodyMedium)
      if (book.dueDate.isNotBlank()) {
        Text("${stringResource(R.string.due_date_label)}: ${book.dueDate}", style = MaterialTheme.typography.bodyMedium)
      }
    }
  }
}

@Composable
private fun historyActionLabel(action: String): String =
  when (action) {
    "issued" -> stringResource(R.string.history_action_issued)
    "transferred" -> stringResource(R.string.history_action_transferred)
    "returned" -> stringResource(R.string.history_action_returned)
    "broughtBack" -> stringResource(R.string.history_action_broughtBack)
    "missing" -> stringResource(R.string.history_action_missing)
    "available" -> stringResource(R.string.history_action_available)
    else -> action
  }
