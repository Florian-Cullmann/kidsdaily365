package de.kidsdaily365.launcher

import android.app.admin.DeviceAdminReceiver
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class LauncherAdminReceiver : DeviceAdminReceiver()

/** Only protected system broadcasts are accepted; provisioning alone never enables restrictions. */
class PolicyBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action !in setOf(Intent.ACTION_LOCKED_BOOT_COMPLETED, Intent.ACTION_BOOT_COMPLETED,
                Intent.ACTION_MY_PACKAGE_REPLACED, Intent.ACTION_USER_UNLOCKED)) return
        val app = context.applicationContext as LauncherApplication
        if (app.policy.enabled && app.policy.owner) {
            app.policy.reconcile(null)
            context.startForegroundService(Intent(context, PolicyService::class.java))
        }
    }
}
