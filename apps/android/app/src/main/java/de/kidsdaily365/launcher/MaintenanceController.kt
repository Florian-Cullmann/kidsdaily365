package de.kidsdaily365.launcher

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import java.util.UUID
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

interface MaintenanceAccess {
    fun requireOpen()
    fun requirePairingAllowed()
}
data class MaintenanceTarget(val server: ServerAddress, val deviceId: String)
interface MaintenanceAuthorizer { fun authorize(target: MaintenanceTarget, code: String) }
class MaintenanceLocked : Exception("Bitte den Elternzugang öffnen.")
data class MaintenanceStatus(val configured: Boolean, val target: MaintenanceTarget?, val remainingSeconds: Long,
    val retryAfterSeconds: Long, val damaged: Boolean)

interface CodeHasher {
    fun hash(code: CharArray, salt: ByteArray): ByteArray
}
class Pbkdf2CodeHasher : CodeHasher {
    override fun hash(code: CharArray, salt: ByteArray): ByteArray {
        val spec = PBEKeySpec(code, salt, 600_000, 256)
        return try { SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded }
        finally { spec.clearPassword() }
    }
}

/** Independent of the child token. Session grants never survive backgrounding, process death or reboot. */
class MaintenanceController(private val store: PrivateStore, private val clock: LauncherClock,
    private val authorizer: MaintenanceAuthorizer, private val debug: Boolean,
    private val hasher: CodeHasher = Pbkdf2CodeHasher()) : MaintenanceAccess {
    private val mutex = Mutex()
    @Volatile private var initialized = false
    @Volatile private var configured = false
    @Volatile private var until = 0L
    @Volatile private var sessionBoot = -1
    private var target: MaintenanceTarget? = null
    private var salt: ByteArray? = null
    private var verifier: ByteArray? = null
    private var failures = 0
    private var blockedUntil = 0L
    private var blockedBoot = -1
    private var delayMillis = 0L
    private var damaged = false
    private val random = SecureRandom()
    private val sessionLock = Any()
    private var sessionRevision = 0L

    fun isOpen(): Boolean = initialized && configured && sessionBoot >= 0 && sessionBoot == clock.bootCount() &&
        clock.elapsedMillis() >= 0 && clock.elapsedMillis() < until
    fun close() { synchronized(sessionLock) { sessionRevision++; until = 0; sessionBoot = -1 } }
    private fun begin(): Long = synchronized(sessionLock) { close(); sessionRevision }
    override fun requireOpen() { if (!isOpen()) throw MaintenanceLocked() }
    override fun requirePairingAllowed() { if (!initialized || ((configured || damaged) && !isOpen())) throw MaintenanceLocked() }

    suspend fun status(): MaintenanceStatus = locked { load(); statusValue() }
    suspend fun rememberTarget(next: MaintenanceTarget?) = locked {
        load()
        if (next != null && (target?.deviceId != next.deviceId || target?.server?.origin != next.server.origin)) {
            if (configured || (damaged && target != null)) requireOpen()
            target = next; persist()
        }
    }

    /** Only a freshly consumed, device-specific parent capability may create/reset the local credential. */
    suspend fun setup(confirmation: String, newCode: CharArray, repeated: CharArray): MaintenanceStatus = locked {
        load(); validateCode(newCode, repeated); val ticket = begin()
        val destination = target ?: throw IllegalStateException("Zuerst das Handy mit einem Kinderprofil verbinden.")
        authorizer.authorize(destination, confirmation)
        replaceCredential(newCode, ticket)
        statusValue()
    }

    suspend fun changeCode(newCode: CharArray, repeated: CharArray): MaintenanceStatus = locked {
        load(); requireOpen(); validateCode(newCode, repeated)
        replaceCredential(newCode, begin()); statusValue()
    }

    suspend fun unlock(code: CharArray): Boolean = locked {
        load(); val ticket = begin()
        if (!configured || damaged || remainingBlock() > 0) return@locked false
        failures = (failures + 1).coerceAtMost(30)
        delayMillis = if (failures < 5) 0 else (30_000L * (1L shl (failures - 5).coerceAtMost(6))).coerceAtMost(1_800_000)
        blockedUntil = clock.elapsedMillis() + delayMillis; blockedBoot = clock.bootCount()
        // Reserve the attempt BEFORE the expensive KDF: killing the process cannot refund guesses.
        persist()
        val result = code.size in 12..128 && MessageDigest.isEqual(verifier, hasher.hash(code, checkNotNull(salt)))
        if (result) {
            failures = 0; delayMillis = 0; blockedUntil = 0
            persist(); open(ticket)
        }
        result
    }

    private fun validateCode(code: CharArray, repeated: CharArray) {
        require(code.size in 12..128) { "Mindestens 12 und höchstens 128 Zeichen verwenden, zum Beispiel mehrere Wörter." }
        require(code.contentEquals(repeated)) { "Die Eltern-Codes stimmen nicht überein." }
    }
    private fun replaceCredential(code: CharArray, ticket: Long) {
        salt = ByteArray(16).also { random.nextBytes(it) }
        verifier = hasher.hash(code, checkNotNull(salt))
        configured = true; damaged = false; failures = 0; blockedUntil = 0; delayMillis = 0
        persist(); open(ticket)
    }
    private fun open(ticket: Long) = synchronized(sessionLock) {
        if (ticket != sessionRevision) return@synchronized
        check(clock.bootCount() >= 0) { "Geräte-Neustartstatus nicht lesbar." }
        sessionBoot = clock.bootCount(); until = clock.elapsedMillis() + 300_000
    }
    private fun remainingBlock(): Long {
        if (delayMillis == 0L) return 0
        if (blockedBoot != clock.bootCount() || clock.elapsedMillis() < 0) {
            // Restart the full remaining penalty after a device reboot; wall-clock changes cannot shorten it.
            blockedBoot = clock.bootCount(); blockedUntil = clock.elapsedMillis() + delayMillis
            persist()
        }
        return (blockedUntil - clock.elapsedMillis()).coerceAtLeast(0)
    }
    private fun statusValue() = MaintenanceStatus(configured && !damaged, target,
        if (isOpen()) (until - clock.elapsedMillis() + 999) / 1000 else 0,
        (remainingBlock() + 999) / 1000, damaged)

    private fun load() {
        if (initialized) return
        initialized = true
        try {
            val o = JSONObject(store.read() ?: return)
            check(o.getInt("version") == 1)
            target = MaintenanceTarget(ServerAddress.parse(o.getString("server"), debug), o.getString("deviceId").also { check(UUID.fromString(it).toString() == it) })
            damaged = o.getBoolean("damaged")
            configured = !o.isNull("verifier") && !damaged
            if (configured) {
                check(o.getString("algorithm") == "pbkdf2-sha256-600000")
                salt = Base64.getDecoder().decode(o.getString("salt")).also { check(it.size == 16) }
                verifier = Base64.getDecoder().decode(o.getString("verifier")).also { check(it.size == 32) }
            }
            failures = o.getInt("failures").also { check(it in 0..30) }
            delayMillis = o.getLong("delayMillis").also { check(it in 0..1_800_000) }
            blockedUntil = o.getLong("blockedUntil"); blockedBoot = o.getInt("blockedBoot")
        } catch (_: Exception) {
            configured = false; damaged = true; salt = null; verifier = null; close()
            // Keep any readable device binding for a parent-authorized online reset. Never erase and unlock.
        }
    }
    private fun persist() {
        val destination = checkNotNull(target)
        val encoder = Base64.getEncoder()
        val o = JSONObject().put("version", 1).put("server", destination.server.origin).put("deviceId", destination.deviceId)
            .put("damaged", damaged).put("algorithm", "pbkdf2-sha256-600000").put("salt", salt?.let { encoder.encodeToString(it) } ?: JSONObject.NULL)
            .put("verifier", verifier?.let { encoder.encodeToString(it) } ?: JSONObject.NULL)
            .put("failures", failures).put("delayMillis", delayMillis).put("blockedUntil", blockedUntil).put("blockedBoot", blockedBoot)
        try { store.write(o.toString()) }
        catch (e: Exception) { close(); configured = false; damaged = true; throw e }
    }
    private suspend fun <T> locked(block: () -> T): T = withContext(Dispatchers.IO) { mutex.withLock { block() } }
}
