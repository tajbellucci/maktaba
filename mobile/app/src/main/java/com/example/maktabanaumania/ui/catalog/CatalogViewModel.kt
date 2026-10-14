package com.example.maktabanaumania.ui.catalog

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.maktabanaumania.data.Book
import com.example.maktabanaumania.data.DataRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

sealed interface CatalogUiState {
  data object Loading : CatalogUiState

  data class Error(val message: String) : CatalogUiState

  data class Success(val books: List<Book>, val query: String) : CatalogUiState
}

class CatalogViewModel(private val repository: DataRepository) : ViewModel() {
  private val allBooks = MutableStateFlow<List<Book>>(emptyList())
  private val query = MutableStateFlow("")
  private val loadState = MutableStateFlow<Throwable?>(null)
  private val loading = MutableStateFlow(true)

  val uiState: StateFlow<CatalogUiState> =
    combine(allBooks, query, loadState, loading) { books, q, error, isLoading ->
        when {
          isLoading -> CatalogUiState.Loading
          error != null && books.isEmpty() -> CatalogUiState.Error(error.message ?: "Unknown error")
          else -> {
            val filtered = if (q.isBlank()) books else books.filter { it.title.contains(q, ignoreCase = true) || it.author.contains(q, ignoreCase = true) }
            CatalogUiState.Success(filtered, q)
          }
        }
      }
      .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), CatalogUiState.Loading)

  init {
    load()
  }

  fun load() {
    viewModelScope.launch {
      loading.value = true
      repository
        .loadCatalog()
        .onSuccess {
          allBooks.value = it.books
          loadState.value = null
        }
        .onFailure { loadState.value = it }
      loading.value = false
    }
  }

  fun onQueryChange(newQuery: String) {
    query.value = newQuery
  }
}
