package de.kidsdaily365.launcher

import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class ConnectedLauncherTest {
    private class Clock : LauncherClock {
        var now = 1_800_000_000_000L; var elapsed = 1_000L; var boot = 7
        override fun wallMillis() = now
        override fun elapsedMillis() = elapsed
        override fun bootCount() = boot
    }
    private class Store : PrivateStore {
        var raw: String? = null
        var failWrite = false
        override fun read() = raw
        override fun write(value: String) { if (failWrite) throw IOException(); raw = value }
        override fun clear() { raw = null }
    }
    private class Api : LauncherApi {
        var data = snapshotFixture()
        var failure: Exception? = null
        var block: (() -> Unit)? = null
        override fun pair(server: ServerAddress, code: String) = Pairing("a".repeat(43), data.device.id, 7776000)
        override fun snapshot(server: ServerAddress, token: String): LauncherSnapshot {
            block?.invoke(); failure?.let { throw it }; return data
        }
    }

    @Test fun `consumed code is retained if first snapshot fails then restart recovers`() = runBlocking {
        val store = Store(); val clock = Clock(); val api = Api()
        var repo = ConnectedLauncher(api, store, clock, true, TestMaintenanceAccess())
        repo.pair("http://10.0.2.2:3000", "fictional")
        api.failure = IOException()
        assertTrue(repo.refresh().paired)
        assertFalse(repo.current().canLaunch)
        repo = ConnectedLauncher(api, store, clock, true, TestMaintenanceAccess())
        api.failure = null
        assertTrue(repo.refresh().canLaunch)
        assertEquals(35L, repo.current().snapshot?.stars)
    }

    @Test fun `offline policy expires monotonically and is invalid after reboot`() = runBlocking {
        val store = Store(); val clock = Clock(); val api = Api()
        val repo = ConnectedLauncher(api, store, clock, true, TestMaintenanceAccess())
        repo.pair("http://10.0.2.2:3000", "fictional"); repo.refresh()
        api.failure = IOException()
        clock.now -= 600_000 // Clock rollback cannot extend the policy lifetime.
        clock.elapsed += 86_399_000
        assertTrue(repo.refresh().canLaunch)
        clock.elapsed += 1_000
        assertFalse(repo.mayLaunch("com.audible.application"))
        assertFalse(repo.current().canLaunch)
        api.failure = null; repo.refresh()
        clock.boot++
        assertFalse(ConnectedLauncher(api, store, clock, true, TestMaintenanceAccess()).current().canLaunch)
    }

    @Test fun `revocation wipes token and cached child`() = runBlocking {
        val store = Store(); val api = Api(); val repo = ConnectedLauncher(api, store, Clock(), true, TestMaintenanceAccess())
        repo.pair("http://10.0.2.2:3000", "fictional"); repo.refresh()
        api.failure = AccessRevoked()
        assertFalse(repo.refresh().paired)
        assertNull(store.raw)
        assertNull(repo.current().snapshot)
    }

    @Test fun `identity mismatch or invalid protocol discards old launch policy across restart`() = runBlocking {
        val store = Store(); val api = Api(); val clock = Clock()
        val repo = ConnectedLauncher(api, store, clock, true, TestMaintenanceAccess())
        repo.pair("http://10.0.2.2:3000", "fictional"); repo.refresh()
        api.data = api.data.copy(child = api.data.child.copy(id = "33333333-3333-4333-8333-333333333333"))
        assertNull(repo.refresh().snapshot)
        assertFalse(ConnectedLauncher(api, store, clock, true, TestMaintenanceAccess()).mayLaunch("com.audible.application"))
        api.data = snapshotFixture().copy(device = snapshotFixture().device.copy(id = "33333333-3333-4333-8333-333333333333"))
        assertFalse(repo.refresh().canLaunch)
    }

    @Test fun `app removal empty list token expiry and storage failure never widen access`() = runBlocking {
        val store = Store(); val api = Api(); val clock = Clock(); val repo = ConnectedLauncher(api, store, clock, true, TestMaintenanceAccess())
        repo.pair("http://10.0.2.2:3000", "fictional"); repo.refresh()
        assertFalse(repo.mayLaunch("com.android.settings"))
        api.data = api.data.copy(policy = api.data.policy.copy(allowedApps = emptyList()))
        repo.refresh(); assertFalse(repo.mayLaunch("com.audible.application"))
        store.failWrite = true
        assertFalse(repo.refresh().paired)
        assertFalse(repo.current().paired)
        assertNull(store.raw)
        store.failWrite = false
        repo.pair("http://10.0.2.2:3000", "fictional")
        clock.now += 7_776_000_000
        assertFalse(repo.refresh().paired)
    }

    @Test fun `reset waits out in-flight snapshot and cannot restore old child`() = runBlocking {
        val store = Store(); val api = Api(); val clock = Clock(); val repo = ConnectedLauncher(api, store, clock, true, TestMaintenanceAccess())
        repo.pair("http://10.0.2.2:3000", "fictional")
        val started = CountDownLatch(1); val release = CountDownLatch(1)
        api.block = { started.countDown(); check(release.await(5, TimeUnit.SECONDS)) }
        val refresh = async { repo.refresh() }
        // runBlocking's async needs a scheduling turn before the IO call.
        kotlinx.coroutines.yield()
        check(started.await(5, TimeUnit.SECONDS))
        val reset = async { repo.reset() }
        release.countDown()
        refresh.await(); reset.await()
        assertNull(store.raw)
        assertFalse(repo.current().paired)
    }

    @Test fun `corrupt encrypted-store payload requires new pairing`() = runBlocking {
        val store = Store().apply { raw = "not-json" }
        assertFalse(ConnectedLauncher(Api(), store, Clock(), true, TestMaintenanceAccess()).current().paired)
        assertNull(store.raw)
    }
}

class TestMaintenanceAccess : MaintenanceAccess {
 override fun requireOpen() {}
 override fun requirePairingAllowed() {}
}
