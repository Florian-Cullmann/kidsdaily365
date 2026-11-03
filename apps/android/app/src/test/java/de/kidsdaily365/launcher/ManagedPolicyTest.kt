package de.kidsdaily365.launcher

import org.junit.Assert.*
import org.junit.Test

class ManagedPolicyTest {
    private val view = LauncherView(true, snapshotFixture(), true, "", 100,
        validFromElapsed = 1_000, validUntilElapsed = 10_000, tokenExpiresAt = 100_000)
    @Test fun `stalled network cannot extend copied policy expiry`() {
        assertTrue(ManagedPolicy.apps(view, 9_999, 500).contains("com.audible.application"))
        assertTrue(ManagedPolicy.apps(view, 10_000, 500).isEmpty())
        assertTrue(ManagedPolicy.apps(view, 999, 500).isEmpty())
        assertTrue(ManagedPolicy.apps(view, 1_000, 100_000).isEmpty())
    }
    @Test fun `revoked corrupt and reboot-invalid views never grant apps`() {
        for (state in listOf(null, view.copy(paired = false), view.copy(canLaunch = false), view.copy(snapshot = null))) {
            assertTrue(ManagedPolicy.apps(state, 2_000, 500).isEmpty())
        }
        val removed = view.copy(snapshot = view.snapshot!!.copy(policy = view.snapshot.policy.copy(allowedApps = emptyList())))
        assertTrue(ManagedPolicy.apps(removed, 2_000, 500).isEmpty())
    }
    @Test fun `settings lease is bounded by remaining parent session and lost on restart`() {
        val lease = SettingsLease()
        assertFalse(lease.active(1_000, 7))
        lease.begin(1_000, 7, 20)
        assertTrue(lease.active(20_999, 7))
        assertFalse(lease.active(21_000, 7))
        assertFalse(lease.active(2_000, 8))
        lease.begin(1_000, 7, 900)
        assertFalse(lease.active(301_000, 7))
        lease.clear()
        assertFalse(lease.active(2_000, 7))
        assertFalse(SettingsLease().active(2_000, 7))
    }
}
