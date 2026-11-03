package de.kidsdaily365.launcher

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.view.View
import org.json.JSONObject
import kotlin.math.min

/** Same 512-square composition and bundled manifest as the web, with no network assets. */
class BuddyView(context: Context) : View(context) {
    private val manifest = runCatching {
        JSONObject(context.assets.open("manifest.json").bufferedReader().use { it.readText() })
    }.getOrNull()
    private var buddy: Buddy? = null
    private var base = context.getDrawable(R.drawable.buddy_fox)
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { strokeJoin = Paint.Join.ROUND }

    fun show(value: Buddy?) {
        buddy = value
        base = context.getDrawable(when (value?.kind) {
            "rabbit" -> R.drawable.buddy_rabbit
            "bear" -> R.drawable.buddy_bear
            else -> R.drawable.buddy_fox
        })
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val side = min(width, height).toFloat()
        if (side <= 0) return
        canvas.save()
        canvas.translate((width - side) / 2, (height - side) / 2)
        canvas.scale(side / 512f, side / 512f)
        base?.let {
            val scale = 512f / maxOf(it.intrinsicWidth, it.intrinsicHeight)
            val w = (it.intrinsicWidth * scale).toInt()
            val h = (it.intrinsicHeight * scale).toInt()
            it.setBounds((512 - w) / 2, (512 - h) / 2, (512 + w) / 2, (512 + h) / 2)
            it.draw(canvas)
        }
        // Cosmetic failures must never affect the authorization/policy state or base buddy.
        runCatching {
            val spec = manifest ?: return@runCatching
            val value = buddy ?: return@runCatching
            val anchors = spec.getJSONObject("buddies").optJSONObject(value.kind) ?: return@runCatching
            val catalog = spec.getJSONObject("accessories")
            val slots = spec.getJSONObject("slots")
            value.cosmeticIds.distinct().mapNotNull { catalog.optJSONObject(it) }
                .sortedBy { slots.getJSONObject(it.getString("slot")).getInt("layer") }
                .forEach { item ->
                    val anchor = anchors.optJSONObject(item.getString("slot")) ?: return@forEach
                    val path = Path()
                    val points = item.getJSONArray("points")
                    val size = anchor.getDouble("size").toFloat() / 100f
                    for (i in 0 until points.length()) {
                        val point = points.getJSONArray(i)
                        val x = anchor.getDouble("x").toFloat() + point.getDouble(0).toFloat() * size
                        val y = anchor.getDouble("y").toFloat() + point.getDouble(1).toFloat() * size
                        if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
                    }
                    path.close()
                    paint.style = Paint.Style.FILL
                    paint.color = Color.parseColor(item.getString("fill"))
                    canvas.drawPath(path, paint)
                    paint.style = Paint.Style.STROKE
                    paint.strokeWidth = item.getDouble("strokeWidth").toFloat() * size
                    paint.color = Color.parseColor(item.getString("stroke"))
                    canvas.drawPath(path, paint)
                }
        }
        canvas.restore()
    }
}
