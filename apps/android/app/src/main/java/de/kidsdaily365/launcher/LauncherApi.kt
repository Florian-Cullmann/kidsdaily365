package de.kidsdaily365.launcher

import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

interface LauncherApi {
    fun pair(server: ServerAddress, code: String): Pairing
    fun snapshot(server: ServerAddress, token: String): LauncherSnapshot
}

class HttpFailure(val status: Int) : IOException("Serveranfrage fehlgeschlagen ($status).")

/** Fixed native endpoints, no cookie manager, no redirects or TLS exceptions. Call off the UI thread. */
class HttpLauncherApi : LauncherApi {
    override fun pair(server: ServerAddress, code: String): Pairing {
        require(code.trim().length in 1..256) { "Gerätecode eingeben." }
        val body = JSONObject().put("code", code.trim()).put("kind", "android").toString()
        return LauncherProtocol.pairing(request(server, "/api/device/pair", null, body))
    }

    override fun snapshot(server: ServerAddress, token: String): LauncherSnapshot {
        require(LauncherProtocol.validToken(token))
        return LauncherProtocol.snapshot(request(server, "/api/launcher/snapshot", token, null))
    }

    private fun request(server: ServerAddress, path: String, token: String?, body: String?): String {
        val connection = URL(server.origin + path).openConnection() as HttpURLConnection
        try {
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 8_000
            connection.readTimeout = 8_000
            connection.useCaches = false
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Cache-Control", "no-store")
            token?.let { connection.setRequestProperty("Authorization", "Bearer $it") }
            if (body != null) {
                connection.requestMethod = "POST"
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                val bytes = body.toByteArray(Charsets.UTF_8)
                connection.setFixedLengthStreamingMode(bytes.size)
                connection.outputStream.use { it.write(bytes) }
            }
            val status = connection.responseCode
            if (token != null && status in listOf(401, 403)) throw AccessRevoked()
            if (status !in 200..299) throw HttpFailure(status)
            if (connection.contentType?.substringBefore(';')?.trim()?.lowercase() != "application/json") throw ProtocolFailure()
            if (connection.contentLengthLong > MAX_RESPONSE_BYTES) throw ProtocolFailure()
            val bytes = connection.inputStream.use { it.readNBytes(MAX_RESPONSE_BYTES + 1) }
            if (bytes.size > MAX_RESPONSE_BYTES) throw ProtocolFailure()
            return bytes.toString(Charsets.UTF_8)
        } finally {
            connection.disconnect()
        }
    }

    companion object { const val MAX_RESPONSE_BYTES = 65_536 }
}
