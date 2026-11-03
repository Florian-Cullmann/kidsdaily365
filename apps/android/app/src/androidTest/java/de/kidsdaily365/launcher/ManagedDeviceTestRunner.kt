package de.kidsdaily365.launcher

import android.app.Activity
import android.app.ActivityManager
import android.app.Instrumentation
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Intent
import android.graphics.Bitmap
import android.os.Bundle
import android.os.SystemClock
import android.os.UserManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.ServerSocket
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread

/** Explicit opt-in on a disposable emulator already provisioned as DO. Never run on a family phone. */
class ManagedDeviceTestRunner : Instrumentation() {
    private var reportPort: Int? = null
    private var leaveManaged = false
    override fun onCreate(arguments: Bundle?) {
        super.onCreate(arguments)
        reportPort = arguments?.getString("reportPort")?.toInt()?.also { require(it in 1024..65535) }
        leaveManaged = arguments?.getString("leaveManaged") == "true"
        start()
    }
    private fun report(path: String, bytes: ByteArray) {
        val port = reportPort ?: return
        val connection = java.net.URL("http://10.0.2.2:$port/$path").openConnection() as java.net.HttpURLConnection
        try {
            connection.connectTimeout = 3_000; connection.readTimeout = 3_000
            connection.requestMethod = "POST"; connection.doOutput = true
            connection.outputStream.use { it.write(bytes) }
            check(connection.responseCode == 200)
        } finally { connection.disconnect() }
    }
    override fun onStart() {
        val result = Bundle()
        try {
            check(android.os.Build.FINGERPRINT.contains("generic") || android.os.Build.MODEL.contains("sdk")) { "Disposable emulator only" }
            exercise()
            result.putString("stream", "Device Owner checks passed: lock task, camera, restrictions, live app removal, offline expiry, settings recovery, parent authorization.\n")
            report("result", result.getString("stream")!!.toByteArray())
            // finishInstrumentation force-stops its target. A boot probe must leave the app running normally
            // until the emulator is rebooted, otherwise Android intentionally excludes that stopped package.
            if (!leaveManaged) finish(Activity.RESULT_OK, result)
        } catch (e: Throwable) {
            result.putString("stream", "FAILED: ${e.stackTraceToString()}\n")
            runCatching { report("result", result.getString("stream")!!.toByteArray()) }
            finish(Activity.RESULT_CANCELED, result)
        }
    }

