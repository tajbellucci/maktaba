package com.example.maktabanaumania.data

import kotlinx.serialization.Serializable

@Serializable
data class Catalog(val library: String = "", val updated: String = "", val books: List<Book> = emptyList())

@Serializable
data class Book(
  val id: Int,
  val title: String,
  val author: String = "",
  val category: String = "",
  val volumes: Int = 0,
  val present: Boolean = true,
  val notes: String = "",
  val image: String = "",
  val status: String = "",
  val accession: String = "",
  /** "pdf" (scanned, opened externally) or "unicode" (plain text, previewed + searched in-app). */
  val format: String = "",
  val files: List<String> = emptyList(),
  // Circulation — mirrors the desktop app's issue/return fields exactly (read-only here; see
  // BookCirculation.kt). The public books.json already has borrower/address/phone blanked out
  // for issued books, matching desktop's own privacy redaction before publishing.
  val issueType: String = "person",
  val borrower: String = "",
  val borrowerAddress: String = "",
  val borrowerPhone: String = "",
  val toDepartment: String = "",
  val toAlmari: String = "",
  val dueDate: String = "",
  val borrowDays: Int? = null,
  val history: List<HistoryEntry> = emptyList(),
)

@Serializable
data class HistoryEntry(val date: String = "", val action: String = "", val detail: String = "")
