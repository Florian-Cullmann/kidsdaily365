package de.kidsdaily365.launcher

data class AllowedApp(val packageName: String, val label: String)
data class Buddy(val kind: String, val name: String, val cosmeticIds: List<String>)
data class Child(val id: String, val name: String, val avatar: String, val reducedMotion: Boolean)
data class Device(val id: String, val label: String)
data class LauncherCapabilities(
    val taskCompletion: Boolean = false,
    val administration: Boolean = false,
    val purchases: Boolean = false,
)
data class LauncherPolicy(
    val revision: String,
    val allowedApps: List<AllowedApp>,
    val desiredMode: String,
    val blockCamera: Boolean,
    val blockOverview: Boolean,
    val blockNotifications: Boolean,
    val blockQuickSettings: Boolean,
    val maxOfflineSeconds: Int,
)
data class LauncherSnapshot(
    val schemaVersion: Int,
    val syncedAt: String,
    val pollAfterSeconds: Int,
    val device: Device,
    val child: Child,
    val stars: Long,
    val buddy: Buddy,
    val policy: LauncherPolicy,
    val capabilities: LauncherCapabilities,
)
