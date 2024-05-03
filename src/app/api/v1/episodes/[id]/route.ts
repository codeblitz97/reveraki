import { NextRequest, NextResponse } from 'next/server';
import { cache } from '@/functions/cache';
import axios from 'axios';
import {
  EpisodeConsumet,
  convertToEpisode,
} from '@/functions/utilityFunctions';

type Params = {
  params: {
    id: string;
  };
};

interface Episode {
  id: string;
  img: string | null;
  title: string;
  hasDub: boolean;
  number: number;
  rating: number | null;
  isFiller: boolean;
  updatedAt: number;
  description: string | null;
}

interface Provider {
  episodes: Episode[];
  providerId: string;
}

interface EpisodesData {
  data: Provider[];
  latest: {
    updatedAt: number;
    latestTitle: string;
    latestEpisode: number;
  };
}

interface EpisodesResponse {
  episodes: EpisodesData;
}

interface MetadataEpisode {
  id: string;
  description: string;
  hasDub: boolean;
  img: string;
  isFiller: boolean;
  number: number;
  title: string;
  updatedAt: number;
  rating: number;
}

interface EpisodeMetadata {
  number: number;
  title: string;
  fullTitle: string;
  thumbnail: string;
}

interface EpTitle {
  english: string;
  romaji: string;
  native: string;
}

interface AnimeData {
  metadatas: EpisodeMetadata[];
  title: EpTitle;
}

interface MetadataProviderData {
  providerId: string;
  data: MetadataEpisode[];
}

const getOrSetCache = async (key: string, fetchData: Function) => {
  // Get the cached data from redis / node-cache.
  const cachedData = await cache.get(key);

  // If cache data exists, return it.
  if (cachedData) {
    return JSON.parse(cachedData);
  } else {
    // Doesn't exist, fetch data and respond.
    const freshData = await fetchData();
    await cache.set(key, JSON.stringify(freshData), 5 * 60 * 60);
    return freshData;
  }
};

const findEpisodeData = (
  episodes: Episode[],
  metadata: AnimeData,
  information: any,
  episodeImages?: MetadataProviderData[] | undefined
): any => {
  try {
    return episodes.map((episode) => {
      // Find the image data for the episode
      let foundImage = null;
      try {
        foundImage = episodeImages
          ?.find(
            (imageData) => imageData.providerId === 'tvdb' || episodeImages[0]
          )
          ?.data.find((data) => episode.number === data.number);
      } catch (error) {
        foundImage = null;
      }

      // Find the metadata for the episode
      const foundMetadata = metadata.metadatas.find(
        (meta) => meta.number === episode.number
      );

      // Construct episode information
      const img =
        foundImage?.img ??
        foundMetadata?.thumbnail ??
        information.coverImage ??
        episode.img;

      // Construct episode title
      const title =
        episode.title && !episode.title.startsWith('EP')
          ? episode.title
          : foundImage?.title ??
            foundMetadata?.title ??
            `Episode ${episode.number}`;

      // Construct episode description
      const ordinal =
        episode.number === 1
          ? '1st'
          : episode.number === 2
          ? '2nd'
          : episode.number === 3
          ? '3rd'
          : `${episode.number}th`;
      const description =
        episode.description ??
        foundImage?.description ??
        `${ordinal} Episode of ${
          information.title.english ??
          information.title.romaji ??
          information.title.native
        }`;

      return {
        id: episode.id,
        img,
        title,
        description,
        number: episode.number,
      };
    });

    // Error finding metadata:
  } catch (error) {
    return episodes.map((episode) => {
      // Find the metadata for the episode
      const foundMetadata = metadata.metadatas.find(
        (meta) => meta.number === episode.number
      );

      // Construct episode information
      const img =
        foundMetadata?.thumbnail ?? information.coverImage ?? episode.img;

      // Construct episode title
      const title =
        episode.title && !episode.title.startsWith('EP')
          ? episode.title
          : foundMetadata?.title ?? `Episode ${episode.number}`;

      // Construct episode description
      const ordinal =
        episode.number === 1
          ? '1st'
          : episode.number === 2
          ? '2nd'
          : episode.number === 3
          ? '3rd'
          : `${episode.number}th`;
      const description =
        episode.description ??
        `${ordinal} Episode of ${
          information.title.english ??
          information.title.romaji ??
          information.title.native
        }`;

      return {
        id: episode.id,
        img,
        title,
        description,
        number: episode.number,
      };
    });
  }
};

