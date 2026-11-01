package de.kidsdaily365.launcher

import android.app.Application
import android.os.SystemClock
import android.provider.Settings

class LauncherApplication : Application() {
    val repository by lazy {
        ConnectedLauncher(HttpLauncherApi(), KeystorePrivateStore(this), object : LauncherClock {
            override fun wallMillis() = System.currentTimeMillis()
            override fun elapsedMillis() = SystemClock.elapsedRealtime()
            override fun bootCount() = Settings.Global.getInt(contentResolver, Settings.Global.BOOT_COUNT, -1)
        }, BuildConfig.DEBUG)
    }
}
