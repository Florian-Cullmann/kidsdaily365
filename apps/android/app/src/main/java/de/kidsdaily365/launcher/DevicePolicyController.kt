package de.kidsdaily365.launcher

import android.app.Activity
import android.app.ActivityManager
import android.app.ActivityOptions
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.SystemClock
import android.os.UserManager
import android.provider.Settings

/** Only this local, parent-authorized controller changes Android policy; the child token cannot enable it. */
class DevicePolicyController(private val context: Context, private val maintenance: MaintenanceController) {
    private val manager = context.getSystemService(DevicePolicyManager::class.java)
    private val admin = ComponentName(context, LauncherAdminReceiver::class.java)
    private val home = ComponentName(context, MainActivity::class.java)
    private val prefs = context.createDeviceProtectedStorageContext().getSharedPreferences("managed-mode", Context.MODE_PRIVATE)
    private val lease = SettingsLease()
    private var applied: Set<String>? = null
    private var suspendedApplied: Set<String>? = null
    private var wasInSettings = false
    var remoteAppliedLocked = false; private set
    private val remote get() = (context.applicationContext as LauncherApplication).management
    var error: String? = null
        private set
    val owner get() = manager.isDeviceOwnerApp(context.packageName)
    val enabled get() = prefs.getBoolean("enabled", false)
    val inSettings get() = lease.active(SystemClock.elapsedRealtime(), bootCount())
    private fun bootCount() = Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT, -1)

    suspend fun activate(activity: Activity, view: LauncherView) {
        maintenance.requireOpen()
        val status = maintenance.status()
        require(owner) { "Zuerst als Device Owner auf einem dafür vorgesehenen Gerät provisionieren." }
        require(status.configured && !status.damaged && view.paired && view.canLaunch) {
            "Zuerst Eltern-Code einrichten und die Gerätefreigaben online bestätigen."
        }
        maintenance.requireOpen()
        require(!context.getSystemService(android.app.KeyguardManager::class.java).isDeviceSecure) {
            "Auf diesem dedizierten Gerät zuerst die Android-Bildschirmsperre entfernen. Der lokale Eltern-Code schützt die Wartung."
        }
        check(prefs.edit().putBoolean("enabled", true).commit())
        // The marker is committed first: process death during setup restores the restrictive baseline.
        reconcile(null, ensureHome = false)
        context.startForegroundService(Intent(context, PolicyService::class.java))
        enter(activity)
        check(error == null) { "Systemsperren konnten nicht vollständig gesetzt werden. Elternzugang bleibt verfügbar." }
    }

    fun reconcile(view: LauncherView?, ensureHome: Boolean = true) {
        if (!enabled || !owner) return
        if (inSettings) return
        val returning = wasInSettings
        wasInSettings = false
        val allowed = ManagedPolicy.apps(view, SystemClock.elapsedRealtime(), System.currentTimeMillis())
        val remoteLocked = if (context.getSystemService(UserManager::class.java).isUserUnlocked && remote.initialized) remote.locked
            else prefs.getBoolean("remote-locked", false)
        val packages = (if (remoteLocked) emptySet() else allowed) + context.packageName
        var contracted = false
        try {
            if (prefs.getBoolean("remote-locked", false) != remoteLocked) check(prefs.edit().putBoolean("remote-locked", remoteLocked).commit())
            val suspended = prefs.getStringSet("remote-suspended", emptySet())!!.toSet()
            if (remoteLocked) {
                val targets = (suspended + allowed + manager.getLockTaskPackages(admin)).filter { it != context.packageName }.toSet()
                if (suspendedApplied != targets || returning) {
                    // Persist before the platform call: a crash must not lose the list to restore.
                    check(prefs.edit().putStringSet("remote-suspended", targets).commit())
                    val installed = targets.filter { runCatching { context.packageManager.getApplicationInfo(it, 0) }.isSuccess }
                    check(manager.setPackagesSuspended(admin, installed.toTypedArray(), true).isEmpty()) { "Einige Apps konnten nicht pausiert werden." }
                    suspendedApplied = targets
                }
            } else if (suspended.isNotEmpty()) {
                check(manager.setPackagesSuspended(admin, suspended.filter { runCatching { context.packageManager.getApplicationInfo(it, 0) }.isSuccess }.toTypedArray(), false).isEmpty())
                check(prefs.edit().remove("remote-suspended").commit())
                suspendedApplied = null
            }
            remoteAppliedLocked = remoteLocked
            if (applied != packages || returning || error != null) {
                // Remove revoked running tasks before any other operation. Android finishes removed locked tasks.
                val old = manager.getLockTaskPackages(admin).toSet()
                contracted = (old - packages).isNotEmpty()
                manager.setLockTaskPackages(admin, (old.intersect(packages) + context.packageName).toTypedArray())
                manager.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_HOME or
                    DevicePolicyManager.LOCK_TASK_FEATURE_GLOBAL_ACTIONS or DevicePolicyManager.LOCK_TASK_FEATURE_KEYGUARD or
                    DevicePolicyManager.LOCK_TASK_FEATURE_BLOCK_ACTIVITY_START_IN_TASK)
                manager.setCameraDisabled(admin, true)
                manager.setKeyguardDisabledFeatures(admin, DevicePolicyManager.KEYGUARD_DISABLE_SECURE_CAMERA or
                    DevicePolicyManager.KEYGUARD_DISABLE_SECURE_NOTIFICATIONS or DevicePolicyManager.KEYGUARD_DISABLE_UNREDACTED_NOTIFICATIONS)
                // Status-bar policy does not cover the keyguard shade. Dedicated devices must not expose it.
                check(manager.setKeyguardDisabled(admin, true))
                check(manager.setStatusBarDisabled(admin, true))
                RESTRICTIONS.forEach { manager.addUserRestriction(admin, it) }
                manager.setUninstallBlocked(admin, context.packageName, true)
                manager.setUserControlDisabledPackages(admin, listOf(context.packageName))
                val filter = IntentFilter(Intent.ACTION_MAIN).apply {
                    addCategory(Intent.CATEGORY_HOME); addCategory(Intent.CATEGORY_DEFAULT)
                }
                manager.addPersistentPreferredActivity(admin, filter, home)
                manager.setLockTaskPackages(admin, packages.toTypedArray())
                applied = packages
                error = null
            }
            if (ensureHome && (returning || contracted || context.getSystemService(ActivityManager::class.java).lockTaskModeState != ActivityManager.LOCK_TASK_MODE_LOCKED)) {
                // Device Owners may start activities from the background. Never use screen pinning.
                launchHome()
            }
        } catch (failure: Exception) {
            if (error == null) android.util.Log.e("KidsDailyPolicy", "Device policy application failed", failure)
            applied = null; suspendedApplied = null
            error = "Systemsperren prüfen · Apps bleiben gesperrt. Elternzugang ist verfügbar."
            runCatching { manager.setLockTaskPackages(admin, arrayOf(context.packageName)) }
            if (ensureHome && context.getSystemService(ActivityManager::class.java).lockTaskModeState != ActivityManager.LOCK_TASK_MODE_LOCKED) {
                runCatching { launchHome() }
            }
        }
    }

    fun enter(activity: Activity) {
        if (enabled && owner && !inSettings && manager.isLockTaskPermitted(context.packageName)) {
            activity.startLockTask()
        }
    }

    fun launch(activity: Activity, packageName: String) {
        check(!remote.locked) { "Das Gerät ist pausiert." }
        check(!enabled || (owner && !inSettings && error == null && applied?.contains(packageName) == true))
        val intent = context.packageManager.getLaunchIntentForPackage(packageName)
            ?: throw android.content.ActivityNotFoundException()
        if (enabled) activity.startActivity(intent, ActivityOptions.makeBasic().setLockTaskEnabled(true).toBundle())
        else activity.startActivity(intent)
    }

    suspend fun openSettings(activity: Activity) {
        maintenance.requireOpen()
        if (!enabled) { activity.startActivity(Intent(Settings.ACTION_SETTINGS)); return }
        val status = maintenance.status()
        maintenance.requireOpen()
        require(owner)
        lease.begin(SystemClock.elapsedRealtime(), bootCount(), status.remainingSeconds)
        wasInSettings = true
        try {
            release(activity)
            activity.startActivity(Intent(Settings.ACTION_SETTINGS))
        } catch (e: Exception) { lease.clear(); reconcile(null); throw e }
    }

    /** A return to HOME ends external maintenance immediately, including an explicit notification tap. */
    fun returnedHome() {
        if (wasInSettings) { lease.clear(); reconcile(null) }
    }

    fun deactivate(activity: Activity) {
        maintenance.requireOpen()
        require(owner)
        lease.clear()
        // Keep the marker until all restrictions have been released successfully.
        release(activity, permanent = true)
        manager.clearPackagePersistentPreferredActivities(admin, context.packageName)
        check(prefs.edit().putBoolean("enabled", false).commit())
        wasInSettings = false; applied = null; error = null
        context.stopService(Intent(context, PolicyService::class.java))
    }

    private fun release(activity: Activity, permanent: Boolean = false) {
        activity.stopLockTask()
        manager.setLockTaskPackages(admin, emptyArray())
        RESTRICTIONS.forEach { manager.clearUserRestriction(admin, it) }
        manager.setCameraDisabled(admin, false)
        manager.setKeyguardDisabledFeatures(admin, 0)
        manager.setKeyguardDisabled(admin, false)
        manager.setStatusBarDisabled(admin, false)
        // Temporary settings access must not allow stopping the service that enforces its deadline.
        if (permanent) {
            val suspended = prefs.getStringSet("remote-suspended", emptySet())!!.toTypedArray()
            check(manager.setPackagesSuspended(admin, suspended, false).isEmpty())
            check(prefs.edit().remove("remote-suspended").commit())
                suspendedApplied = null
            remoteAppliedLocked = false
            manager.setUninstallBlocked(admin, context.packageName, false)
            manager.setUserControlDisabledPackages(admin, emptyList())
        }
        applied = null
    }

    private fun launchHome() {
        context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            ActivityOptions.makeBasic().setLockTaskEnabled(true).toBundle())
    }

    companion object {
        // Keep telephony and global power/emergency actions available.
        private val RESTRICTIONS = listOf(UserManager.DISALLOW_APPS_CONTROL, UserManager.DISALLOW_UNINSTALL_APPS,
            UserManager.DISALLOW_INSTALL_APPS, UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES_GLOBALLY,
            UserManager.DISALLOW_ADD_USER, UserManager.DISALLOW_USER_SWITCH, UserManager.DISALLOW_SAFE_BOOT,
            UserManager.DISALLOW_FACTORY_RESET, UserManager.DISALLOW_DEBUGGING_FEATURES,
            UserManager.DISALLOW_CONFIG_CREDENTIALS, UserManager.DISALLOW_CREATE_WINDOWS)
    }
}
