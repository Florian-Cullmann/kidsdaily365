package de.kidsdaily365.launcher

import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.graphics.drawable.LayerDrawable
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
import android.widget.GridLayout
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
    private lateinit var modeStatus: TextView
    private lateinit var connectionStatus: TextView
    private lateinit var greeting: TextView
    private lateinit var stars: TextView
    private lateinit var buddyName: TextView
    private lateinit var buddyImage: BuddyView
    private lateinit var apps: GridLayout
    private lateinit var address: EditText
    private lateinit var code: EditText
    private lateinit var pairButton: Button
    private var chosenBuddy: String? = null
    private var chosenName = ""
    private var setupName: EditText? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        chosenBuddy = savedInstanceState?.getString("chosenBuddy")
        chosenName = savedInstanceState?.getString("chosenName").orEmpty()
        content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(20), dp(16), dp(20), dp(24))
        }
        setContentView(ScrollView(this).apply {
            background = GardenBackground()
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

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString("chosenBuddy", chosenBuddy)
        outState.putString("chosenName", setupName?.text?.toString() ?: chosenName)
        super.onSaveInstanceState(outState)
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
        val nextKind = if (state.paired && state.buddySetupPending) 3 else if (state.paired) 1 else if (mayPair) 0 else 2
        val mode = when {
            policy.error != null -> policy.error!!
            policy.enabled && policy.owner -> "Verwalteter Kindermodus"
            else -> ""
        }
        if (layoutKind == nextKind && lastRendered == state && modeStatus.text == mode) return
        lastRendered = state
        if (content.childCount == 0 || layoutKind != nextKind) {
            content.removeAllViews()
            layoutKind = nextKind
            lastSnapshot = null
            when (nextKind) { 3 -> buildBuddySetup(); 1 -> buildHome(); 0 -> buildPairing(); else -> buildDisconnected() }
            modeStatus = text(mode, 12f, Color.rgb(126, 65, 77))
            content.addView(modeStatus)
        }
        modeStatus.text = mode
        modeStatus.visibility = if (mode.isEmpty()) View.GONE else View.VISIBLE
        val sync = state.receivedAt?.let { getString(R.string.last_sync, DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(it))) }.orEmpty()
        connectionStatus.text = listOf(state.status, sync).filter { it.isNotEmpty() }.joinToString("\n")
        val snapshot = state.snapshot
        if (nextKind == 1) {
            greeting.text = snapshot?.let { getString(R.string.greeting, it.child.name) } ?: getString(R.string.loading)
            stars.text = snapshot?.let { "★ ${it.stars}" } ?: "☆"
            stars.contentDescription = snapshot?.let { resources.getQuantityString(R.plurals.stars, if (it.stars == 1L) 1 else 2, it.stars) }
            buddyName.text = snapshot?.buddy?.name.orEmpty()
            buddyImage.show(snapshot?.buddy)
            buddyImage.contentDescription = snapshot?.let { getString(R.string.buddy_description, it.buddy.name) }
            if (snapshot != lastSnapshot || apps.childCount == 0) {
                apps.removeAllViews()
                if (snapshot?.policy?.allowedApps.isNullOrEmpty()) apps.addView(text(getString(R.string.no_apps), 18f), GridLayout.LayoutParams().apply {
                    width = 0; columnSpec = GridLayout.spec(0, apps.columnCount, 1f)
                })
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
                if (!snapshot?.policy?.allowedApps.isNullOrEmpty()) {
                    // Keep a partially filled last row aligned like a phone home screen.
                    while (apps.childCount % apps.columnCount != 0) {
                        apps.addView(android.widget.Space(this), launcherCell())
                    }
                }
                lastSnapshot = snapshot
            }
            for (i in 0 until apps.childCount) {
                val child = apps.getChildAt(i)
                if (child is Button) {
                    child.isEnabled = state.canLaunch && child.tag == true
                    child.alpha = if (child.isEnabled) 1f else 0.6f
                }
            }
        }
    }

    private fun buildBuddySetup() {
        window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        content.addView(text("Dein neuer Buddy", 30f))
        content.addView(text("Wer soll dich begleiten? Wähle deinen Buddy aus.", 18f))
        val choices = LinearLayout(this).apply {
            orientation = if (resources.configuration.fontScale > 1.3f) LinearLayout.VERTICAL else LinearLayout.HORIZONTAL
        }
        val buttons = mutableMapOf<String, Button>()
        listOf("fox" to "Fuchs", "rabbit" to "Hase", "bear" to "Bär").forEach { (kind, label) ->
            val card = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL }
            card.addView(BuddyView(this).apply { show(Buddy(kind, label, emptyList())); contentDescription = label },
                LinearLayout.LayoutParams(dp(90), dp(100)))
            val choice = button(label) {
                chosenBuddy = kind
                buttons.forEach { (id, button) ->
                    button.isSelected = id == kind
                    button.text = (if (id == kind) "✓ " else "") + button.tag.toString()
                }
            }.apply { tag = label; minWidth = 0; textSize = 16f; setPadding(dp(2), 0, dp(2), 0) }
            buttons[kind] = choice
            if (chosenBuddy == kind) { choice.text = "✓ $label"; choice.isSelected = true }
            card.addView(choice)
            choices.addView(card, if (choices.orientation == LinearLayout.HORIZONTAL)
                LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f) else fullWidth())
        }
        content.addView(choices, fullWidth())
        content.addView(text("Wie heißt dein Buddy?", 22f))
        val name = EditText(this).apply {
            hint = "Dein Wunschname"; contentDescription = "Name deines Buddys"
            isSingleLine = true; minHeight = dp(60)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            filters = arrayOf(android.text.InputFilter.LengthFilter(80))
            setText(chosenName)
        }
        setupName = name
        content.addView(name, fullWidth())
        val error = text("", 16f, Color.rgb(126, 65, 77)); content.addView(error)
        val save = button("Das ist mein Buddy!") {}
        save.setOnClickListener {
            val kind = chosenBuddy
            chosenName = name.text.toString().trim()
            if (kind == null || chosenName.isEmpty()) {
                error.text = "Wähle einen Buddy und gib ihm einen Namen."
                return@setOnClickListener
            }
            save.isEnabled = false; error.text = "Dein Buddy wird gespeichert …"
            operation = scope.launch {
                try {
                    val view = repository.completeBuddy(kind, chosenName)
                    if (policy.enabled) app.managedView = view
                    render(view)
                    chosenBuddy = null; chosenName = ""; setupName = null
                } catch (e: CancellationException) { throw e }
                catch (_: Exception) { error.text = "Das Speichern hat nicht geklappt. Prüfe die Verbindung und versuche es noch einmal." }
                finally { save.isEnabled = true }
            }
        }
        content.addView(save)
        connectionStatus = text("", 12f); content.addView(connectionStatus)
        content.addView(button("Elternzugang") { parentPanel.open() })
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
            background = softSurface(0xFFFFF3BF.toInt(), 0xFFFFE4A0.toInt())
            elevation = dp(2).toFloat()
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
        buddy.addView(buddyImage, LinearLayout.LayoutParams(dp(136), dp(136)))
        buddyName = text("", 18f).apply {
            setTypeface(typeface, Typeface.BOLD)
            background = softSurface(0xFFF6E6FC.toInt(), 0xFFE3C7F1.toInt())
            elevation = dp(3).toFloat()
        }
        buddy.addView(buddyName, LinearLayout.LayoutParams(dp(136), LinearLayout.LayoutParams.WRAP_CONTENT))
        header.addView(buddy)
        content.addView(header, fullWidth())
        content.addView(text(getString(R.string.your_apps), 18f).apply {
            gravity = Gravity.START
            setTypeface(typeface, Typeface.BOLD)
        }, fullWidth())
        apps = GridLayout(this).apply {
            // Adapt the familiar icon grid to available space and system text size.
            columnCount = when {
                resources.configuration.fontScale > 1.5f -> 1
                resources.configuration.fontScale > 1.2f || resources.configuration.screenWidthDp < 360 -> 2
                else -> 3
            }
            alignmentMode = GridLayout.ALIGN_BOUNDS
            useDefaultMargins = false
        }
        content.addView(apps, fullWidth())
        content.addView(button("Elternzugang") { parentPanel.open() }.apply {
            backgroundTintList = null
            background = RippleDrawable(ColorStateList.valueOf(0x2236284E),
                softSurface(0xFFF6E6FC.toInt(), 0xFFE3C7F1.toInt()), null)
            setTextColor(Color.rgb(76, 44, 93))
            setTypeface(typeface, Typeface.BOLD)
            elevation = dp(3).toFloat()
        })
        connectionStatus = text("", 12f).apply {
            background = softSurface(0xEFFFFFFF.toInt(), 0xDDEAF0D5.toInt())
            setPadding(dp(12), dp(10), dp(12), dp(10))
        }
        content.addView(connectionStatus, fullWidth())
        content.addView(button(getString(R.string.retry)) { startPolling() }.apply {
            backgroundTintList = null
            background = RippleDrawable(ColorStateList.valueOf(0x2236284E), rounded(Color.TRANSPARENT), null)
            textSize = 14f
            minHeight = dp(48)
            elevation = 0f
            stateListAnimator = null
        })
    }

    private fun softSurface(top: Int, bottom: Int) = GradientDrawable(
        GradientDrawable.Orientation.TL_BR, intArrayOf(top, bottom)
    ).apply {
        cornerRadius = dp(28).toFloat()
        setStroke(dp(1), 0xCCFFFFFF.toInt())
    }

    private fun launcherCell() = GridLayout.LayoutParams().apply {
        width = 0
        height = GridLayout.LayoutParams.WRAP_CONTENT
        columnSpec = GridLayout.spec(GridLayout.UNDEFINED, 1f)
        setGravity(Gravity.FILL)
        setMargins(dp(2), dp(4), dp(2), dp(10))
    }

    private fun appCard(packageName: String, label: String, installed: Boolean, index: Int, action: () -> Unit): Button {
        val colors = intArrayOf(0xFFE8D4F5.toInt(), 0xFFFFDDCF.toInt(), 0xFFD7EDE1.toInt(), 0xFFD4E8FA.toInt())
        return button(if (installed) label else "$label\nNicht installiert", action).apply {
            tag = installed
            layoutParams = launcherCell()
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            minWidth = 0
            minHeight = dp(112)
            textSize = 14f
            setPadding(dp(4), dp(8), dp(4), dp(8))
            typeface = Typeface.create("sans-serif-rounded", Typeface.BOLD)
            setTextColor(Color.rgb(67, 37, 80))
            backgroundTintList = null
            background = RippleDrawable(ColorStateList.valueOf(0x2236284E), rounded(Color.TRANSPARENT), rounded(Color.WHITE))
            stateListAnimator = null
            elevation = 0f
            compoundDrawablePadding = dp(8)
            val icon = try { packageManager.getApplicationIcon(packageName) }
                catch (_: android.content.pm.PackageManager.NameNotFoundException) {
                    requireNotNull(getDrawable(R.drawable.ic_app_placeholder))
                }
            val framedIcon = LayerDrawable(arrayOf(softSurface(Color.WHITE, colors[index % colors.size]), icon)).apply {
                setLayerInset(1, dp(8), dp(8), dp(8), dp(8))
                setBounds(0, 0, dp(68), dp(68))
            }
            setCompoundDrawablesRelative(null, framedIcon, null, null)
        }
    }

    private fun buildDisconnected() {
        window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        content.addView(text("Handy erneut verbinden", 30f))
        content.addView(text("Ein Elternteil kann den Zugang öffnen und dieses Handy neu koppeln. Der Eltern-Code funktioniert auch ohne Server.", 18f))
        connectionStatus = text("", 16f); content.addView(connectionStatus)
        content.addView(button("Elternzugang") { parentPanel.open() })
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
