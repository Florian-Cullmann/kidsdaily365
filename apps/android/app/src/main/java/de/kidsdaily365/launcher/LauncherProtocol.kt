package de.kidsdaily365.launcher

import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import java.time.Instant
import java.util.UUID

class ProtocolFailure : Exception("Ungültige Serverantwort. App-Starts bleiben gesperrt.")
class AccessRevoked : Exception("Die Gerätefreigabe ist abgelaufen oder wurde widerrufen.")

/** No redirects, credentials, paths or implicit HTTP downgrade in a server address. */
class ServerAddress private constructor(val origin: String) {
    companion object {
        fun parse(input: String, debug: Boolean): ServerAddress {
            val uri = try { URI(input.trim()) } catch (_: Exception) { throw IllegalArgumentException("Ungültige Serveradresse.") }
            val host = uri.host.orEmpty().lowercase()
            val ip = host.split('.').mapNotNull { it.toIntOrNull() }
            val privateIp = Regex("[0-9]{1,3}(?:\\.[0-9]{1,3}){3}").matches(host) && ip.size == 4 && ip.all { it in 0..255 } &&
                (ip[0] == 10 || ip[0] == 127 || (ip[0] == 192 && ip[1] == 168) || (ip[0] == 172 && ip[1] in 16..31))
            val secure = uri.scheme == "https"
            require(host.isNotEmpty() && uri.rawUserInfo == null && uri.rawQuery == null && uri.rawFragment == null &&
                (uri.rawPath.isNullOrEmpty() || uri.rawPath == "/") && uri.port in -1..65535 && uri.port != 0 &&
                (secure || (debug && uri.scheme == "http" && privateIp))) {
                "HTTPS-Adresse ohne Pfad eingeben. Nur die Debug-App erlaubt HTTP mit privater IP-Adresse."
            }
            return ServerAddress("${uri.scheme}://${uri.rawAuthority}")
        }
    }
}

data class Pairing(val token: String, val deviceId: String, val expiresIn: Long)

/** Strict boundary: never infer permissions from defaults or coerce JSON strings to booleans. */
object LauncherProtocol {
    private val tokenPattern = Regex("[A-Za-z0-9_-]{43}")
    private val packagePattern = Regex("[a-zA-Z][a-zA-Z0-9_]*(?:\\.[a-zA-Z][a-zA-Z0-9_]*)+")
    private val protectedPackages = setOf("android", "com.android.settings", "com.android.systemui",
        "com.android.packageinstaller", "com.google.android.packageinstaller", "com.android.permissioncontroller",
        "com.google.android.permissioncontroller", "de.kidsdaily365.launcher")

    fun validToken(token: String) = tokenPattern.matches(token)

    fun pairing(raw: String): Pairing = guarded {
        val o = JSONObject(raw)
        check(o.string("kind") == "android")
        val token = o.string("token").also { check(validToken(it)) }
        Pairing(token, o.uuid("deviceId"), o.integer("expiresIn", 1, 7_776_000))
    }

    fun snapshot(raw: String): LauncherSnapshot = guarded {
        val o = JSONObject(raw)
        check(o.keys().asSequence().toSet() == setOf("schemaVersion", "syncedAt", "pollAfterSeconds", "device", "child", "stars", "buddy", "policy", "capabilities"))
        check(o.integer("schemaVersion", 1, 1) == 1L)
        val syncedAt = o.string("syncedAt").also { Instant.parse(it) }
        check(o.integer("pollAfterSeconds", 5, 5) == 5L)
        val d = o.getJSONObject("device")
        val c = o.getJSONObject("child")
        val b = o.getJSONObject("buddy")
        val p = o.getJSONObject("policy")
        val caps = o.getJSONObject("capabilities")
        check(b.string("kind") in setOf("fox", "rabbit", "bear"))
        check(b.getJSONArray("cosmeticIds").length() == 0)
        check(p.string("desiredMode") == "managed-launcher")
        listOf("blockCamera", "blockOverview", "blockNotifications", "blockQuickSettings").forEach { check(p.bool(it)) }
        listOf("taskCompletion", "administration", "purchases").forEach { check(!caps.bool(it)) }
        val apps = p.getJSONArray("allowedApps")
        check(apps.length() <= 100)
        val allowedApps = (0 until apps.length()).map {
            val app = apps.getJSONObject(it)
            val pkg = app.string("packageName", 255).also { name ->
                check(packagePattern.matches(name) && name !in protectedPackages)
            }
            AllowedApp(pkg, app.string("label", 100))
        }
        check(allowedApps.map { it.packageName }.toSet().size == allowedApps.size)
        LauncherSnapshot(1, syncedAt, 5, Device(d.uuid("id"), d.string("label", 100)),
            Child(c.uuid("id"), c.string("name", 100), c.string("avatar", 20), c.bool("reducedMotion")),
            o.integer("stars", 0, 9_007_199_254_740_991), Buddy(b.string("kind"), b.string("name", 100), emptyList()),
            LauncherPolicy(p.string("revision", 256), allowedApps, "managed-launcher", true, true, true, true,
                p.integer("maxOfflineSeconds", 86_400, 86_400).toInt()), LauncherCapabilities())
    }

    fun encode(s: LauncherSnapshot): String = JSONObject().apply {
        put("schemaVersion", s.schemaVersion); put("syncedAt", s.syncedAt); put("pollAfterSeconds", s.pollAfterSeconds)
        put("device", JSONObject().put("id", s.device.id).put("label", s.device.label))
        put("child", JSONObject().put("id", s.child.id).put("name", s.child.name).put("avatar", s.child.avatar).put("reducedMotion", s.child.reducedMotion))
        put("stars", s.stars)
        put("buddy", JSONObject().put("kind", s.buddy.kind).put("name", s.buddy.name).put("cosmeticIds", JSONArray(s.buddy.cosmeticIds)))
        put("policy", JSONObject().put("revision", s.policy.revision).put("desiredMode", s.policy.desiredMode)
            .put("blockCamera", s.policy.blockCamera).put("blockOverview", s.policy.blockOverview)
            .put("blockNotifications", s.policy.blockNotifications).put("blockQuickSettings", s.policy.blockQuickSettings)
            .put("maxOfflineSeconds", s.policy.maxOfflineSeconds).put("allowedApps", JSONArray(s.policy.allowedApps.map {
                JSONObject().put("packageName", it.packageName).put("label", it.label)
            })))
        put("capabilities", JSONObject().put("taskCompletion", s.capabilities.taskCompletion)
            .put("administration", s.capabilities.administration).put("purchases", s.capabilities.purchases))
    }.toString()

    private fun JSONObject.string(key: String, max: Int = 256): String = (get(key) as? String ?: error("string")).also { check(it.length in 1..max) }
    private fun JSONObject.bool(key: String): Boolean = get(key) as? Boolean ?: error("boolean")
    private fun JSONObject.integer(key: String, min: Long, max: Long): Long {
        val value = get(key)
        check(value is Int || value is Long)
        return (value as Number).toLong().also { check(it in min..max) }
    }
    private fun JSONObject.uuid(key: String) = string(key).also { check(UUID.fromString(it).toString().equals(it, ignoreCase = true)) }
    private inline fun <T> guarded(block: () -> T): T = try { block() } catch (_: Exception) { throw ProtocolFailure() }
}
