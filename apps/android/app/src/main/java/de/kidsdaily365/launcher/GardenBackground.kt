package de.kidsdaily365.launcher

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorFilter
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.Shader
import android.graphics.drawable.Drawable

/** Quiet, locally drawn scenery. No animation or network imagery. */
class GardenBackground : Drawable() {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    override fun draw(canvas: Canvas) {
        val w = bounds.width().toFloat()
        val h = bounds.height().toFloat()
        if (w <= 0 || h <= 0) return
        canvas.save()
        canvas.translate(bounds.left.toFloat(), bounds.top.toFloat())
        paint.shader = LinearGradient(0f, 0f, w, h,
            intArrayOf(0xFFEADDF8.toInt(), 0xFFFFF0EC.toInt(), 0xFFFFF6DE.toInt()), null, Shader.TileMode.CLAMP)
        canvas.drawRect(0f, 0f, w, h, paint)
        paint.shader = null
        paint.color = 0x70FFFFFF
        for ((x, y) in listOf(.12f to .19f, .8f to .1f)) {
            canvas.drawOval(w * (x - .12f), h * y, w * (x + .14f), h * (y + .035f), paint)
            canvas.drawCircle(w * x, h * y, w * .055f, paint)
        }
        paint.color = 0xFFDFE9BC.toInt()
        canvas.drawOval(-w * .5f, h * .91f, w * 1.1f, h * 1.23f, paint)
        paint.color = 0xFFCFDEAC.toInt()
        canvas.drawOval(w * .35f, h * .94f, w * 1.6f, h * 1.16f, paint)
        for (right in listOf(false, true)) {
            canvas.save()
            if (right) { canvas.translate(w, 0f); canvas.scale(-1f, 1f) }
            paint.color = 0xFFAAC789.toInt()
            val stem = Path().apply {
                moveTo(w * .035f, h)
                quadTo(w * .09f, h * .94f, w * .025f, h * .87f)
            }
            paint.style = Paint.Style.STROKE; paint.strokeWidth = w * .006f
            canvas.drawPath(stem, paint); paint.style = Paint.Style.FILL
            for (i in 0..3) {
                val y = h * (.9f + i * .022f)
                paint.color = if (i % 2 == 0) 0xFFBDD394.toInt() else 0xFF9DBF85.toInt()
                canvas.drawOval(w * .025f, y, w * .12f, y + h * .024f, paint)
                canvas.drawOval(-w * .025f, y - h * .014f, w * .04f, y + h * .01f, paint)
            }
            paint.color = 0xFFD9BAEB.toInt()
            canvas.drawCircle(w * .12f, h * .956f, w * .018f, paint)
            paint.color = 0xFFFFDA85.toInt()
            canvas.drawCircle(w * .12f, h * .956f, w * .007f, paint)
            canvas.restore()
        }
        canvas.restore()
    }
    override fun setAlpha(alpha: Int) { paint.alpha = alpha; invalidateSelf() }
    override fun setColorFilter(colorFilter: ColorFilter?) { paint.colorFilter = colorFilter; invalidateSelf() }
    @Deprecated("Drawable opacity is no longer used")
    override fun getOpacity(): Int = PixelFormat.OPAQUE
}
