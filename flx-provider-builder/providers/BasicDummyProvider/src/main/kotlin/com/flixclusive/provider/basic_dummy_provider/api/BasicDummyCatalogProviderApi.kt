package com.flixclusive.provider.basic_dummy_provider.api

import com.flixclusive.model.media.PartialMedia
import com.flixclusive.model.media.common.PaginatedMedia
import com.flixclusive.model.provider.Catalog
import com.flixclusive.provider.capability.CatalogProviderApi

class BasicDummyCatalogProviderApi(
    private val providerId: String,
    private val partialFilms: PaginatedMedia<PartialMedia>,
) : CatalogProviderApi {
    private val catalogs: List<Catalog> = listOf(
        Catalog(
            name = "VESIT Cloud Originals",
            url = "flixclusive://vesit-cloud-originals",
            canPaginate = false,
            providerId = providerId,
        ),
        Catalog(
            name = "Trending Across Microservices",
            url = "flixclusive://trending-microservices",
            canPaginate = false,
            providerId = providerId,
        ),
        Catalog(
            name = "High-Throughput HLS Streams",
            url = "flixclusive://hls-streams",
            canPaginate = false,
            providerId = providerId,
        ),
    )

    override suspend fun getCatalogs(): List<Catalog> {
        return catalogs
    }

    override suspend fun getCatalogItems(
        catalog: Catalog,
        page: Int,
    ): PaginatedMedia<PartialMedia> {
        return partialFilms.copy(page = page)
    }
}
