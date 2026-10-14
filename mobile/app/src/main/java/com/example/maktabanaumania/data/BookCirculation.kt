package com.example.maktabanaumania.data

import java.time.LocalDate

/** Direct port of desktop's isOverdue() in renderer/app.js. */
fun Book.isOverdue(today: String = LocalDate.now().toString()): Boolean = status == "issued" && dueDate.isNotBlank() && dueDate < today

/**
 * Direct port of desktop's heldByLine(): who/where currently holds an issued book. Empty for a
 * non-issued book. Falls back to "borrowerHidden" wording when the borrower name was redacted
 * before publishing (desktop strips it unless publishBorrowerDetails is on) — same as desktop's
 * own reader view shows.
 */
fun Book.heldByLine(borrowerHiddenLabel: String): String =
  when {
    status != "issued" -> ""
    issueType == "department" -> toDepartment.ifBlank { "—" } + if (toAlmari.isNotBlank()) " · $toAlmari" else ""
    else -> borrower.ifBlank { borrowerHiddenLabel }
  }
