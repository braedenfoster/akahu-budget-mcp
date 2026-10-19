package nz.foster.budget.widget

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import kotlin.math.cos
import kotlin.math.sin
import nz.foster.budget.allowance.SpendingRing

private const val TRACK_ALPHA = 64
private const val FILL_ALPHA = 255

/**
 * Glance has no determinate circular indicator, so the widget draws the ring itself. The bitmap is white
 * so the Image tint picks the colour from [SpendingRing.tone] and day/night switching keeps working.
 */
fun ringBitmap(ring: SpendingRing, sizePx: Int, strokePx: Float): Bitmap {
    val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val inset = strokePx / 2
    val bounds = RectF(inset, inset, sizePx - inset, sizePx - inset)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = strokePx
        strokeCap = Paint.Cap.ROUND
        color = android.graphics.Color.WHITE
    }

    paint.alpha = TRACK_ALPHA
    canvas.drawOval(bounds, paint)

    paint.alpha = FILL_ALPHA
    when {
        ring.fill >= 1f -> canvas.drawOval(bounds, paint)
        ring.fill > 0f -> canvas.drawArc(bounds, -90f, ring.fill * 360f, false, paint)
    }

    // The tick shares the fill's colour, so it reaches inside the ring to stay visible once the fill passes it.
    val angle = Math.toRadians(-90.0 + ring.pace * 360.0)
    val dx = cos(angle).toFloat()
    val dy = sin(angle).toFloat()
    val radius = sizePx / 2f
    val inner = radius - 2 * strokePx
    paint.strokeWidth = strokePx / 2
    paint.strokeCap = Paint.Cap.BUTT
    canvas.drawLine(radius + radius * dx, radius + radius * dy, radius + inner * dx, radius + inner * dy, paint)
    return bitmap
}
