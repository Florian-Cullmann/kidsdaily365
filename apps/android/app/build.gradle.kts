plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "de.kidsdaily365.launcher"
    compileSdk = 36
    defaultConfig {
        applicationId = "de.kidsdaily365.launcher"
        minSdk = 33
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0-foundation"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
kotlin {
    jvmToolchain(17)
}
