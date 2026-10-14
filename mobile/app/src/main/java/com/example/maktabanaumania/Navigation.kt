package com.example.maktabanaumania

import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import com.example.maktabanaumania.ui.catalog.CatalogScreen
import com.example.maktabanaumania.ui.detail.BookDetailScreen
import com.example.maktabanaumania.ui.home.HomeScreen
import com.example.maktabanaumania.ui.preview.TextPreviewScreen

@Composable
fun MainNavigation() {
  val backStack = rememberNavBackStack(HomeRoute)

  NavDisplay(
    backStack = backStack,
    onBack = { backStack.removeLastOrNull() },
    entryProvider =
      entryProvider {
        entry<HomeRoute> { HomeScreen(onOpenCatalog = { backStack.add(CatalogRoute) }, modifier = Modifier.safeDrawingPadding()) }
        entry<CatalogRoute> {
          CatalogScreen(onBookClick = { id -> backStack.add(DetailRoute(id)) }, modifier = Modifier.safeDrawingPadding().padding(16.dp))
        }
        entry<DetailRoute> { route ->
          BookDetailScreen(bookId = route.bookId, onReadBook = { fileUrl -> backStack.add(PreviewRoute(fileUrl)) }, modifier = Modifier.safeDrawingPadding())
        }
        entry<PreviewRoute> { route -> TextPreviewScreen(fileUrl = route.fileUrl, modifier = Modifier.safeDrawingPadding()) }
      },
  )
}
