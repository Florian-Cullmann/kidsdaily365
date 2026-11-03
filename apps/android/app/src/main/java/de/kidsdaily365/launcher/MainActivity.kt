package de.kidsdaily365.launcher

import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.content.res.ColorStateList
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.WindowInsets
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.DateFormat
import java.util.Date

/** HOME entry point for both unprovisioned preview and explicit Device Owner operation. */
class MainActivity : Activity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val app get() = application as LauncherApplication
    private val policy get() = app.policy
    private val repository get() = (application as LauncherApplication).repository
    private var polling: Job? = null
    private var operation: Job? = null
    private lateinit var content: LinearLayout
    private var layoutKind = -1
    private val maintenance get() = (application as LauncherApplication).maintenance
    private lateinit var parentPanel: ParentPanel
    private var parentStatus: MaintenanceStatus? = null
    private var showPairing = false
    private var active = false
    private var lastSnapshot: LauncherSnapshot? = null
    private var lastRendered: LauncherView? = null
    private lateinit var connectionStatus: TextView
    private lateinit var greeting: TextView
    private lateinit var stars: TextView
    private lateinit var buddyName: TextView
    private lateinit var buddyImage: BuddyView
    private lateinit var apps: LinearLayout
    private lateinit var address: EditText
    private lateinit var code: EditText
    private lateinit var pairButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(24), dp(20), dp(24), dp(24))
        }
        setContentView(ScrollView(this).apply {
            setBackgroundColor(Color.rgb(246, 243, 251))
            addView(content)
            setOnApplyWindowInsetsListener { view, insets ->
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime())
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
                insets
            }
        })
        parentPanel = ParentPanel(this, scope, maintenance, repository,
            reconnect = { showPairing = true; layoutKind = -1; startPolling() },
            changed = { showPairing = false; layoutKind = -1; startPolling() })
    }

    override fun onResume() {
        super.onResume()
        policy.returnedHome()
        if (policy.enabled && policy.owner) {
            startForegroundService(android.content.Intent(this, PolicyService::class.java))
            policy.reconcile(app.managedView, ensureHome = false)
            policy.enter(this)
        }
        active = true
        lastSnapshot = null // Recheck app installation/availability after returning from another app.
        lastRendered = null
        startPolling()
    }

    override fun onPause() {
        active = false
        maintenance.close()
        parentPanel.dismiss()
        polling?.cancel()
        operation?.cancel()
        showPairing = false
        super.onPause()
    }

    override fun onDestroy() { scope.cancel(); super.onDestroy() }

    private fun startPolling() {
        if (!active) return
        polling?.cancel()
        polling = scope.launch {
            safely {
                parentStatus = maintenance.status()
                maintenance.rememberTarget(repository.maintenanceTarget())
                var tick = 0
                while (true) {
                    var view = if (policy.enabled) app.managedView ?: LauncherView(false, null, false, "Freigaben werden geprüft …", null)
                        else repository.current()
                    if (!policy.enabled && view.paired && tick % 5 == 0) view = repository.refresh()
                    if (policy.enabled) {
                        val valid = view.canLaunch && policy.error == null && android.os.SystemClock.elapsedRealtime() < view.validUntilElapsed &&
                            System.currentTimeMillis() < view.tokenExpiresAt
                        view = view.copy(canLaunch = valid, status = if (view.canLaunch && !valid)
                            "Freigaben müssen bestätigt werden. Apps bleiben gesperrt." else view.status)
                    }
                    parentStatus = maintenance.status()
                    render(view)
                    tick++
                    delay(1_000)
                }
            }
        }
    }

    private fun render(state: LauncherView) {
        val mayPair = parentStatus?.let { !it.configured && !it.damaged } == true || (showPairing && maintenance.isOpen())
        val nextKind = if (state.paired) 1 else if (mayPair) 0 else 2
        val mode = when {
            policy.error != null -> policy.error!!
            policy.enabled && policy.owner -> "Verwalteter Kindermodus"
            else -> getString(R.string.unmanaged)
        }
        if (layoutKind == nextKind && lastRendered == state && (content.getChildAt(0) as? TextView)?.text == mode) return
        lastRendered = state
        if (content.childCount == 0 || layoutKind != nextKind) {
            content.removeAllViews()
            layoutKind = nextKind
            lastSnapshot = null
            content.addView(text(mode, 14f, Color.rgb(126, 65, 77)))
            when (nextKind) { 1 -> buildHome(); 0 -> buildPairing(); else -> buildDisconnected() }
        }
        (content.getChildAt(0) as? TextView)?.text = mode
        val sync = state.receivedAt?.let { getString(R.string.last_sync, DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(it))) }.orEmpty()
        connectionStatus.text = listOf(state.status, sync).filter { it.isNotEmpty() }.joinToString("\n")
        val snapshot = state.snapshot
        if (state.paired) {
            greeting.text = snapshot?.let { getString(R.string.greeting, it.child.name) } ?: getString(R.string.loading)
            stars.text = snapshot?.let { "★ ${it.stars}" } ?: "☆"
            stars.contentDescription = snapshot?.let { resources.getQuantityString(R.plurals.stars, if (it.stars == 1L) 1 else 2, it.stars) }
            buddyName.text = snapshot?.buddy?.name.orEmpty()
            buddyImage.show(snapshot?.buddy)
            buddyImage.contentDescription = snapshot?.let { getString(R.string.buddy_description, it.buddy.name) }
            if (snapshot != lastSnapshot || apps.childCount == 0) {
                apps.removeAllViews()
                if (snapshot?.policy?.allowedApps.isNullOrEmpty()) apps.addView(text(getString(R.string.no_apps), 18f))
                snapshot?.policy?.allowedApps?.forEachIndexed { index, app ->
                    val installed = packageManager.getLaunchIntentForPackage(app.packageName) != null
                    apps.addView(appCard(app.packageName, app.label, installed, index) {
                        operation = scope.launch {
                            safely {
                                if (!repository.mayLaunch(app.packageName)) {
                                    Toast.makeText(this@MainActivity, R.string.refresh_required, Toast.LENGTH_LONG).show()
                                    render(repository.current())
                                    return@safely
                                }
                                val intent = packageManager.getLaunchIntentForPackage(app.packageName)
                                try {
                                    if (intent != null) policy.launch(this@MainActivity, app.packageName) else throw ActivityNotFoundException()
                                } catch (_: ActivityNotFoundException) { Toast.makeText(this@MainActivity, R.string.app_missing, Toast.LENGTH_LONG).show() }
                                catch (_: SecurityException) { Toast.makeText(this@MainActivity, R.string.app_missing, Toast.LENGTH_LONG).show() }
                            }
                        }
                    })
                }
                lastSnapshot = snapshot
            }
            for (i in 0 until apps.childCount) {
                val child = apps.getChildAt(i)
                if (child is Button) child.isEnabled = state.canLaunch && child.tag == true
            }
        }
    }

    private fun buildHome() {
        window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.TOP
        }
        val welcome = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        stars = text("☆", 16f, Color.rgb(112, 76, 13)).apply {
            setTypeface(typeface, Typeface.BOLD)
            setPadding(dp(14), dp(8), dp(14), dp(8))
            background = rounded(Color.rgb(255, 237, 178))
        }
        welcome.addView(stars, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        greeting = text("", 28f).apply {
            gravity = Gravity.START
            setPadding(0, dp(20), 0, dp(4))
            setTypeface(typeface, Typeface.BOLD)
        }
        welcome.addView(greeting)
        welcome.addView(text("Schön, dass du da bist!", 16f).apply {
            gravity = Gravity.START; setPadding(0, dp(4), 0, dp(8))
        })
        header.addView(welcome, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        val buddy = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
        }
        buddyImage = BuddyView(this)
        buddy.addView(buddyImage, LinearLayout.LayoutParams(dp(112), dp(112)))
        buddyName = text("", 16f).apply { setPadding(0, 0, 0, dp(8)) }
        buddy.addView(buddyName, LinearLayout.LayoutParams(dp(112), LinearLayout.LayoutParams.WRAP_CONTENT))
        header.addView(buddy)
        content.addView(header, fullWidth())
        val garden = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(16))
            background = rounded(Color.WHITE)
        }
        garden.addView(text(getString(R.string.your_apps), 24f).apply {
            gravity = Gravity.START; setTypeface(typeface, Typeface.BOLD)
        })
        garden.addView(text("Was möchtest du entdecken?", 16f).apply {
            gravity = Gravity.START; setPadding(dp(8), 0, dp(8), dp(12))
        })
        apps = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        garden.addView(apps, fullWidth())
        content.addView(garden, fullWidth())
        connectionStatus = text("", 14f); content.addView(connectionStatus)
        content.addView(button(getString(R.string.retry)) { startPolling() })
        content.addView(button("Elternzugang") { parentPanel.open() })
        addEmergencyButton()
    }

    private fun appCard(packageName: String, label: String, installed: Boolean, index: Int, action: () -> Unit): Button {
        val colors = intArrayOf(0xFFE4F2E8.toInt(), 0xFFECE6FA.toInt(), 0xFFFFEBD7.toInt(), 0xFFE1EFFB.toInt())
        return button(if (installed) label else getString(R.string.not_installed, label), action).apply {
            tag = installed
            gravity = Gravity.CENTER_VERTICAL or Gravity.START
            minHeight = dp(96)
            setPadding(dp(18), dp(18), dp(18), dp(18))
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(ColorStateList(
                arrayOf(intArrayOf(android.R.attr.state_enabled), intArrayOf()),
                intArrayOf(Color.rgb(54, 40, 78), Color.rgb(104, 99, 113))
            ))
            backgroundTintList = null
            background = RippleDrawable(ColorStateList.valueOf(0x2236284E), rounded(colors[index % colors.size]), null)
            compoundDrawablePadding = dp(16)
            val icon = try { packageManager.getApplicationIcon(packageName) }
                catch (_: android.content.pm.PackageManager.NameNotFoundException) {
                    packageManager.defaultActivityIcon
                }
            icon.setBounds(0, 0, dp(44), dp(44))
            setCompoundDrawablesRelative(icon, null, null, null)
        }
    }

    private fun buildDisconnected() {
        window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        content.addView(text("Handy erneut verbinden", 30f))
        content.addView(text("Ein Elternteil kann den Zugang öffnen und dieses Handy neu koppeln. Der Eltern-Code funktioniert auch ohne Server.", 18f))
        connectionStatus = text("", 16f); content.addView(connectionStatus)
        content.addView(button("Elternzugang") { parentPanel.open() })
        addEmergencyButton()
    }

    private fun addEmergencyButton() {
        // Android's emergency-only dialer action; never grant a general phone app to Lock Task.
        val intent = android.content.Intent("com.android.phone.EmergencyDialer.DIAL")
        val handler = packageManager.resolveActivity(intent, android.content.pm.PackageManager.MATCH_DEFAULT_ONLY) ?: return
        if (handler.activityInfo.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_SYSTEM == 0) return
        intent.setPackage(handler.activityInfo.packageName)
        content.addView(button("Notruf") {
            try { startActivity(intent) }
            catch (_: Exception) { Toast.makeText(this, "Notruf über das Power-Menü öffnen.", Toast.LENGTH_LONG).show() }
        })
    }

    private fun buildPairing() {
        // Keep the one-use code out of screenshots, recent-task previews, autofill and saved Activity state.
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        content.importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
        content.addView(text(getString(R.string.setup_title), 30f))
        content.addView(text(getString(R.string.setup_explanation), 18f))
        content.addView(text(getString(R.string.server_address), 16f))
        address = EditText(this).apply {
            hint = "https://kidsdaily.example"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            isSingleLine = true; isSaveEnabled = false
            contentDescription = getString(R.string.server_address)
        }; content.addView(address, fullWidth())
        content.addView(text(getString(R.string.device_code), 16f))
        code = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            isSingleLine = true; isSaveEnabled = false
            contentDescription = getString(R.string.device_code)
        }; content.addView(code, fullWidth())
        pairButton = button(getString(R.string.connect)) {
            val endpoint = address.text.toString()
            val pairingCode = code.text.toString()
            code.text.clear()
            pairButton.isEnabled = false
            polling?.cancel()
            operation = scope.launch {
                try {
                    safely {
                        val paired = repository.pair(endpoint, pairingCode)
                        maintenance.rememberTarget(repository.maintenanceTarget())
                        maintenance.close(); showPairing = false
                        render(paired); startPolling()
                    }
                } finally { if (layoutKind == 0) pairButton.isEnabled = true }
            }
        }; content.addView(pairButton)
        connectionStatus = text("", 16f); content.addView(connectionStatus)
        if (parentStatus?.target != null) content.addView(button("Elternzugang") { parentPanel.open() })
        addEmergencyButton()
        if (BuildConfig.DEBUG) content.addView(text(getString(R.string.debug_http), 14f))
    }

    private suspend fun safely(block: suspend () -> Unit) {
        try { block() }
        catch (e: CancellationException) { throw e }
        catch (_: MaintenanceLocked) { parentStatus = maintenance.status(); layoutKind = -1; render(repository.current()) }
        catch (e: IllegalArgumentException) { connectionStatus.text = e.message ?: getString(R.string.connection_failed) }
        catch (e: HttpFailure) { connectionStatus.setText(if (e.status == 401) R.string.invalid_code else R.string.connection_failed) }
        catch (_: Exception) { connectionStatus.setText(R.string.connection_failed) }
    }

    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun fullWidth() = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
        topMargin = dp(8); bottomMargin = dp(8)
    }
    private fun rounded(color: Int) = GradientDrawable().apply { setColor(color); cornerRadius = dp(24).toFloat() }
    private fun text(value: String, size: Float, color: Int = Color.rgb(54, 40, 78)) = TextView(this).apply {
        text = value; textSize = size; setTextColor(color); gravity = Gravity.CENTER
        setPadding(dp(8), dp(10), dp(8), dp(10))
    }
    private fun button(label: String, action: () -> Unit) = Button(this).apply {
        text = label; textSize = 18f; isAllCaps = false; minHeight = dp(60)
        layoutParams = fullWidth()
        setOnClickListener { action() }
    }
}
