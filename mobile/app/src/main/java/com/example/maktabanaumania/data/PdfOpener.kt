package com.example.maktabanaumania.data

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.security.MessageDigest

class PdfOpener(private val context: Context, private val client: OkHttpClient = OkHttpClient()) {
  suspend fun downloadAndGetIntent(url: String): Result<Intent> =
    withContext(Dispatchers.IO) {
      runCatching {
        val file = File(context.cacheDir, "pdf_${sha1(url)}.pdf")
        if (!file.exists()) {
          val request = Request.Builder().url(url).build()
          client.newCall(request).execute().use { response ->
            check(response.isSuccessful) { "HTTP ${response.code}" }
            file.outputStream().use { out -> response.body.byteStream().copyTo(out) }
          }
        }
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        Intent(Intent.ACTION_VIEW).apply {
          setDataAndType(uri, "application/pdf")
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
      }
    }

  private fun sha1(input: String): String =
    MessageDigest.getInstance("SHA-1").digest(input.toByteArray()).joinToString("") { "%02x".format(it) }
}
