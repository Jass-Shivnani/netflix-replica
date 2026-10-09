package com.flixclusive.provider.basic_dummy_provider.api

import com.flixclusive.model.media.MediaMetadata
import com.flixclusive.model.media.common.tv.Episode
import com.flixclusive.model.provider.link.MediaLink
import com.flixclusive.model.provider.link.Stream
import com.flixclusive.provider.capability.MediaLinkProviderApi
import com.flixclusive.provider.capability.MediaLinkType

class BasicDummyMediaLinkProviderApi : MediaLinkProviderApi {
    override val supportedLinkTypes: Set<MediaLinkType> = setOf(
        MediaLinkType.STREAMS,
    )
    
    override suspend fun getLinks(
        media: MediaMetadata,
        episode: Episode?,
        onLinkFound: (MediaLink) -> Unit
    ) {
        val movieId = media.id

        // 1. Public Cloudflare HTTPS Tunnel (Worldwide / College / Remote)
        onLinkFound(
            Stream(
                url = "https://mountains-license-times-barnes.trycloudflare.com/stream/$movieId/playlist.m3u8",
                name = "Public Cloudflare HTTPS Tunnel (Remote / College)",
                description = "Secure global HTTPS connection to home streaming cluster",
            )
        )

        // 2. Primary NGINX Layer 7 Load Balancer (Android Emulator)
        onLinkFound(
            Stream(
                url = "http://10.0.2.2/stream/$movieId/playlist.m3u8",
                name = "NGINX Layer 7 Load Balancer (Emulator: 10.0.2.2)",
                description = "Horizontally load-balanced via least_conn upstream pool",
            )
        )

        // 2. NGINX Layer 7 Load Balancer (Physical Phone over Wi-Fi)
        onLinkFound(
            Stream(
                url = "http://192.168.1.34/stream/$movieId/playlist.m3u8",
                name = "NGINX Layer 7 Load Balancer (LAN: 192.168.1.34)",
                description = "Horizontally load-balanced for physical mobile device",
            )
        )

        // 3. Fallback Port 8000 (Host Multi-Process Dev Runner)
        onLinkFound(
            Stream(
                url = "http://10.0.2.2:8000/stream/$movieId/playlist.m3u8",
                name = "Dev-Runner Ingress Port 8000 (Emulator)",
                description = "Fallback host port 8000 proxying streaming cluster",
            )
        )

        // 4. Direct Streaming Replica 1 (Demonstration of decoupled architecture)
        onLinkFound(
            Stream(
                url = "http://10.0.2.2:8081/stream/$movieId/playlist.m3u8",
                name = "Direct Streaming Replica 1 (:8081)",
                description = "Direct container access proving service isolation",
            )
        )

        // 5. Direct Streaming Replica 2
        onLinkFound(
            Stream(
                url = "http://10.0.2.2:8082/stream/$movieId/playlist.m3u8",
                name = "Direct Streaming Replica 2 (:8082)",
                description = "Direct container access proving service isolation",
            )
        )

        // 6. Direct Streaming Replica 3
        onLinkFound(
            Stream(
                url = "http://10.0.2.2:8083/stream/$movieId/playlist.m3u8",
                name = "Direct Streaming Replica 3 (:8083)",
                description = "Direct container access proving service isolation",
            )
        )

        // 7. Public Internet Tunnel (Remote / College Access)
        onLinkFound(
            Stream(
                url = "https://vesit-stream.loca.lt/stream/$movieId/playlist.m3u8",
                name = "Public Internet Tunnel (College Demo: vesit-stream.loca.lt)",
                description = "Remote HTTPS tunnel connecting phone at college to home laptop",
            )
        )
    }
}