package de.kidsdaily365.launcher

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import android.os.UserManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** Device-Owner-only foreground service. Enforcement never waits for a network request or repository lock. */
class PolicyService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val app get() = application as LauncherApplication
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onCreate() {
        super.onCreate()
        if (!app.policy.enabled || !app.policy.owner) { stopSelf(); return }
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("policy", "Geräteverwaltung", NotificationManager.IMPORTANCE_LOW))
        val home = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val notification = Notification.Builder(this, "policy").setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle("KidsDaily-Geräteverwaltung")
            .setContentText("Freigaben werden geprüft · zum Kindermodus zurückkehren")
            .setContentIntent(home).setOngoing(true).build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(20, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SYSTEM_EXEMPTED)
        else startForeground(20, notification)
        // No credentials or child data are read before the Android user unlocks after boot.
        scope.launch {
            while (isActive) {
                if (getSystemService(UserManager::class.java).isUserUnlocked) app.management.initialize()
                app.policy.reconcile(app.managedView)
                delay(500)
            }
        }
        scope.launch {
            val users = getSystemService(UserManager::class.java)
            while (isActive) {
                val started = SystemClock.elapsedRealtime()
                if (users.isUserUnlocked) {
                    try {
                        app.managedView = app.repository.current()
                        app.managedView = app.repository.refresh()
                        app.management.sync()
                    } catch (e: kotlinx.coroutines.CancellationException) { throw e }
                    catch (_: Exception) { app.managedView = null }
                }
                delay((5_000 - (SystemClock.elapsedRealtime() - started)).coerceAtLeast(100))
            }
        }
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY
    override fun onDestroy() { scope.cancel(); app.managedView = null; super.onDestroy() }
}
