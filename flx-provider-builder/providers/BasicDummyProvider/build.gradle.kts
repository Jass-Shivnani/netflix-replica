import com.flixclusive.model.provider.Language
import com.flixclusive.model.provider.ProviderType
import com.flixclusive.model.provider.ProviderStatus

dependencies {
    /*
     * Custom dependencies for each provider should be implemented here.
     * */
    // implementation( ... )

    coreLibraryDesugaring(libs.desugar.jdk.libs)
    implementation(libs.core.stubs.provider)

    // Comment if not implementing own SettingsScreen
    compileOnly(platform(libs.compose.bom))
    compileOnly(libs.compose.material3)
    compileOnly(libs.compose.foundation)
    compileOnly(libs.compose.ui)
    compileOnly(libs.compose.runtime)
    // ================= END: COMPOSE UI =================

    testCompileOnly(libs.jsoup)
    testCompileOnly(libs.okhttp)
    testCompileOnly(libs.mockk)
}

android {
    namespace = "com.flixclusive.provider.template.basic"
}

/*
* BIG TIP: Just hover on a property, and it should provide
* the KDoc/information on what that property does.
*
* If there's no documentation popping up then just
* re-download the source indices.
* */
flxProvider {
    id = "vesit-netflix-replica"
    adult = false
    providerName = "VESIT Netflix Replica"
    description = "Dockerized HLS Video Streaming Platform with NGINX Layer 7 Load Balancing."

    versionMajor = 1
    versionMinor = 0
    versionPatch = 0
    versionBuild = 10000

    changelog = """
    # VESIT Netflix Replica v1.0.0
    - Microservices HLS Video Delivery (Cyberpunk 2099, Interstellar, Silicon Siege, The Dockerfiles, Tokyo Velocity)
    - NGINX Layer 7 Least-Connections Load Balancing
    - Dual endpoints: Android Emulator (10.0.2.2) and Wi-Fi LAN (192.168.1.34)
    - Independent Replica Streams (Replica 1 :8081, Replica 2 :8082, Replica 3 :8083)
    """.trimIndent()

    language = Language.Multiple
    providerType = ProviderType.Movies
    status = ProviderStatus.Working
    // ================


    // === Utilities ===
    /**
     * Toggle this if this provider has its own resources.
     */
    requiresResources = true

    /**
     * Excludes this plugin from the updater,
     * meaning it won't show up for users.
     * Set this if the plugin is unfinished
     */
    // excludeFromUpdaterJson = true // OPTIONAL
    // =================
}

