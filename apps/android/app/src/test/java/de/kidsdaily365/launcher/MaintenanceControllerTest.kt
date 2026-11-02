package de.kidsdaily365.launcher

import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class MaintenanceControllerTest {
    private class Store : PrivateStore {
        var value: String? = null; var fail = false
        override fun read() = value
        override fun write(value: String) { if (fail) throw IOException(); this.value = value }
        override fun clear() { value = null }
    }
    private class Clock : LauncherClock {
        var time = 1000L; var boot = 1; var wall = 1_800_000_000_000L
        override fun wallMillis() = wall
        override fun elapsedMillis() = time
        override fun bootCount() = boot
    }
    private class Hasher : CodeHasher {
        var pause: (() -> Unit)? = null
        override fun hash(code: CharArray, salt: ByteArray): ByteArray {
            pause?.invoke()
            return MessageDigest.getInstance("SHA-256").digest(salt + String(code).toByteArray())
        }
    }
    private val destination = MaintenanceTarget(ServerAddress.parse("http://10.0.2.2:3000", true), snapshotFixture().device.id)
    private val secret get() = "Eltern Wort 123!".toCharArray()
    private class Authorizer : MaintenanceAuthorizer {
        var calls = 0; var deny = false
        override fun authorize(target: MaintenanceTarget, code: String) { calls++; if (deny || code != "parent-proof") throw IOException() }
    }
    private fun controller(store: Store, clock: Clock, auth: Authorizer = Authorizer(), hasher: Hasher = Hasher()) =
        MaintenanceController(store, clock, auth, true, hasher)

    @Test fun `setup needs separate parent proof and stores no plaintext code`() = runBlocking {
        val store = Store(); val clock = Clock(); val auth = Authorizer(); val c = controller(store, clock, auth)
        c.status(); c.rememberTarget(destination)
        try { c.setup("child-token", secret, secret); fail() } catch (_: IOException) { }
        assertFalse(c.isOpen()); assertFalse(c.status().configured)
        c.setup("parent-proof", secret, secret)
        assertTrue(c.isOpen()); assertFalse(checkNotNull(store.value).contains(String(secret)))
        assertEquals(2, auth.calls)
    }

    @Test fun `offline unlock expires after five minutes and process restart never restores grant`() = runBlocking {
        val store = Store(); val clock = Clock(); val auth = Authorizer(); val c = controller(store, clock, auth)
        c.status(); c.rememberTarget(destination); c.setup("parent-proof", secret, secret)
        clock.wall -= 600_000
        clock.time += 300_000
        assertFalse(c.isOpen())
        assertThrows(MaintenanceLocked::class.java) { c.requireOpen() }
        auth.deny = true
        assertTrue(c.unlock(secret)); assertTrue(c.isOpen()) // No server request for offline recovery.
        val restarted = controller(store, clock, auth)
        assertTrue(restarted.status().configured); assertFalse(restarted.isOpen())
        assertTrue(restarted.unlock(secret))
        clock.boot++; clock.time = 100
        assertFalse(restarted.isOpen())
        assertEquals(1, auth.calls)
    }

    @Test fun `failure counter and cooldown survive process restart reboot and wall clock changes`() = runBlocking {
        val store = Store(); val clock = Clock(); var c = controller(store, clock)
        c.status(); c.rememberTarget(destination); c.setup("parent-proof", secret, secret); c.close()
        repeat(5) { assertFalse(c.unlock("wrong code long!".toCharArray())) }
        assertEquals(30L, c.status().retryAfterSeconds)
        c = controller(store, clock)
        assertEquals(30L, c.status().retryAfterSeconds)
        assertFalse(c.unlock(secret))
        clock.wall += 100_000_000
        clock.boot++; clock.time = 50
        assertEquals(30L, c.status().retryAfterSeconds)
        clock.time += 30_000
        assertTrue(c.unlock(secret))
        assertEquals(0L, c.status().retryAfterSeconds)
    }

    @Test fun `changing credentials needs an active grant and invalidates previous code`() = runBlocking {
        val store = Store(); val clock = Clock(); val c = controller(store, clock)
        c.status(); c.rememberTarget(destination); c.setup("parent-proof", secret, secret); c.close()
        try { c.changeCode(secret, secret); fail() } catch (_: MaintenanceLocked) { }
        c.unlock(secret)
        val updated = "Neue Eltern Worte 987!".toCharArray()
        c.changeCode(updated, updated)
        c.close(); assertFalse(c.unlock(secret)); assertTrue(c.unlock(updated))
    }

    @Test fun `backgrounding during hashing cannot reopen parent access late`() = runBlocking {
        val store = Store(); val clock = Clock(); val hasher = Hasher(); val c = controller(store, clock, hasher = hasher)
        c.status(); c.rememberTarget(destination); c.setup("parent-proof", secret, secret); c.close()
        val started = CountDownLatch(1); val release = CountDownLatch(1)
        hasher.pause = { started.countDown(); check(release.await(5, TimeUnit.SECONDS)) }
        val login = async { c.unlock(secret) }; yield(); check(started.await(5, TimeUnit.SECONDS))
        c.close(); release.countDown(); login.await()
        assertFalse(c.isOpen())
    }

    @Test fun `corruption and failed persistent attempt reservation fail closed`() = runBlocking {
        val store = Store(); val clock = Clock(); val c = controller(store, clock)
        c.status(); c.rememberTarget(destination); c.setup("parent-proof", secret, secret); c.close()
        store.fail = true
        try { c.unlock(secret); fail() } catch (_: IOException) { }
        assertFalse(c.isOpen())
        store.fail = false; store.value = "damaged"
        val damaged = controller(store, clock)
        assertTrue(damaged.status().damaged)
        assertThrows(MaintenanceLocked::class.java) { damaged.requirePairingAllowed() }
        damaged.rememberTarget(destination)
        damaged.setup("parent-proof", secret, secret)
        assertTrue(damaged.isOpen())
    }

    @Test fun `pairing and disconnect are guarded beyond UI buttons`() = runBlocking {
        val store = Store(); val clock = Clock(); val c = controller(store, clock)
        c.status(); c.rememberTarget(destination); c.setup("parent-proof", secret, secret); c.close()
        val connectionStore = Store()
        val api = object : LauncherApi {
            override fun pair(server: ServerAddress, code: String): Pairing = error("must not call network")
            override fun snapshot(server: ServerAddress, token: String): LauncherSnapshot = error("unused")
        }
        val repo = ConnectedLauncher(api, connectionStore, clock, true, c)
        try { repo.pair(destination.server.origin, "pair-code"); fail() } catch (_: MaintenanceLocked) { }
        try { repo.reset(); fail() } catch (_: MaintenanceLocked) { }
        assertNull(connectionStore.value)
    }

    @Test fun `PBKDF2 implementation uses the recorded parameters`() {
        val actual = Pbkdf2CodeHasher().hash(secret, ByteArray(16)).joinToString("") { "%02x".format(it) }
        assertEquals("2719d32a252c794ab030c7cb639c5d1d8b1915d6b6ed0cab840d533b0b2d3c7e", actual)
    }
}
