package de.kidsdaily365.launcher

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.WindowInsets
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/** Native HOME entry point. This foundation deliberately does not apply device restrictions. */
class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val spacing = (24 * resources.displayMetrics.density).toInt()
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(spacing, spacing, spacing, spacing)
        }
        content.addView(text(R.string.unmanaged, 16f, Color.rgb(130, 70, 90)))
        content.addView(ImageView(this).apply {
            setImageResource(R.drawable.buddy_fox)
            importantForAccessibility = ImageView.IMPORTANT_FOR_ACCESSIBILITY_NO
            adjustViewBounds = true
            layoutParams = LinearLayout.LayoutParams(spacing * 10, spacing * 10)
        })
        content.addView(text(R.string.greeting, 30f))
        content.addView(text(R.string.explanation, 20f))
        content.addView(text(R.string.connection, 18f))
        content.addView(text(R.string.parent_setup, 16f))
        setContentView(ScrollView(this).apply {
            addView(content)
            setOnApplyWindowInsetsListener { view, insets ->
                val bars = insets.getInsets(WindowInsets.Type.systemBars())
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
                insets
            }
        })
    }

    private fun text(resource: Int, size: Float, color: Int = Color.rgb(64, 48, 82)) = TextView(this).apply {
        setText(resource)
        textSize = size
        setTextColor(color)
        gravity = Gravity.CENTER
        setPadding(0, 16, 0, 16)
    }
}
