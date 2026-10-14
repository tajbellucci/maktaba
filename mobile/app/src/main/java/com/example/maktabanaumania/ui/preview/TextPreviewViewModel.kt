package com.example.maktabanaumania.ui.preview

import androidx.compose.ui.text.font.FontFamily
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.maktabanaumania.data.TextRepository
import com.example.maktabanaumania.theme.fontFamilyForContent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface TextPreviewUiState {
  data object Loading : TextPreviewUiState

  data class Error(val message: String) : TextPreviewUiState

  // fontFamily is picked from the book's own text (Jameel Noori for Urdu, My Lotus for
  // Arabic) — not the app's UI language, since one catalog mixes Urdu and Arabic books.
  data class Ready(val lines: List<String>, val fontFamily: FontFamily) : TextPreviewUiState
}

class TextPreviewViewModel(private val repository: TextRepository, private val fileUrl: String) : ViewModel() {
  private val _uiState = MutableStateFlow<TextPreviewUiState>(TextPreviewUiState.Loading)
  val uiState: StateFlow<TextPreviewUiState> = _uiState.asStateFlow()

  private val _query = MutableStateFlow("")
  val query: StateFlow<String> = _query.asStateFlow()

  // Line indices (into TextPreviewUiState.Ready.lines) that contain the current query, in order.
  private val _matchLines = MutableStateFlow<List<Int>>(emptyList())
  val matchLines: StateFlow<List<Int>> = _matchLines.asStateFlow()

  private val _currentMatch = MutableStateFlow(0)
  val currentMatch: StateFlow<Int> = _currentMatch.asStateFlow()

  private var allLines: List<String> = emptyList()

  init {
    viewModelScope.launch {
      repository
        .loadText(fileUrl)
        .onSuccess { text ->
          allLines = text.lineSequence().toList()
          _uiState.value = TextPreviewUiState.Ready(allLines, fontFamilyForContent(text))
        }
        .onFailure { _uiState.value = TextPreviewUiState.Error(it.message ?: "Unknown error") }
    }
  }

  fun onQueryChange(newQuery: String) {
    _query.value = newQuery
    _currentMatch.value = 0
    _matchLines.value =
      if (newQuery.isBlank()) {
        emptyList()
      } else {
        allLines.indices.filter { allLines[it].contains(newQuery, ignoreCase = true) }
      }
  }

  fun nextMatch() {
    val matches = _matchLines.value
    if (matches.isEmpty()) return
    _currentMatch.value = (_currentMatch.value + 1) % matches.size
  }

  fun previousMatch() {
    val matches = _matchLines.value
    if (matches.isEmpty()) return
    _currentMatch.value = (_currentMatch.value - 1 + matches.size) % matches.size
  }
}
