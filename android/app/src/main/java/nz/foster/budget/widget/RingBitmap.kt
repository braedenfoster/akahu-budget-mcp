package nz.foster.budget.widget

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF

private const val TRACK_ALPHA = 64
private const val FILL_ALPHA = 255

/**
 * Glance has no determinate circular indicator, so the widget draws the ring itself. The bitmap is white
 * so the Image tint picks the colour and day/night switching keeps working.
 */
fun ringBitmap(fill: Float, sizePx: Int, strokePx: Float): Bitmap {
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
        fill >= 1f -> canvas.drawOval(bounds, paint)
        fill > 0f -> canvas.drawArc(bounds, -90f, fill * 360f, false, paint)
    }
    return bitmap
}
