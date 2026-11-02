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
        versionName = "0.2.0-preview"
    }
    buildFeatures { buildConfig = true }
    sourceSets.getByName("test").resources.srcDir("../../../contracts")
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.11.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20260814")
}
kotlin {
    jvmToolchain(17)
}
