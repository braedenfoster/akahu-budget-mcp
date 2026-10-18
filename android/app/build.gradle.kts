import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// Build config lives outside git. Lookup order: Gradle property, environment
// variable, android/local.properties, then the repo's deploy/.env.
val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use(::load)
}

val deployEnv: Map<String, String> = rootProject.file("../deploy/.env").let { file ->
    if (!file.exists()) return@let emptyMap()
    file.readLines()
        .map { it.trim() }
        .filter { it.isNotEmpty() && !it.startsWith("#") && it.contains("=") }
        .associate { line ->
            val key = line.substringBefore("=").trim().removePrefix("export ").trim()
            val value = line.substringAfter("=").trim().removeSurrounding("\"").removeSurrounding("'")
            key to value
        }
}

fun budgetConfig(key: String): String? =
    (providers.gradleProperty(key).orNull
        ?: System.getenv(key)
        ?: localProperties.getProperty(key)
        ?: deployEnv[key])
        ?.trim()
        ?.takeIf { it.isNotEmpty() }

val stytchClientId = budgetConfig("STYTCH_ANDROID_CLIENT_ID")
val authIssuer = budgetConfig("AUTH_ISSUER")
val apiBaseUrl = budgetConfig("PUBLIC_URL")

val keystoreFile = budgetConfig("ANDROID_KEYSTORE_PATH")
    ?.replaceFirst(Regex("^~(?=/)"), System.getProperty("user.home"))
    ?.let(::file)
val keystorePassword = budgetConfig("ANDROID_KEYSTORE_PASSWORD")
val releaseKeyAlias = budgetConfig("ANDROID_KEY_ALIAS")
val releaseKeyPassword = budgetConfig("ANDROID_KEY_PASSWORD")
val releaseSigningReady = keystoreFile?.isFile == true &&
    keystorePassword != null && releaseKeyAlias != null && releaseKeyPassword != null

val missingAppConfig = listOfNotNull(
    "STYTCH_ANDROID_CLIENT_ID".takeIf { stytchClientId == null },
    "AUTH_ISSUER".takeIf { authIssuer == null },
    "PUBLIC_URL".takeIf { apiBaseUrl == null },
)
val missingReleaseConfig = missingAppConfig + listOfNotNull(
    "ANDROID_KEYSTORE_PATH (no file at ${keystoreFile ?: "<unset>"})".takeIf { keystoreFile?.isFile != true },
    "ANDROID_KEYSTORE_PASSWORD".takeIf { keystorePassword == null },
    "ANDROID_KEY_ALIAS".takeIf { releaseKeyAlias == null },
    "ANDROID_KEY_PASSWORD".takeIf { releaseKeyPassword == null },
)

if (missingAppConfig.isNotEmpty()) {
    logger.warn(
        "Budget: missing ${missingAppConfig.joinToString()}. Debug builds will show a " +
            "configuration error instead of Sign in. See android/README.md.",
    )
}

fun String.asBuildConfigString() = "\"" + replace("\\", "\\\\").replace("\"", "\\\"") + "\""

android {
    namespace = "nz.foster.budget"
    compileSdk = 35
    buildToolsVersion = "35.0.0"

    defaultConfig {
        applicationId = "nz.foster.budget"
        minSdk = 31
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        manifestPlaceholders["appAuthRedirectScheme"] = "nz.foster.budget"

        buildConfigField("String", "STYTCH_CLIENT_ID", (stytchClientId ?: "").asBuildConfigString())
        buildConfigField("String", "AUTH_ISSUER", (authIssuer ?: "").asBuildConfigString())
        buildConfigField("String", "API_BASE_URL", (apiBaseUrl ?: "").asBuildConfigString())
    }

    signingConfigs {
        create("release") {
            if (releaseSigningReady) {
                storeFile = keystoreFile
                storePassword = keystorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (releaseSigningReady) signingConfigs.getByName("release") else null
        }
    }

    buildFeatures {
        buildConfig = true
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    // The contract tests read the server-generated files in place, not a copy.
    val contractsDir = rootProject.file("../contracts")
    testOptions {
        unitTests.all {
            it.systemProperty("budget.contractsDir", contractsDir.absolutePath)
            it.inputs.dir(contractsDir)
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

val checkReleaseConfig by tasks.registering {
    description = "Fails the release build when the Stytch client or the release keystore is not configured."
    val missing = missingReleaseConfig
    doLast {
        if (missing.isNotEmpty()) {
            throw GradleException(
                "Release build is not configured. Missing: ${missing.joinToString()}. " +
                    "Set each value as a Gradle property, an environment variable, " +
                    "android/local.properties, or deploy/.env. See android/README.md.",
            )
        }
    }
}

tasks.matching { it.name == "preReleaseBuild" }.configureEach {
    dependsOn(checkReleaseConfig)
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.material3)
    implementation(libs.appauth)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
}
