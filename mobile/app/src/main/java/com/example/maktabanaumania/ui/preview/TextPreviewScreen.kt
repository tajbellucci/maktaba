package com.example.maktabanaumania.ui.preview

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.maktabanaumania.R
import com.example.maktabanaumania.data.DefaultTextRepository

@Composable
fun TextPreviewScreen(fileUrl: String, modifier: Modifier = Modifier) {
  val appContext = LocalContext.current.applicationContext
  val viewModel: TextPreviewViewModel =
    viewModel(key = "preview-$fileUrl") { TextPreviewViewModel(DefaultTextRepository(appContext), fileUrl) }

  val state by viewModel.uiState.collectAsStateWithLifecycle()
  val query by viewModel.query.collectAsStateWithLifecycle()
  val matchLines by viewModel.matchLines.collectAsStateWithLifecycle()
  val currentMatch by viewModel.currentMatch.collectAsStateWithLifecycle()

  val listState = rememberLazyListState()

  LaunchedEffect(currentMatch, matchLines) {
    matchLines.getOrNull(currentMatch)?.let { lineIndex -> listState.scrollToItem(lineIndex) }
  }

  Column(modifier.fillMaxSize()) {
    Row(modifier = Modifier.fillMaxWidth().padding(8.dp)) {
      OutlinedTextField(
        value = query,
        onValueChange = viewModel::onQueryChange,
        label = { Text(stringResource(R.string.preview_search_label)) },
        modifier = Modifier.weight(1f),
      )
    }
    if (query.isNotBlank()) {
      Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp), horizontalArrangement = Arrangement.End) {
        Text(
          if (matchLines.isEmpty()) stringResource(R.string.preview_no_matches)
          else stringResource(R.string.preview_match_count, currentMatch + 1, matchLines.size),
          // Force LTR: this string is a bare "N / M" counter, and inside the app's RTL
          // layout direction the bidi algorithm reverses that neutral digit/slash run
          // (renders "4 / 1" instead of "1 / 4") without an explicit direction anchor.
          style = LocalTextStyle.current.copy(textDirection = TextDirection.Ltr),
          modifier = Modifier.padding(end = 8.dp),
        )
        IconButton(onClick = viewModel::previousMatch, enabled = matchLines.isNotEmpty()) { Text("˄") }
        IconButton(onClick = viewModel::nextMatch, enabled = matchLines.isNotEmpty()) { Text("˅") }
      }
    }
    when (val current = state) {
      TextPreviewUiState.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
      is TextPreviewUiState.Error ->
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text(stringResource(R.string.preview_load_error, current.message)) }
      is TextPreviewUiState.Ready ->
        LazyColumn(state = listState, modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
          items(current.lines.size) { index ->
            val line = current.lines[index]
            val isCurrentMatchLine = matchLines.getOrNull(currentMatch) == index
            Text(
              text = highlightedLine(line, query),
              style = MaterialTheme.typography.bodyLarge.copy(fontFamily = current.fontFamily),
              modifier =
                Modifier.fillMaxWidth().padding(vertical = 4.dp).let {
                  if (isCurrentMatchLine) it.background(MaterialTheme.colorScheme.primaryContainer) else it
                },
            )
          }
        }
    }
  }
}

@Composable
private fun highlightedLine(line: String, query: String) =
  buildAnnotatedString {
    if (query.isBlank()) {
      append(line)
      return@buildAnnotatedString
    }
    var start = 0
    while (start <= line.length) {
      val matchIndex = line.indexOf(query, start, ignoreCase = true)
      if (matchIndex < 0) {
        append(line.substring(start))
        break
      }
      append(line.substring(start, matchIndex))
      withStyle(SpanStyle(background = MaterialTheme.colorScheme.tertiaryContainer)) { append(line.substring(matchIndex, matchIndex + query.length)) }
      start = matchIndex + query.length
    }
  }
