package de.kidsdaily365.launcher

import android.app.Activity
import android.app.Instrumentation
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Intent
import android.graphics.Bitmap
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.PixelCopy
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Opt-in, disposable-emulator integration against a migrated fixture server, never a household server. */
internal fun managementScenario(runner: Instrumentation, server: String, report: (String, ByteArray) -> Unit) = runBlocking {
    check(server == "http://10.0.2.2:3122") { "Use the documented disposable fixture server only" }
    val context = runner.targetContext
    val app = context.applicationContext as LauncherApplication
    val manager = context.getSystemService(DevicePolicyManager::class.java)
    val admin = ComponentName(context, LauncherAdminReceiver::class.java)
    check(manager.isDeviceOwnerApp(context.packageName))
    fun parent(path: String, body: JSONObject? = null): JSONObject {
        val connection = URL(server + path).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 5000; connection.readTimeout = 5000
            connection.setRequestProperty("Cookie", "kidsdaily_parent=" + "p".repeat(43))
            connection.setRequestProperty("Origin", "http://127.0.0.1:3122")
            if (body != null) { connection.requestMethod = "POST"; connection.doOutput = true; connection.setRequestProperty("Content-Type", "application/json"); connection.outputStream.use { it.write(body.toString().toByteArray()) } }
            check(connection.responseCode in 200..299) { "Fixture parent HTTP ${connection.responseCode}" }
            return JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
        } finally { connection.disconnect() }
    }
    suspend fun capture(activity: Activity, name: String) {
        SystemClock.sleep(600)
        val bitmap = withContext(Dispatchers.Main) { Bitmap.createBitmap(activity.window.decorView.width, activity.window.decorView.height, Bitmap.Config.ARGB_8888) }
        val latch = CountDownLatch(1); var result = -1
        PixelCopy.request(activity.window, bitmap, { result = it; latch.countDown() }, Handler(Looper.getMainLooper()))
        check(latch.await(5, TimeUnit.SECONDS) && result == PixelCopy.SUCCESS)
        val bytes = java.io.ByteArrayOutputStream(); bitmap.compress(Bitmap.CompressFormat.PNG, 100, bytes); bitmap.recycle(); report(name, bytes.toByteArray())
    }
    val code = "fictional-parent-test-code".toCharArray()
    app.maintenance.status()
    app.repository.pair(server, "issue22-fictional-pairing")
    val target = checkNotNull(app.repository.maintenanceTarget())
    app.maintenance.rememberTarget(target)
    val maintenance = parent("/api/parent/devices/${target.deviceId}/maintenance-code", JSONObject())
    app.maintenance.setup(maintenance.getString("code"), code, code)
    app.managedView = app.repository.refresh()
    val home = runner.startActivitySync(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)) as MainActivity
    check(app.maintenance.unlock(code))
    withContext(Dispatchers.Main) { app.policy.activate(home, app.repository.current()) }
    check(app.maintenance.unlock(code))
    val path = "/api/parent/devices/${target.deviceId}/manage"
    val enrollment = parent(path, JSONObject().put("action", "enroll"))
    app.management.enroll(enrollment.getString("code")); app.management.sync(); app.management.sync()
    check(app.management.connected)
    check(parent(path).getJSONObject("state").getBoolean("ready"))
    parent(path, JSONObject().put("action", "message").put("data", JSONObject().put("requestId", UUID.randomUUID().toString()).put("body", "Du kannst uns auch während der Pause schreiben. 💚")))
    app.management.sync(); check(app.management.unread > 0)
    app.management.send("Okay, ich komme gleich! 😊")
    check(parent(path).getJSONArray("messages").toString().contains("Okay, ich komme gleich!"))
    withContext(Dispatchers.Main) { app.policy.launch(home, "com.google.android.deskclock") }
    SystemClock.sleep(800)
    val revision = parent(path).getJSONObject("state").getInt("revision")
    parent(path, JSONObject().put("action", "lock").put("data", JSONObject().put("locked", true).put("revision", revision)))
    app.management.sync(); app.management.sync()
    check(app.management.locked && app.policy.remoteAppliedLocked && app.policy.error == null)
    check(manager.isPackageSuspended(admin, "com.google.android.deskclock"))
    check(!manager.isLockTaskPermitted("com.google.android.deskclock"))
    check(parent(path).getJSONObject("state").getBoolean("appliedLocked"))
    val restored = DeviceManagementClient(context, app); restored.initialize(); check(restored.locked)
    SystemClock.sleep(1000); capture(home, "lock")
    val chat = runner.startActivitySync(Intent(context, MessagesActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) as MessagesActivity
    SystemClock.sleep(1500); capture(chat, "chat")
    check(app.maintenance.unlock(code))
    app.management.localRelease()
    check(!app.management.locked && !manager.isPackageSuspended(admin, "com.google.android.deskclock"))
    app.management.sync(); app.management.sync()
    check(!parent(path).getJSONObject("state").getBoolean("locked"))
    check(app.maintenance.unlock(code))
    withContext(Dispatchers.Main) { app.policy.deactivate(chat) }
    app.maintenance.close()
    report("result", "PASS: live pairing/enrollment; household chat both directions; remote lock acknowledged; running clock suspended; persisted lock reload; chat reachable during lock; local code release and server reconciliation; maintenance teardown. Audible audio requires physical-device testing.\n".toByteArray())
}