export const GET = async (request: NextRequest, { params }: Params) => {
  try {
    const cacheKey = `episodesData:${params.id}`;
    const cachedEpisodes = await getOrSetCache(cacheKey, async () => {
      try {
        const episodeImagesPromise = axios.get(
          'https://api.anify.tv/content-metadata/' + params.id,
          { timeout: 2000 }
        );
        const episodeMetadataPromise = axios.get(
          `${process.env.NEXT_PUBLIC_DOMAIN}/api/v1/episodesMetadata/${params.id}`
        );
        const informationPromise = axios.get(
          `${process.env.NEXT_PUBLIC_DOMAIN}/api/v1/info/${params.id}`
        );

        const [episodeImagesData, episodeMetadataData, informationData] =
          await Promise.all([
            episodeImagesPromise,
            episodeMetadataPromise,
            informationPromise,
          ]);

        const [episodeImages, episodeMetadata, information] = await Promise.all(
          [
            episodeImagesData.data as Promise<MetadataProviderData[]>,
            episodeMetadataData.data as Promise<AnimeData>,
            informationData.data,
          ]
        );

        try {
          const anifyEpisodes = (
            await axios.get(
              `https://api.anify.tv/info/${params.id}?fields=[episodes]`
            )
          ).data as EpisodesResponse;

          return anifyEpisodes.episodes.data.map((anifyEpisode) => ({
            episodes: findEpisodeData(
              anifyEpisode.episodes,
              episodeMetadata,
              information,
              episodeImages
            ),
            providerId:
              anifyEpisode.providerId === 'zoro' ? 'anirise' : 'anizone',
          }));
        } catch (error) {
          let consumetEpisodes: EpisodeConsumet[] = [];
          try {
            consumetEpisodes = (
              await axios.get(
                `${process.env.CONSUMET_API}/meta/anilist/episodes/${params.id}`
              )
            ).data;
          } catch (consumetError) {
            console.error(
              'Error fetching episodes from consumet API:',
              consumetError
            );
            return NextResponse.json(
              {
                message: 'Internal Server Error',
                status: 500,
              },
              { status: 500 }
            );
          }

          const convertedEpisodes = consumetEpisodes.map(convertToEpisode);

          return [
            {
              episodes: findEpisodeData(
                convertedEpisodes as Episode[],
                episodeMetadata,
                information,
                episodeImages
              ),
              providerId: 'anizone',
            },
          ];
        }
      } catch (error) {
        const episodeMetadataPromise = axios.get(
          `${process.env.NEXT_PUBLIC_DOMAIN}/api/v1/episodesMetadata/${params.id}`
        );
        const informationPromise = axios.get(
          `${process.env.NEXT_PUBLIC_DOMAIN}/api/v1/info/${params.id}`
        );

        const [episodeMetadataData, informationData] = await Promise.all([
          episodeMetadataPromise,
          informationPromise,
        ]);

        const [episodeMetadata, information] = await Promise.all([
          episodeMetadataData.data as Promise<AnimeData>,
          informationData.data,
        ]);

        try {
          const anifyEpisodes = (
            await axios.get(
              `https://api.anify.tv/info/${params.id}?fields=[episodes]`
            )
          ).data as EpisodesResponse;

          return anifyEpisodes.episodes.data.map((anifyEpisode) => ({
            episodes: findEpisodeData(
              anifyEpisode.episodes,
              episodeMetadata,
              information
            ),
            providerId:
              anifyEpisode.providerId === 'zoro' ? 'anirise' : 'anizone',
          }));
        } catch (error) {
          let consumetEpisodes: EpisodeConsumet[] = [];
          try {
            consumetEpisodes = (
              await axios.get(
                `${process.env.CONSUMET_API}/meta/anilist/episodes/${params.id}`
              )
            ).data;
          } catch (consumetError) {
            console.error(
              'Error fetching episodes from consumet API:',
              consumetError
            );
            return NextResponse.json(
              {
                message: 'Internal Server Error',
                status: 500,
              },
              { status: 500 }
            );
          }

          const convertedEpisodes = consumetEpisodes.map(convertToEpisode);

          return [
            {
              episodes: findEpisodeData(
                convertedEpisodes as Episode[],
                episodeMetadata,
                information
              ),
              providerId: 'anizone',
            },
          ];
        }
      }
    });

    return NextResponse.json(cachedEpisodes);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        message: 'Internal Server Error',
        status: 500,
      },
      { status: 500 }
    );
  }
};