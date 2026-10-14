package com.example.maktabanaumania.ui.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.maktabanaumania.data.Book
import com.example.maktabanaumania.data.DataRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

class BookDetailViewModel(private val repository: DataRepository, private val bookId: Int) : ViewModel() {
  private val _book = MutableStateFlow<Book?>(null)
  val book: StateFlow<Book?> = _book.asStateFlow()

  init {
    viewModelScope.launch { repository.loadCatalog().onSuccess { catalog -> _book.value = catalog.books.find { it.id == bookId } } }
  }
}
