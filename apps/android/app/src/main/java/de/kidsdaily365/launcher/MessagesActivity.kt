package de.kidsdaily365.launcher

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.Editable
import android.text.InputFilter
import android.text.TextWatcher
import android.view.Gravity
import android.view.WindowInsets
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** Native household chat. No browser credentials, contact discovery, sounds or external intents. */
class MessagesActivity : Activity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val client get() = (application as LauncherApplication).management
    private lateinit var list: LinearLayout
    private lateinit var scroll: ScrollView
    private lateinit var note: TextView
    private lateinit var draft: EditText
    private lateinit var older: Button
    private var polling: Job? = null
    private var before: String? = null
    private val messages = linkedMapOf<String, JSONObject>()
    private var previous = ""
    private var restoring = true
    private fun dp(n: Int) = (n * resources.displayMetrics.density).toInt()
    private fun text(value: String, size: Float = 15f) = TextView(this).apply {
        text = value; textSize = size; setTextColor(Color.rgb(49, 65, 53)); setPadding(dp(10), dp(8), dp(10), dp(8))
    }
    private fun rounded(color: Int) = GradientDrawable().apply { setColor(color); cornerRadius = dp(18).toFloat() }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(Color.rgb(245, 247, 239)) }
        root.setOnApplyWindowInsetsListener { view, insets ->
            val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom); insets
        }
        val header = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL; setPadding(dp(10), dp(6), dp(12), dp(6)); setBackgroundColor(Color.rgb(224, 236, 215)) }
        header.addView(Button(this).apply { text = "‹ Zurück"; isAllCaps = false; backgroundTintList = android.content.res.ColorStateList.valueOf(Color.rgb(239, 245, 234)); setTextColor(Color.rgb(65, 87, 60)); minHeight = dp(48); setOnClickListener { finish() } })
        header.addView(text("Nachrichten\nMit deinen Eltern", 19f).apply { setTypeface(typeface, Typeface.BOLD) })
        root.addView(header)
        note = text("Dein direkter Draht zu deinen Eltern", 12f); root.addView(note)
        older = Button(this).apply { text = "Ältere Nachrichten"; isAllCaps = false; visibility = android.view.View.GONE; setOnClickListener {
            scope.launch { attempt { val page = client.messages(before); before = page.optString("before").takeUnless { it == "null" || it.isBlank() }; add(page); draw(false) } }
        } }; root.addView(older)
        list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(14), dp(12), dp(14), dp(12)) }
        scroll = ScrollView(this).apply { addView(list) }; root.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
        val compose = LinearLayout(this).apply { setPadding(dp(12), dp(8), dp(12), dp(12)); gravity = Gravity.CENTER_VERTICAL }
        draft = EditText(this).apply { hint = "Nachricht schreiben …"; contentDescription = "Nachricht an deine Eltern"; maxLines = 5; filters = arrayOf(InputFilter.LengthFilter(2000)); textSize = 16f; background = rounded(Color.WHITE); setPadding(dp(15), dp(12), dp(15), dp(12)) }
        compose.addView(draft, LinearLayout.LayoutParams(0, -2, 1f))
        val send = Button(this).apply { text = "Senden"; isAllCaps = false; backgroundTintList = android.content.res.ColorStateList.valueOf(Color.rgb(101, 132, 85)); setTextColor(Color.WHITE); minHeight = dp(52) }; compose.addView(send); root.addView(compose)
        send.setOnClickListener { val value = draft.text.toString(); if (value.isBlank()) return@setOnClickListener
            send.isEnabled = false; draft.isEnabled = false
            scope.launch { try { attempt { client.send(value); restoring = true; draft.text.clear(); restoring = false; update() } } finally { send.isEnabled = true; draft.isEnabled = true } }
        }
        draft.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { if (!restoring) { val value = s.toString(); scope.launch { client.saveDraft(value) } } }
            override fun afterTextChanged(s: Editable?) {}
        })
        setContentView(root)
        scope.launch { attempt { draft.setText(client.draft()); restoring = false } }
    }
    override fun onResume() { super.onResume(); polling = scope.launch { while (true) { attempt { update() }; delay(5000) } } }
    override fun onPause() { polling?.cancel(); super.onPause() }
    override fun onDestroy() { scope.cancel(); super.onDestroy() }
    private fun add(page: JSONObject) { val items = page.getJSONArray("messages"); for (i in 0 until items.length()) { val m = items.getJSONObject(i); messages[m.getString("id")] = m } }
    private suspend fun update() {
        val page = client.messages(); if (messages.size <= 50) before = page.optString("before").takeUnless { it == "null" || it.isBlank() }
        add(page); val atEnd = scroll.scrollY + scroll.height >= list.height - dp(80)
        draw(atEnd); note.text = client.status
        val unread = messages.values.filter { it.getString("sender") == "parent" && it.isNull("readAt") }.takeLast(50).map { it.getString("id") }
        if (unread.isNotEmpty()) runCatching { client.read(unread) }
    }
    private fun draw(atEnd: Boolean) {
        val sorted = messages.values.sortedBy { it.getString("createdAt") }
        val signature = sorted.joinToString { it.toString() }
        if (signature == previous && list.childCount > 0) return
        previous = signature; list.removeAllViews()
        older.visibility = if (before != null) android.view.View.VISIBLE else android.view.View.GONE
        if (sorted.isEmpty()) list.addView(text("Hier ist Platz für ein Hallo.\nSchreib deinen Eltern eine Nachricht.", 18f))
        var day = ""
        val zone = ZoneId.systemDefault()
        for (message in sorted) {
            val instant = Instant.parse(message.getString("createdAt")).atZone(zone)
            val date = instant.format(DateTimeFormatter.ofPattern("dd.MM.yyyy"))
            if (date != day) { list.addView(text(date, 11f).apply { gravity = Gravity.CENTER }); day = date }
            val mine = message.getString("sender") == "child"
            val bubble = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(5), dp(5), dp(5), dp(5)); background = rounded(if (mine) Color.rgb(220, 235, 206) else Color.WHITE) }
            bubble.addView(text(message.getString("body"), 16f))
            val status = if (mine) if (message.isNull("readAt")) " · Gesendet" else " · Gelesen" else ""
            bubble.addView(text(instant.format(DateTimeFormatter.ofPattern("HH:mm")) + status, 10f).apply { gravity = Gravity.END })
            list.addView(bubble, LinearLayout.LayoutParams((resources.displayMetrics.widthPixels * .78).toInt(), -2).apply {
                gravity = if (mine) Gravity.END else Gravity.START; topMargin = dp(8); bottomMargin = dp(4)
            })
        }
        if (atEnd) scroll.post { scroll.fullScroll(ScrollView.FOCUS_DOWN) }
    }
    private suspend fun attempt(action: suspend () -> Unit) {
        try { action() } catch (e: kotlinx.coroutines.CancellationException) { throw e }
        catch (e: Exception) {
            if (!client.connected) { messages.clear(); previous = ""; draw(false); restoring = true; draft.text.clear(); restoring = false }
            note.text = e.message ?: "Keine Verbindung. Deine Nachricht bleibt erhalten."
        }
    }
}
