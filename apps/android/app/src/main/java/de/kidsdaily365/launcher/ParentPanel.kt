package de.kidsdaily365.launcher

import android.app.Activity
import android.app.AlertDialog
import android.text.InputType
import android.text.InputFilter
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Internal native parent UI. No Intent extra, child token or saved Activity state grants access. */
class ParentPanel(private val activity: Activity, private val scope: CoroutineScope,
    private val maintenance: MaintenanceController, private val repository: ConnectedLauncher,
    private val reconnect: () -> Unit, private val changed: () -> Unit) {
    private val policy get() = (activity.application as LauncherApplication).policy
    private var dialog: AlertDialog? = null
    private var ticker: Job? = null
    private fun label(value: String) = TextView(activity).apply { text = value; textSize = 17f; setPadding(8, 14, 8, 14) }
    private fun input(description: String) = EditText(activity).apply {
        hint = description; contentDescription = description
        inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        isSingleLine = true; isSaveEnabled = false
        filters = arrayOf(InputFilter.LengthFilter(128))
    }
    private fun box() = LinearLayout(activity).apply {
        orientation = LinearLayout.VERTICAL; setPadding(28, 16, 28, 20)
        importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
    }
    private fun button(label: String, parent: LinearLayout, action: () -> Unit) = Button(activity).apply {
        text = label; isAllCaps = false; minHeight = (56 * activity.resources.displayMetrics.density).toInt()
        setOnClickListener { action() }; parent.addView(this)
    }
    private fun show(title: String, content: LinearLayout) {
        dialog?.setOnDismissListener(null); dialog?.dismiss()
        ticker?.cancel()
        dialog = AlertDialog.Builder(activity).setTitle(title)
            .setView(ScrollView(activity).apply { addView(content) })
            .setNegativeButton("Schließen") { _, _ -> }.create().apply {
                setOnDismissListener {
                    ticker?.cancel()
                    maintenance.close(); changed()
                }
                setCanceledOnTouchOutside(false)
                window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                show()
                window?.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
            }
        if (maintenance.isOpen()) ticker = scope.launch {
            while (maintenance.isOpen()) delay(1_000)
            dismiss(); changed()
        }
    }
    fun dismiss() { maintenance.close(); dialog?.dismiss(); dialog = null; ticker?.cancel() }

    fun open() { scope.launch { attempt(null) {
        val status = maintenance.status()
        if (maintenance.isOpen()) actions() else credentials(status)
    } } }

    private fun credentials(status: MaintenanceStatus) {
        val content = box()
        val note = label(if (status.configured) "Dein Eltern-Code funktioniert auch ohne Server. Nach fünf Minuten oder beim Verlassen der App schließt der Zugang automatisch."
            else "Für dieses Handy zuerst in der Elternverwaltung unter Geräte eine Eltern-Bestätigung erstellen. Der Gerätecode zum Koppeln ist hier nicht gültig.")
        content.addView(note)
        if (status.retryAfterSeconds > 0) note.append(activity.resources.getQuantityString(R.plurals.maintenance_wait, status.retryAfterSeconds.toInt(), status.retryAfterSeconds))
        if (status.configured) {
            val code = input("Eltern-Code"); content.addView(code)
            button("Elternzugang öffnen", content) {
                val secret = code.text.toString().toCharArray(); code.text.clear()
                scope.launch { try { attempt(note) {
                    if (maintenance.unlock(secret) && maintenance.isOpen() && dialog?.isShowing == true) actions()
                    else { val state = maintenance.status(); note.text = if (state.retryAfterSeconds > 0) "Bitte ${state.retryAfterSeconds} Sekunden warten." else "Eltern-Code nicht korrekt." }
                } } finally { secret.fill('\u0000') } }
            }
            button("Code vergessen · online zurücksetzen", content) { setup(false) }
        } else {
            if (status.damaged) note.append(activity.getString(R.string.maintenance_damaged))
            button("Elternzugang einrichten", content) { setup(false) }
        }
        show("Elternzugang", content)
    }

    private fun setup(change: Boolean) {
        val content = box()
        val note = label(if (change) "Neuen lokalen Eltern-Code festlegen. Mindestens 12 Zeichen, zum Beispiel mehrere Wörter. Sicher außerhalb des Handys aufbewahren."
            else "Eltern-Bestätigung für genau dieses Handy aus der Webverwaltung eingeben. Danach eigenen lokalen Eltern-Code festlegen: mindestens 12 Zeichen. Er bleibt ausschließlich auf diesem Gerät und funktioniert offline.")
        content.addView(note)
        val confirmation = input("Einmalige Eltern-Bestätigung"); if (!change) content.addView(confirmation)
        val first = input("Neuer Eltern-Code"); content.addView(first)
        val second = input("Eltern-Code wiederholen"); content.addView(second)
        val submit = button("Eltern-Code speichern", content) { }
        submit.setOnClickListener {
            val parentProof = confirmation.text.toString(); confirmation.text.clear()
            val a = first.text.toString().toCharArray(); val b = second.text.toString().toCharArray()
            first.text.clear(); second.text.clear(); submit.isEnabled = false
            scope.launch { try { attempt(note) {
                if (change) maintenance.changeCode(a, b) else maintenance.setup(parentProof, a, b)
                if (dialog?.isShowing == true) { if (maintenance.isOpen()) actions() else credentials(maintenance.status()) }
            } } finally { a.fill('\u0000'); b.fill('\u0000'); submit.isEnabled = true } }
        }
        show(if (change) "Eltern-Code ändern" else "Elternzugang einrichten", content)
    }

    private fun actions() {
        maintenance.requireOpen()
        val content = box(); val remaining = label(""); content.addView(remaining)
        content.addView(label(if (policy.enabled) "Verwalteter Kindermodus. Systemeinstellungen öffnen eine zeitlich begrenzte Wartung; nach spätestens fünf Minuten kehrt das Handy zum Kindermodus zurück."
            else "Die Gerätesperren brauchen ein ausdrücklich als Device Owner eingerichtetes Handy und einen sicher aufbewahrten Eltern-Code."))
        if (policy.owner && !policy.enabled) button("Gerätesperren aktivieren", content) {
            AlertDialog.Builder(activity).setTitle("Verwalteten Kindermodus aktivieren?")
                .setMessage("Nur auf einem dafür vorgesehenen Gerät aktivieren. Eltern-Code sicher außerhalb des Handys aufbewahren. Prüfe anschließend Offline-Wartung und Notruf am Gerät. Kamera, Systemleisten und nicht freigegebene Apps werden gesperrt.")
                .setNegativeButton("Abbrechen", null)
                .setPositiveButton("Aktivieren") { _, _ -> scope.launch { attempt(remaining) {
                    policy.activate(activity, repository.current()); dismiss(); changed()
                } } }.show()
        }
        if (policy.enabled) button("Gerätesperren ausschalten", content) {
            AlertDialog.Builder(activity).setTitle("Gerätesperren ausschalten?")
                .setMessage("Das Handy ist danach ungeschützt. Device Owner bleibt eingerichtet; du kannst die Sperren später wieder aktivieren.")
                .setNegativeButton("Abbrechen", null)
                .setPositiveButton("Ausschalten") { _, _ -> scope.launch { attempt(remaining) {
                    policy.deactivate(activity); dismiss(); changed()
                } } }.show()
        }
        button("Gerät freigeben", content) { scope.launch { attempt(remaining) {
            (activity.application as LauncherApplication).management.localRelease(); dismiss(); changed()
        } } }
        button("Dashboard verbinden", content) {
            val form = box(); val note = label("Unter Geräte → Verwalten einen Verwaltungscode erstellen und hier eingeben.")
            form.addView(note); val code = input("Verwaltungscode"); form.addView(code)
            button("Verbinden", form) { val value = code.text.toString(); code.text.clear(); scope.launch { attempt(note) {
                (activity.application as LauncherApplication).management.enroll(value); actions()
            } } }
            show("Dashboard verbinden", form)
        }
        button("Eltern-Code ändern", content) { scope.launch { attempt(remaining) { maintenance.requireOpen(); setup(true) } } }
        button("Systemeinstellungen öffnen", content) { scope.launch { attempt(remaining) {
            maintenance.requireOpen(); policy.openSettings(activity)
        } } }
        button("Handy verbinden", content) { scope.launch { attempt(remaining) {
            maintenance.requireOpen()
            if (repository.current().paired) { remaining.setText(R.string.maintenance_disconnect_first) }
            else { dialog?.setOnDismissListener(null); ticker?.cancel(); dialog?.dismiss(); dialog = null; reconnect() }
        } } }
        button("Verbindung trennen", content) {
            AlertDialog.Builder(activity).setTitle("Verbindung trennen?")
                .setMessage("Buddy und Gerätezugang werden entfernt. Der lokale Eltern-Code bleibt erhalten. Eine neue Kopplung braucht einen neuen Android-Gerätecode.")
                .setNegativeButton("Abbrechen", null)
                .setPositiveButton("Trennen") { _, _ -> scope.launch { attempt(remaining) {
                    (activity.application as LauncherApplication).management.disconnect(); repository.reset(); dismiss(); changed()
                } } }.show()
        }
        button("Zurück zum Kindermodus", content) { dismiss(); changed() }
        show("Wartungsmodus", content)
        ticker?.cancel()
        ticker = scope.launch {
            while (maintenance.isOpen()) {
                val state = maintenance.status()
                val message = "Elternzugang offen · noch ${(state.remainingSeconds + 59) / 60} Minuten"
                if (remaining.text.toString() != message) remaining.text = message
                delay(1_000)
            }
            dismiss(); changed()
        }
    }
    private suspend fun attempt(note: TextView?, work: suspend () -> Unit) {
        try { work() }
        catch (e: CancellationException) { throw e }
        catch (_: MaintenanceLocked) { dismiss(); changed() }
        catch (e: IllegalArgumentException) { note?.text = e.message ?: "Eingaben prüfen." }
        catch (_: Exception) { note?.setText(R.string.maintenance_failed) }
    }
}
