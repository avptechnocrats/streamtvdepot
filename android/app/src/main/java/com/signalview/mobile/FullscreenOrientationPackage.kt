package com.streamtvdepot.mobile

import android.app.Activity
import android.content.pm.ActivityInfo
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.uimanager.ViewManager
import java.lang.ref.WeakReference

class FullscreenOrientationPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
      listOf(FullscreenOrientationModule(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

private class FullscreenOrientationModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private var previousOrientation: Int? = null
  private var fullscreenActivity: WeakReference<Activity>? = null

  override fun getName(): String = "FullscreenOrientation"

  @ReactMethod
  fun enter() {
    UiThreadUtil.runOnUiThread {
      val activity = currentActivity ?: return@runOnUiThread
      if (fullscreenActivity?.get() === activity) return@runOnUiThread
      previousOrientation = activity.requestedOrientation
      fullscreenActivity = WeakReference(activity)
      activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
    }
  }

  @ReactMethod
  fun exit() {
    UiThreadUtil.runOnUiThread {
      val orientation = previousOrientation ?: return@runOnUiThread
      fullscreenActivity?.get()?.let { activity ->
        if (!activity.isFinishing && !activity.isDestroyed) activity.requestedOrientation = orientation
      }
      previousOrientation = null
      fullscreenActivity = null
    }
  }
}