    private fun exercise() = runBlocking {
        val app = targetContext.applicationContext as LauncherApplication
        val manager = targetContext.getSystemService(DevicePolicyManager::class.java)
        val admin = ComponentName(targetContext, LauncherAdminReceiver::class.java)
        check(manager.isDeviceOwnerApp(targetContext.packageName)) { "Provision the disposable emulator first" }
        val fixture = JSONObject(context.assets.open("launcher-v2.example.json").bufferedReader().readText())
        fixture.getJSONObject("policy").getJSONArray("allowedApps").getJSONObject(0)
            .put("packageName", "com.google.android.deskclock").put("label", "Test-Uhr")
        val status = AtomicInteger(200)
        val server = ServerSocket(0)
        val worker = thread(isDaemon = true) {
            while (!server.isClosed) {
                val socket = try { server.accept() } catch (_: Exception) { break }
                socket.use {
                    val reader = it.getInputStream().bufferedReader()
                    val request = reader.readLine().orEmpty()
                    var length = 0
                    while (true) {
                        val line = reader.readLine() ?: break
                        if (line.isEmpty()) break
                        if (line.startsWith("Content-Length:", true)) length = line.substringAfter(':').trim().toInt()
                    }
                    repeat(length) { reader.read() }
                    val code = if (request.contains("/snapshot")) status.get() else 200
                    val body = when {
                        request.contains("/pair") -> JSONObject().put("kind", "android").put("deviceId", fixture.getJSONObject("device").getString("id"))
                            .put("token", "a".repeat(43)).put("expiresIn", 7776000).toString()
                        request.contains("/maintenance") -> JSONObject().put("schemaVersion", 1).put("authorized", true)
                            .put("deviceId", fixture.getJSONObject("device").getString("id")).toString()
                        code == 200 -> fixture.toString()
                        else -> "{}"
                    }.toByteArray()
                    it.getOutputStream().write("HTTP/1.1 $code Test\r\nContent-Type: application/json\r\nContent-Length: ${body.size}\r\nConnection: close\r\n\r\n".toByteArray())
                    it.getOutputStream().write(body)
                }
            }
        }
        val secret = "fictional-parent-test-code".toCharArray()
        var activity: MainActivity? = null
        var completed = false
        var originalFailure: Throwable? = null
        try {
            app.maintenance.status()
            if (app.maintenance.status().configured) {
                check(app.maintenance.unlock(secret)) { "Use a fresh emulator installation" }
                app.repository.reset()
            }
            app.repository.pair("http://127.0.0.1:${server.localPort}", "fictional")
            app.maintenance.rememberTarget(app.repository.maintenanceTarget())
            app.maintenance.setup("a".repeat(32), secret, secret)
            app.repository.refresh()
            activity = startActivitySync(Intent(targetContext, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)) as MainActivity
            SystemClock.sleep(1_000)
            check(app.maintenance.unlock(secret))
            withContext(Dispatchers.Main) { app.policy.activate(activity, app.repository.current()) }
            SystemClock.sleep(2_000)
            check(app.policy.error == null) { app.policy.error.orEmpty() }
            check(manager.getCameraDisabled(admin))
            val features = manager.getLockTaskFeatures(admin)
            check(features and DevicePolicyManager.LOCK_TASK_FEATURE_OVERVIEW == 0)
            check(features and DevicePolicyManager.LOCK_TASK_FEATURE_NOTIFICATIONS == 0)
            check(features and DevicePolicyManager.LOCK_TASK_FEATURE_BLOCK_ACTIVITY_START_IN_TASK != 0)
            check(features and DevicePolicyManager.LOCK_TASK_FEATURE_KEYGUARD != 0)
            check(features and DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS != 0)
            check(manager.getUserRestrictions(admin).getBoolean(UserManager.DISALLOW_APPS_CONTROL))
            check(targetContext.getSystemService(ActivityManager::class.java).lockTaskModeState == ActivityManager.LOCK_TASK_MODE_LOCKED)
            check(manager.getLockTaskPackages(admin).toSet() == setOf(targetContext.packageName, "com.google.android.deskclock"))
            check(!manager.isLockTaskPermitted("com.android.settings"))
            // Screenshot of actual UI before exercising external tasks; no pairing or parent codes.
            val bitmap = withContext(Dispatchers.Main) {
                Bitmap.createBitmap(activity.window.decorView.width, activity.window.decorView.height, Bitmap.Config.ARGB_8888)
            }
            val copied = java.util.concurrent.CountDownLatch(1)
            var copyResult = -1
            android.view.PixelCopy.request(activity.window, bitmap, { copyResult = it; copied.countDown() }, android.os.Handler(android.os.Looper.getMainLooper()))
            check(copied.await(5, java.util.concurrent.TimeUnit.SECONDS) && copyResult == android.view.PixelCopy.SUCCESS)
            targetContext.openFileOutput("managed-proof.png", 0).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
            val image = java.io.ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, image)
            report("proof", image.toByteArray()); bitmap.recycle()
            withContext(Dispatchers.Main) { app.policy.launch(activity, "com.google.android.deskclock") }
            SystemClock.sleep(1_500)
            check(withContext(Dispatchers.Main) { !activity.hasWindowFocus() })
            report("allowed-clock", "capture".toByteArray())
            // Server contact revokes a running app. The service must act while HOME is paused.
            status.set(401)
            SystemClock.sleep(6_000)
            check(manager.getLockTaskPackages(admin).toSet() == setOf(targetContext.packageName))
            check(withContext(Dispatchers.Main) { activity.hasWindowFocus() })
            check(!app.repository.current().paired)
            // An expired captured view must contract policy without waiting for a server response.
            val expired = LauncherView(true, LauncherProtocol.snapshot(fixture.toString()), true, "", 1,
                1, 2, Long.MAX_VALUE)
            withContext(Dispatchers.Main) { app.policy.reconcile(expired) }
            check(manager.getLockTaskPackages(admin).toSet() == setOf(targetContext.packageName))
            app.maintenance.close()
            try {
                withContext(Dispatchers.Main) { app.policy.deactivate(activity) }
                error("Unauthenticated deactivation accepted")
            } catch (_: MaintenanceLocked) { }
            check(app.maintenance.unlock(secret))
            withContext(Dispatchers.Main) { app.policy.openSettings(activity) }
            SystemClock.sleep(1_000)
            check(app.policy.inSettings)
            check(!manager.getCameraDisabled(admin))
            report("settings", "capture".toByteArray())
            check(withContext(Dispatchers.Main) { !activity.hasWindowFocus() })
            // Losing the process-local lease restores persisted restrictions even without a child token.
            val restarted = DevicePolicyController(targetContext, app.maintenance)
            withContext(Dispatchers.Main) { restarted.reconcile(null) }
            SystemClock.sleep(1_000)
            check(manager.getCameraDisabled(admin))
            check(manager.getLockTaskPackages(admin).toSet() == setOf(targetContext.packageName))
            withContext(Dispatchers.Main) { activity.startActivity(Intent(android.provider.Settings.ACTION_SETTINGS)) }
            SystemClock.sleep(500)
            check(targetContext.getSystemService(ActivityManager::class.java).lockTaskModeState == ActivityManager.LOCK_TASK_MODE_LOCKED)
            // Host captures the actual Android denial dialog; no parent or pairing credentials are visible.
            report("blocked-settings", "capture".toByteArray())
            SystemClock.sleep(500)
            if (leaveManaged) {
                // Explicit emulator-only boot probe: retain real policy, then stop the fixture server.
                status.set(200)
                check(app.maintenance.unlock(secret))
                app.repository.pair("http://127.0.0.1:${server.localPort}", "fictional")
                app.managedView = app.repository.refresh()
                withContext(Dispatchers.Main) {
                    app.policy.reconcile(app.managedView)
                    activity.startActivity(Intent(targetContext, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP))
                }
            }
            completed = true
        } catch (failure: Throwable) {
            originalFailure = failure
            throw failure
        } finally {
            var cleanupFailure: Throwable? = null
            if (activity != null && app.policy.enabled && !(leaveManaged && completed)) {
                try {
                    check(app.maintenance.unlock(secret))
                    withContext(Dispatchers.Main) { app.policy.deactivate(activity) }
                    // Test APK only: restore the emulator transport AFTER releasing the real debugging restriction.
                    manager.setGlobalSetting(admin, android.provider.Settings.Global.ADB_ENABLED, "1")
                } catch (cleanup: Exception) { cleanupFailure = cleanup }
            }
            secret.fill('\u0000'); server.close(); worker.join(1_000)
            cleanupFailure?.let { failure -> originalFailure?.addSuppressed(failure) ?: throw failure }
        }
    }
}
