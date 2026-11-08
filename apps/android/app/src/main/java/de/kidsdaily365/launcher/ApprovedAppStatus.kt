package de.kidsdaily365.launcher

import android.content.Context
import android.content.pm.PackageManager

/** Query only server-approved packages; never enumerate installed applications. */
object ApprovedAppStatus {
    fun check(context: Context, packageName: String): String = try {
        context.packageManager.getApplicationInfo(packageName, PackageManager.ApplicationInfoFlags.of(0))
        if (context.packageManager.getLaunchIntentForPackage(packageName) != null) "launchable" else "installed"
    } catch (_: PackageManager.NameNotFoundException) { "missing" }
      catch (_: Exception) { "unknown" }
}
