package com.example.maktabanaumania.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File

// TEMP TEST — 2-book Urdu/Arabic font check via adb reverse; revert after.
private const val CATALOG_URL = "http://127.0.0.1:8123/books.json"
// private const val CATALOG_URL = "https://raw.githubusercontent.com/tajbellucci/maktaba/main/books.json"

private val json = Json { ignoreUnknownKeys = true }

interface DataRepository {
  suspend fun loadCatalog(): Result<Catalog>
}

class DefaultDataRepository(context: Context, private val client: OkHttpClient = OkHttpClient()) : DataRepository {
  private val cacheFile = File(context.filesDir, "books_cache.json")

  override suspend fun loadCatalog(): Result<Catalog> =
    withContext(Dispatchers.IO) {
      runCatching {
          val request = Request.Builder().url(CATALOG_URL).build()
          client.newCall(request).execute().use { response ->
            check(response.isSuccessful) { "HTTP ${response.code}" }
            response.body.string()
          }
        }
        .onSuccess { cacheFile.writeText(it) }
        .recoverCatching {
          if (cacheFile.exists()) cacheFile.readText() else throw it
        }
        .map { json.decodeFromString<Catalog>(it) }
    }
}
