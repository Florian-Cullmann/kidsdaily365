package de.kidsdaily365.launcher

import android.app.Application
import android.os.SystemClock
import android.provider.Settings

class LauncherApplication : Application() {
    private val clock = object : LauncherClock {
        override fun wallMillis() = System.currentTimeMillis()
        override fun elapsedMillis() = SystemClock.elapsedRealtime()
        override fun bootCount() = Settings.Global.getInt(contentResolver, Settings.Global.BOOT_COUNT, -1)
    }
    private val api by lazy { HttpLauncherApi() }
    val maintenance by lazy { MaintenanceController(KeystorePrivateStore(this, "maintenance"), clock, api, BuildConfig.DEBUG) }
    val repository by lazy { ConnectedLauncher(api, KeystorePrivateStore(this), clock, BuildConfig.DEBUG, maintenance) }
}
