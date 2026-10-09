package com.flixclusive.provider.basic_dummy_provider

import com.flixclusive.model.media.MediaMetadata
import com.flixclusive.model.media.Movie
import com.flixclusive.model.media.PartialMedia
import com.flixclusive.model.media.Show
import com.flixclusive.model.media.common.MediaIdSource
import com.flixclusive.model.media.common.MediaType
import com.flixclusive.model.media.common.PaginatedMedia
import java.util.Calendar

internal const val CYBERPUNK_ID = "cyberpunk-2099"
internal const val INTERSTELLAR_ID = "interstellar-odyssey"
internal const val SILICON_SIEGE_ID = "silicon-siege"
internal const val DOCKERFILES_ID = "the-dockerfiles"
internal const val TOKYO_VELOCITY_ID = "tokyo-velocity"

internal fun samplePartialFilms(providerId: String): PaginatedMedia<PartialMedia> {
    val calendar = Calendar.getInstance()
    calendar.set(2026, Calendar.OCTOBER, 1)
    val date = calendar.time.time

    return PaginatedMedia(
        page = 1,
        hasNextPage = false,
        totalPages = 1,
        results = listOf(
            PartialMedia(
                id = CYBERPUNK_ID,
                title = "Cyberpunk 2099: Neo-Veridia",
                posterImage = "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800",
                releaseDate = date,
                providerId = providerId,
                type = MediaType.MOVIE,
                homePage = "http://10.0.2.2:5000",
                rating = 9.8,
                overview = "In the high-density megacity of Neo-Veridia, rogue neural algorithms infiltrate the distributed cloud mainframe. A hacker-detective must bypass load-balanced firewalls before total singularity.",
            ),
            PartialMedia(
                id = INTERSTELLAR_ID,
                title = "Interstellar: Beyond The Event Horizon",
                posterImage = "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800",
                releaseDate = date,
                providerId = providerId,
                type = MediaType.MOVIE,
                homePage = "http://10.0.2.2:5000",
                rating = 9.9,
                overview = "A deep space reconnaissance expedition travels across cosmic rings and swirling sapphire nebulae to discover an ancient planetary beacon emitting quantum transmission pulses.",
            ),
            PartialMedia(
                id = SILICON_SIEGE_ID,
                title = "Silicon Siege: Zero-Downtime Protocol",
                posterImage = "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800",
                releaseDate = date,
                providerId = providerId,
                type = MediaType.MOVIE,
                homePage = "http://10.0.2.2:5000",
                rating = 9.6,
                overview = "When zero-day memory leaks threaten a Tier-4 hyperscale cloud facility, an infrastructure reliability team initiates the failover sequence across multi-zone Kubernetes clusters.",
            ),
            PartialMedia(
                id = DOCKERFILES_ID,
                title = "The Dockerfiles: Secrets of Layer 7",
                posterImage = "https://images.unsplash.com/photo-1607799279861-4dd421887fb3?w=800",
                releaseDate = date,
                providerId = providerId,
                type = MediaType.MOVIE,
                homePage = "http://10.0.2.2:5000",
                rating = 9.7,
                overview = "An investigative documentary into the mechanics of Linux cgroups, namespaces, and NGINX reverse-proxy scheduling under extreme real-time concurrency.",
            ),
            PartialMedia(
                id = TOKYO_VELOCITY_ID,
                title = "Tokyo Velocity: Drift Protocol",
                posterImage = "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800",
                releaseDate = date,
                providerId = providerId,
                type = MediaType.MOVIE,
                homePage = "http://10.0.2.2:5000",
                rating = 9.5,
                overview = "High-speed autonomous drift machines clash across the neon-lit highways of the Shuto Expressway, synchronizing their telemetry through low-latency edge nodes.",
            ),
        ),
    )
}

internal fun sampleMetadata(providerId: String, media: PartialMedia): MediaMetadata {
    val calendar = Calendar.getInstance()
    calendar.set(2026, Calendar.OCTOBER, 1)
    val date = calendar.time.time

    return when (media.id) {
        CYBERPUNK_ID -> Movie(
            id = CYBERPUNK_ID,
            title = "Cyberpunk 2099: Neo-Veridia",
            posterImage = "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800",
            backdropImage = "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1200",
            releaseDate = date,
            providerId = providerId,
            homePage = "http://10.0.2.2:5000",
            rating = 9.8,
            runtime = 30,
            overview = "In the high-density megacity of Neo-Veridia, rogue neural algorithms infiltrate the distributed cloud mainframe. A hacker-detective must bypass load-balanced firewalls before total singularity.",
        )
        INTERSTELLAR_ID -> Movie(
            id = INTERSTELLAR_ID,
            title = "Interstellar: Beyond The Event Horizon",
            posterImage = "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800",
            backdropImage = "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200",
            releaseDate = date,
            providerId = providerId,
            homePage = "http://10.0.2.2:5000",
            rating = 9.9,
            runtime = 36,
            overview = "A deep space reconnaissance expedition travels across cosmic rings and swirling sapphire nebulae to discover an ancient planetary beacon emitting quantum transmission pulses.",
        )
        SILICON_SIEGE_ID -> Movie(
            id = SILICON_SIEGE_ID,
            title = "Silicon Siege: Zero-Downtime Protocol",
            posterImage = "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800",
            backdropImage = "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1200",
            releaseDate = date,
            providerId = providerId,
            homePage = "http://10.0.2.2:5000",
            rating = 9.6,
            runtime = 25,
            overview = "When zero-day memory leaks threaten a Tier-4 hyperscale cloud facility, an infrastructure reliability team initiates the failover sequence across multi-zone Kubernetes clusters.",
        )
        DOCKERFILES_ID -> Movie(
            id = DOCKERFILES_ID,
            title = "The Dockerfiles: Secrets of Layer 7",
            posterImage = "https://images.unsplash.com/photo-1607799279861-4dd421887fb3?w=800",
            backdropImage = "https://images.unsplash.com/photo-1607799279861-4dd421887fb3?w=1200",
            releaseDate = date,
            providerId = providerId,
            homePage = "http://10.0.2.2:5000",
            rating = 9.7,
            runtime = 40,
            overview = "An investigative documentary into the mechanics of Linux cgroups, namespaces, and NGINX reverse-proxy scheduling under extreme real-time concurrency.",
        )
        TOKYO_VELOCITY_ID -> Movie(
            id = TOKYO_VELOCITY_ID,
            title = "Tokyo Velocity: Drift Protocol",
            posterImage = "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800",
            backdropImage = "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=1200",
            releaseDate = date,
            providerId = providerId,
            homePage = "http://10.0.2.2:5000",
            rating = 9.5,
            runtime = 28,
            overview = "High-speed autonomous drift machines clash across the neon-lit highways of the Shuto Expressway, synchronizing their telemetry through low-latency edge nodes.",
        )
        else -> Movie(
            id = media.id,
            title = media.title,
            posterImage = media.posterImage,
            releaseDate = date,
            providerId = providerId,
            homePage = "http://10.0.2.2:5000",
            rating = 9.0,
            runtime = 30,
            overview = media.overview ?: "VESIT Advanced Cloud Computing HLS Stream",
        )
    }
}
