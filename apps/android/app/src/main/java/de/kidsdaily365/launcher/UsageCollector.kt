package de.kidsdaily365.launcher

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Process
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.time.Instant

/** Bounded, resumable batches from Android's event log, never inferred from launcher taps. */
class UsageCollector(private val context: Context) {
    fun permitted(): Boolean = context.getSystemService(AppOpsManager::class.java)
        .unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName) == AppOpsManager.MODE_ALLOWED

    data class Batch(val events: JSONArray, val cursor: Long, val keys: Set<String>, val through: Long)
    fun collect(cursor: Long, keys: Set<String>): Batch {
        val now = System.currentTimeMillis()
        if (!permitted()) return Batch(JSONArray(), now, emptySet(), cursor)
        val start = cursor.coerceAtLeast(now - 7 * 86_400_000L)
        val events = context.getSystemService(UsageStatsManager::class.java).queryEvents(start, now)
        val item = UsageEvents.Event()
        val output = JSONArray(); var last = start; var lastKeys = keys.toMutableSet()
        if (start > cursor) output.put(JSONObject().put("key", "gap-$start").put("at", Instant.ofEpochMilli(start).toString())
            .put("kind", "shutdown").put("packageName", "").put("label", "Datenlücke"))
        while (events.hasNextEvent()) {
            events.getNextEvent(item)
            val kind = when (item.eventType) {
                UsageEvents.Event.ACTIVITY_RESUMED -> "resume"
                UsageEvents.Event.ACTIVITY_PAUSED -> "pause"
                UsageEvents.Event.SCREEN_INTERACTIVE -> "screen-on"
                UsageEvents.Event.SCREEN_NON_INTERACTIVE -> "screen-off"
                UsageEvents.Event.DEVICE_SHUTDOWN, UsageEvents.Event.DEVICE_STARTUP -> "shutdown"
                else -> continue
            }
            val packageName = item.packageName.orEmpty()
            val key = MessageDigest.getInstance("SHA-256").digest("${item.timeStamp}:$kind:$packageName:${item.className}".toByteArray())
                .joinToString("") { "%02x".format(it) }
            if (item.timeStamp == cursor && key in keys) continue
            if (output.length() >= 12) return Batch(output, last, lastKeys, last)
            if (item.timeStamp != last) { last = item.timeStamp; lastKeys = mutableSetOf() }
            lastKeys.add(key)
            val label = if (packageName.isEmpty()) "Bildschirm" else runCatching {
                context.packageManager.getApplicationLabel(context.packageManager.getApplicationInfo(packageName, 0)).toString()
            }.getOrDefault(packageName)
            output.put(JSONObject().put("key", key).put("at", Instant.ofEpochMilli(item.timeStamp).toString())
                .put("kind", kind).put("packageName", packageName).put("label", label.take(120)))
        }
        return Batch(output, now, emptySet(), now)
    }
}
