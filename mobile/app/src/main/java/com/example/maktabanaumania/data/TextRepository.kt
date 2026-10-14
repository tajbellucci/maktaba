package com.example.maktabanaumania.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.security.MessageDigest

interface TextRepository {
  suspend fun loadText(url: String): Result<String>
}

class DefaultTextRepository(private val context: Context, private val client: OkHttpClient = OkHttpClient()) : TextRepository {
  override suspend fun loadText(url: String): Result<String> =
    withContext(Dispatchers.IO) {
      val cacheFile = File(context.cacheDir, "text_${sha1(url)}.txt")
      runCatching {
          val request = Request.Builder().url(url).build()
          client.newCall(request).execute().use { response ->
            check(response.isSuccessful) { "HTTP ${response.code}" }
            response.body.string()
          }
        }
        .onSuccess { cacheFile.writeText(it) }
        .recoverCatching {
          if (cacheFile.exists()) cacheFile.readText() else throw it
        }
    }

  private fun sha1(input: String): String =
    MessageDigest.getInstance("SHA-1").digest(input.toByteArray()).joinToString("") { "%02x".format(it) }
}
