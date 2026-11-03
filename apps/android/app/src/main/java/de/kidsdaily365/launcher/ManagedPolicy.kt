package de.kidsdaily365.launcher

/** A copied view must expire even while a slow HTTP request holds the repository mutex. */
object ManagedPolicy {
    fun apps(view: LauncherView?, elapsed: Long, wall: Long): Set<String> {
        if (view == null || !view.paired || !view.canLaunch || elapsed < view.validFromElapsed ||
            elapsed >= view.validUntilElapsed || wall >= view.tokenExpiresAt) return emptySet()
        return view.snapshot?.policy?.allowedApps?.map { it.packageName }?.toSet().orEmpty()
    }
}

/** An external settings session is separate from the in-app credential session, never persisted. */
class SettingsLease {
    private var until = 0L
    private var boot = -1
    fun begin(elapsed: Long, bootCount: Int, remainingSeconds: Long) {
        require(bootCount >= 0 && remainingSeconds > 0)
        boot = bootCount
        until = elapsed + minOf(remainingSeconds * 1_000, 300_000)
    }
    fun active(elapsed: Long, bootCount: Int) = boot >= 0 && boot == bootCount && elapsed >= 0 && elapsed < until
    fun clear() { until = 0; boot = -1 }
}
