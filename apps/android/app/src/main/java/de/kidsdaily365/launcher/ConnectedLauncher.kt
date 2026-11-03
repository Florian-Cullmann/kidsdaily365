package de.kidsdaily365.launcher

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException

interface LauncherClock {
    fun wallMillis(): Long
    fun elapsedMillis(): Long
    fun bootCount(): Int
}

interface PrivateStore {
    fun read(): String?
    fun write(value: String)
    fun clear()
}

data class LauncherView(val paired: Boolean, val snapshot: LauncherSnapshot?, val canLaunch: Boolean,
    val status: String, val receivedAt: Long?, val validFromElapsed: Long = 0,
    val validUntilElapsed: Long = 0, val tokenExpiresAt: Long = 0)

private data class Connection(val server: ServerAddress, val token: String, val deviceId: String,
    val expiresAt: Long, val childId: String? = null, val snapshot: LauncherSnapshot? = null,
    val receivedAt: Long = 0, val elapsedAt: Long = -1, val bootCount: Int = -1)

/** One application-scoped repository serializes reset, pairing and refresh, including Activity recreation. */
class ConnectedLauncher(private val api: LauncherApi, private val store: PrivateStore,
    private val clock: LauncherClock, private val debug: Boolean, private val access: MaintenanceAccess) {
    private val mutex = Mutex()
    private var loaded = false
    private var connection: Connection? = null
    private var message = "Verbinde dich mit dem Server."

    suspend fun current(): LauncherView = locked { load(); view() }
    suspend fun maintenanceTarget(): MaintenanceTarget? = locked { load(); connection?.let { MaintenanceTarget(it.server, it.deviceId) } }

    suspend fun pair(address: String, code: String): LauncherView = locked {
        load()
        check(connection == null) { "Bestehende Verbindung zuerst trennen." }
        access.requirePairingAllowed()
        val server = ServerAddress.parse(address, debug)
        val pairing = api.pair(server, code)
        access.requirePairingAllowed()
        // Persist immediately: a consumed one-use code must survive a failed first snapshot request.
        val next = Connection(server, pairing.token, pairing.deviceId, clock.wallMillis() + pairing.expiresIn * 1000)
        save(next)
        message = "Verbunden. Daten werden geladen …"
        view()
    }

    suspend fun refresh(): LauncherView = locked {
        load()
        val previous = connection ?: return@locked view()
        if (clock.wallMillis() >= previous.expiresAt) {
            disconnect("Die Gerätefreigabe ist abgelaufen. Bitte neu verbinden.")
            return@locked view()
        }
        try {
            val snapshot = api.snapshot(previous.server, previous.token)
            if (snapshot.device.id != previous.deviceId || (previous.childId != null && snapshot.child.id != previous.childId)) throw ProtocolFailure()
            save(previous.copy(childId = snapshot.child.id, snapshot = snapshot, receivedAt = clock.wallMillis(),
                elapsedAt = clock.elapsedMillis(), bootCount = clock.bootCount()))
            message = "Mit dem Server verbunden"
        } catch (_: AccessRevoked) {
            disconnect("Die Gerätefreigabe wurde beendet. Bitte mit einem neuen Code verbinden.")
        } catch (_: ProtocolFailure) {
            // Persist the rejection. Restarting must not restore a previously accepted launch list.
            save(previous.copy(snapshot = null))
            message = "Ungültige Serverantwort. App-Starts bleiben gesperrt."
        } catch (_: IOException) {
            if (connection != null) message = "Server gerade nicht erreichbar · letzter gespeicherter Stand"
        }
        view()
    }

    suspend fun reset(): LauncherView = locked { access.requireOpen(); load(); disconnect("Verbindung getrennt."); view() }

    /** Rechecked at tap time, not only when the app buttons were drawn. */
    suspend fun mayLaunch(packageName: String): Boolean = locked {
        load()
        validCache() && connection?.snapshot?.policy?.allowedApps?.any { it.packageName == packageName } == true
    }

    private suspend fun <T> locked(block: () -> T): T = withContext(Dispatchers.IO) { mutex.withLock { block() } }

    private fun load() {
        if (loaded) return
        loaded = true
        try {
            val raw = store.read() ?: return
            val o = JSONObject(raw)
            check(o.getInt("version") == 1)
            val token = o.getString("token").also { check(LauncherProtocol.validToken(it)) }
            val snapshot = if (o.isNull("snapshot")) null else LauncherProtocol.snapshot(o.getString("snapshot"))
            val childId = if (o.isNull("childId")) null else o.getString("childId")
            val deviceId = o.getString("deviceId")
            check(snapshot == null || (snapshot.device.id == deviceId && snapshot.child.id == childId))
            connection = Connection(ServerAddress.parse(o.getString("server"), debug), token, deviceId,
                o.getLong("expiresAt"), childId, snapshot, o.getLong("receivedAt"), o.getLong("elapsedAt"), o.getInt("bootCount"))
            message = "Gespeicherter Stand · Verbindung wird geprüft"
        } catch (_: Exception) {
            disconnect("Gespeicherte Verbindung nicht lesbar. Bitte neu verbinden.")
        }
    }

    private fun save(next: Connection) {
        val raw = JSONObject().put("version", 1).put("server", next.server.origin).put("token", next.token)
            .put("deviceId", next.deviceId).put("expiresAt", next.expiresAt).put("childId", next.childId ?: JSONObject.NULL)
            .put("snapshot", next.snapshot?.let { LauncherProtocol.encode(it) } ?: JSONObject.NULL)
            .put("receivedAt", next.receivedAt).put("elapsedAt", next.elapsedAt).put("bootCount", next.bootCount).toString()
        try { store.write(raw) }
        catch (e: Exception) {
            disconnect("Verbindung konnte nicht sicher gespeichert werden. Bitte neu verbinden.")
            throw e
        }
        connection = next
    }

    private fun disconnect(reason: String) {
        connection = null
        message = reason
        store.clear()
    }

    private fun validCache(): Boolean {
        val c = connection ?: return false
        val snapshot = c.snapshot ?: return false
        val age = clock.elapsedMillis() - c.elapsedAt
        return c.bootCount >= 0 && c.bootCount == clock.bootCount() && age >= 0 &&
            age < snapshot.policy.maxOfflineSeconds * 1000L && clock.wallMillis() < c.expiresAt
    }

    private fun view(): LauncherView {
        val c = connection
        val valid = validCache()
        val status = if (c?.snapshot != null && !valid) "Freigaben müssen online bestätigt werden. App-Starts pausiert." else message
        return LauncherView(c != null, c?.snapshot, valid, status, c?.receivedAt?.takeIf { it > 0 },
            c?.elapsedAt ?: 0, c?.let { it.elapsedAt + (it.snapshot?.policy?.maxOfflineSeconds ?: 0) * 1000L } ?: 0,
            c?.expiresAt ?: 0)
    }
}
