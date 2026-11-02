package de.kidsdaily365.launcher

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

fun fixture(): String = checkNotNull(LauncherProtocolTest::class.java.getResource("/launcher-v1.example.json")).readText()
fun snapshotFixture() = LauncherProtocol.snapshot(fixture())

class LauncherProtocolTest {
    @Test fun `v2 equipment survives offline serialization and never grants purchases`() {
        val raw = checkNotNull(javaClass.getResource("/launcher-v2.example.json")).readText()
        val s = LauncherProtocol.snapshot(raw)
        assertEquals(listOf("star-badge"), s.buddy.cosmeticIds)
        assertEquals(s, LauncherProtocol.snapshot(LauncherProtocol.encode(s)))
        val future = JSONObject(raw)
        future.getJSONObject("buddy").getJSONArray("cosmeticIds").put("future-item")
        assertEquals(2, LauncherProtocol.snapshot(future.toString()).buddy.cosmeticIds.size)
        future.getJSONObject("capabilities").put("purchases", true)
        assertThrows(ProtocolFailure::class.java) { LauncherProtocol.snapshot(future.toString()) }
        val malformed = JSONObject(raw)
        malformed.getJSONObject("buddy").getJSONArray("cosmeticIds").put(3)
        assertThrows(ProtocolFailure::class.java) { LauncherProtocol.snapshot(malformed.toString()) }
    }

    @Test fun `shared server fixture round trips without losing policy or identity`() {
        val s = snapshotFixture()
        assertEquals(s, LauncherProtocol.snapshot(LauncherProtocol.encode(s)))
        assertEquals(35L, s.stars)
        assertFalse(s.capabilities.taskCompletion)
    }

    @Test fun `unknown versions broadened capabilities and coerced flags fail closed`() {
        val mutations: List<(JSONObject) -> Unit> = listOf(
            { it.put("schemaVersion", 3) },
            { it.getJSONObject("capabilities").put("taskCompletion", true) },
            { it.getJSONObject("capabilities").put("administration", "false") },
            { it.getJSONObject("capabilities").remove("purchases") },
            { it.getJSONObject("policy").put("blockCamera", false) },
            { it.getJSONObject("policy").put("maxOfflineSeconds", 86401) },
            { it.put("stars", -1) }, { it.put("stars", "35") }, { it.put("stars", 3.5) },
            { it.getJSONObject("child").put("id", "wrong") },
            { it.getJSONObject("buddy").put("kind", "unknown") },
            { it.getJSONObject("buddy").getJSONArray("cosmeticIds").put("unsupported") },
            { it.put("tasks", emptyList<String>()) },
        )
        for (mutate in mutations) {
            val o = JSONObject(fixture()); mutate(o)
            assertThrows(ProtocolFailure::class.java) { LauncherProtocol.snapshot(o.toString()) }
        }
    }

    @Test fun `protected duplicate and malformed app packages are rejected`() {
        for (pkg in listOf("com.android.settings", "de.kidsdaily365.launcher", "https://example.test", "com.*")) {
            val o = JSONObject(fixture())
            o.getJSONObject("policy").getJSONArray("allowedApps").getJSONObject(0).put("packageName", pkg)
            assertThrows(ProtocolFailure::class.java) { LauncherProtocol.snapshot(o.toString()) }
        }
        val o = JSONObject(fixture())
        val apps = o.getJSONObject("policy").getJSONArray("allowedApps")
        apps.put(apps.getJSONObject(0))
        assertThrows(ProtocolFailure::class.java) { LauncherProtocol.snapshot(o.toString()) }
    }

    @Test fun `pairing rejects wall tokens and invalid credentials`() {
        val valid = JSONObject().put("token", "a".repeat(43)).put("deviceId", snapshotFixture().device.id).put("kind", "android").put("expiresIn", 7776000)
        assertEquals(7776000L, LauncherProtocol.pairing(valid.toString()).expiresIn)
        valid.put("kind", "wall")
        assertThrows(ProtocolFailure::class.java) { LauncherProtocol.pairing(valid.toString()) }
        valid.put("kind", "android").put("token", "invalid")
        assertThrows(ProtocolFailure::class.java) { LauncherProtocol.pairing(valid.toString()) }
    }

    @Test fun `release requires HTTPS debug HTTP is literal LAN only`() {
        assertEquals("https://kids.example:8443", ServerAddress.parse("https://kids.example:8443/", false).origin)
        assertEquals("http://10.0.2.2:3000", ServerAddress.parse("http://10.0.2.2:3000", true).origin)
        for (url in listOf("http://10.0.2.2:3000", "http://kids.example", "https://user:secret@kids.example", "https://kids.example/api", "https://kids.example/?x=1", "https://kids.example/#token", "file:///tmp/test", "https://kids.example:0")) {
            assertThrows(IllegalArgumentException::class.java) { ServerAddress.parse(url, false) }
        }
        for (url in listOf("http://10.0.0.1.example", "http://10.a.0.0.1", "http://8.8.8.8", "http://172.32.0.1", "http://10.999.0.1")) {
            assertThrows(IllegalArgumentException::class.java) { ServerAddress.parse(url, true) }
        }
    }
}
