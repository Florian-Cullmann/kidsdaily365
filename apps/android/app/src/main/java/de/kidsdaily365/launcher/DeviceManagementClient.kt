package de.kidsdaily365.launcher

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

/** Separate parent-enrolled capability. Launcher tokens are never sent to these endpoints. */
class DeviceManagementClient(private val context: Context, private val app: LauncherApplication) {
    private val store = KeystorePrivateStore(context, "management")
    private val api = HttpLauncherApi()
    private val usage = UsageCollector(context)
    private val mutex = Mutex()
    @Volatile var initialized = false; private set
    private var statusPackages: List<String>? = null
    private var state = JSONObject()
    @Volatile var locked = false; private set
    @Volatile var connected = false; private set
    @Volatile var unread = 0; private set
    @Volatile var status = "Nachrichten noch nicht eingerichtet"; private set
    private fun load() {
        if (initialized) return
        try { state = JSONObject(store.read() ?: "{}"); locked = state.optBoolean("locked"); connected = state.has("token") }
        catch (_: Exception) { locked = true; status = "Verwaltungsspeicher prüfen · Elternzugang verwenden" }
        initialized = true
    }
    private fun save() { store.write(state.toString()) }
    private fun request(server: ServerAddress, path: String, token: String?, body: String?, method: String = "POST"): String {
        try { return api.request(server, path, token, body, method) }
        catch (e: AccessRevoked) { clearAccess(); throw e }
    }
    suspend fun initialize() = withContext(Dispatchers.IO) { mutex.withLock { load() } }
    suspend fun enroll(code: String) = withContext(Dispatchers.IO) { mutex.withLock {
        load(); app.maintenance.requireOpen()
        val target = app.repository.maintenanceTarget() ?: error("Zuerst das Handy koppeln.")
        check(app.policy.owner && app.policy.enabled) { "Zuerst den verwalteten Kindermodus aktivieren." }
        val response = JSONObject(request(target.server, "/api/device/manage/enroll", null,
            JSONObject().put("deviceId", target.deviceId).put("code", code.trim()).toString()))
        check(response.getInt("schemaVersion") == 1 && response.getString("deviceId") == target.deviceId)
        val token = response.getString("token"); check(LauncherProtocol.validToken(token))
        val now = System.currentTimeMillis()
        val sameDevice = state.optString("deviceId") == target.deviceId
        // Preserve a pending local release/lock across capability rotation for this device.
        if (!sameDevice) state = JSONObject().put("revision", -1).put("locked", locked)
        state.put("token", token).put("server", target.server.origin).put("deviceId", target.deviceId)
            .put("childId", response.getString("childId"))
        if (!state.has("cursor")) state.put("cursor", now).put("since", now)
        statusPackages = null
        save(); connected = true; status = "Dashboard verbunden"
    } }
    suspend fun localRelease() = withContext(Dispatchers.IO) { mutex.withLock {
        load(); app.maintenance.requireOpen()
        state.put("locked", false).put("localRelease", true); save(); locked = false
        withContext(Dispatchers.Main) { app.policy.reconcile(app.managedView) }
    } }
    private suspend fun target(): ServerAddress {
        val bound = app.repository.maintenanceTarget()
        if (bound?.deviceId != state.optString("deviceId") || bound.server.origin != state.optString("server")) {
            clearAccess(); error("Gerätezuordnung geändert. Dashboard erneut verbinden.")
        }
        check(connected) { "Dashboard noch nicht verbunden." }
        return bound.server
    }
    private fun clearAccess() {
        statusPackages = null
        state.remove("token"); state.remove("messages"); state.remove("draft"); state.remove("pending");
        save(); connected = false; unread = 0
    }
    suspend fun disconnect() = withContext(Dispatchers.IO) { mutex.withLock { load(); clearAccess() } }
    suspend fun sync() = withContext(Dispatchers.IO) { mutex.withLock {
        load(); if (!connected) return@withLock
        try {
            val server = target()
            val batch = usage.collect(state.optLong("cursor", System.currentTimeMillis()),
                state.optJSONArray("cursorKeys")?.let { a -> (0 until a.length()).map { a.getString(it) }.toSet() } ?: emptySet())
            val permission = usage.permitted()
            if (permission != state.optBoolean("usagePermission")) {
                val at = Instant.ofEpochMilli(state.optLong("cursor", batch.cursor)).toString()
                val transition = JSONObject().put("key", "permission-${batch.cursor}-$permission").put("at", at)
                    .put("kind", "shutdown").put("packageName", "").put("label", "Nutzungszugriff geändert")
                batch.events.put(transition)
                if (permission && context.getSystemService(android.os.PowerManager::class.java).isInteractive) {
                    val observed = System.currentTimeMillis()
                    batch.events.put(JSONObject().put("key", "screen-observed-$observed").put("at", Instant.ofEpochMilli(observed).toString())
                        .put("kind", "screen-on").put("packageName", "").put("label", "Bildschirm"))
                }
            }
            val ready = app.policy.enabled && app.policy.owner && app.maintenance.status().configured
            val data = JSONObject().put("revision", state.optInt("revision", -1)).put("appliedLocked", app.policy.remoteAppliedLocked)
                .put("localRelease", state.optBoolean("localRelease")).put("ready", ready).put("usagePermission", usage.permitted())
                .put("usageSince", Instant.ofEpochMilli(state.optLong("since", batch.cursor)).toString())
                .put("usageThrough", if (usage.permitted()) Instant.ofEpochMilli(batch.through).toString() else JSONObject.NULL)
                .put("error", app.policy.error ?: JSONObject.NULL).put("events", batch.events)
            statusPackages?.let { packages ->
                data.put("appStatuses", JSONArray(packages.map { name ->
                    JSONObject().put("packageName", name).put("status", ApprovedAppStatus.check(context, name))
                        .put("checkedAt", Instant.now().toString())
                }))
            }
            val response = JSONObject(request(server, "/api/device/manage/sync", state.getString("token"), data.toString()))
            check(response.getInt("schemaVersion") == 1)
            statusPackages = if (response.optInt("appStatusVersion") == 1) {
                val packages = response.getJSONArray("appStatusPackages")
                check(packages.length() <= 200)
                (0 until packages.length()).map { packages.getString(it) }
            } else null
            val revision = response.getInt("revision"); check(revision >= state.optInt("revision", -1))
            val nextLocked = response.getBoolean("locked")
            state.put("revision", revision).put("locked", nextLocked).put("localRelease", false)
                .put("cursor", batch.cursor).put("cursorKeys", JSONArray(batch.keys.toList())).put("usagePermission", permission)
            save(); locked = nextLocked
            withContext(Dispatchers.Main) { app.policy.reconcile(app.managedView) }
            fetchMessages(server); status = "Mit deinen Eltern verbunden"
        } catch (e: kotlinx.coroutines.CancellationException) { throw e }
        catch (_: AccessRevoked) { clearAccess(); status = "Dashboard-Zugang beendet. Elternzugang verwenden." }
        catch (_: Exception) { statusPackages = null; status = "Offline · Nachrichten bleiben gespeichert" }
    } }
    private fun fetchMessages(server: ServerAddress): JSONObject {
        val response = JSONObject(request(server, "/api/device/manage/messages", state.getString("token"), null))
        val messages = response.getJSONArray("messages")
        state.put("messages", messages).put("before", response.opt("before") ?: JSONObject.NULL); save()
        unread = (0 until messages.length()).count { messages.getJSONObject(it).let { m -> m.getString("sender") == "parent" && m.isNull("readAt") } }
        return response
    }
    suspend fun messages(before: String? = null): JSONObject = withContext(Dispatchers.IO) { mutex.withLock {
        load(); val server = target()
        try {
            if (before != null) JSONObject(request(server, "/api/device/manage/messages?before=" + java.net.URLEncoder.encode(before, "UTF-8"), state.getString("token"), null))
            else fetchMessages(server)
        } catch (e: AccessRevoked) { clearAccess(); throw e }
        catch (e: Exception) {
            if (before != null) throw e
            status = "Offline · letzter gespeicherter Verlauf"
            JSONObject().put("messages", state.optJSONArray("messages") ?: JSONArray()).put("before", state.opt("before") ?: JSONObject.NULL)
        }
    } }
    suspend fun read(ids: List<String>) = withContext(Dispatchers.IO) { mutex.withLock {
        load(); if (ids.isEmpty()) return@withLock
        request(target(), "/api/device/manage/messages", state.getString("token"), JSONObject().put("ids", JSONArray(ids)).toString(), "PATCH")
        unread = 0
    } }
    suspend fun draft(): String = withContext(Dispatchers.IO) { mutex.withLock { load(); state.optString("draft") } }
    suspend fun saveDraft(value: String) = withContext(Dispatchers.IO) { mutex.withLock { load(); state.put("draft", value.take(2000)); save() } }
    suspend fun send(text: String) = withContext(Dispatchers.IO) { mutex.withLock {
        load(); val server = target(); val body = text.trim(); require(body.length in 1..2000)
        var pending = state.optJSONObject("pending")
        if (pending == null || pending.getString("body") != body) pending = JSONObject().put("body", body).put("requestId", UUID.randomUUID().toString())
        state.put("pending", pending).put("draft", text); save()
        request(server, "/api/device/manage/messages", state.getString("token"), pending.toString())
        state.remove("pending"); state.remove("draft"); save(); fetchMessages(server)
    } }
}
