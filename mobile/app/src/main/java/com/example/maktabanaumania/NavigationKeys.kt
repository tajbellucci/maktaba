package com.example.maktabanaumania

import androidx.navigation3.runtime.NavKey
import kotlinx.serialization.Serializable

@Serializable data object HomeRoute : NavKey

@Serializable data object CatalogRoute : NavKey

@Serializable data class DetailRoute(val bookId: Int) : NavKey

@Serializable data class PreviewRoute(val fileUrl: String) : NavKey
