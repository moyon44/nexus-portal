// Jellyfin API Service
// Use the host IP instead of localhost since this runs in Docker
const JELLYFIN_URL = process.env.JELLYFIN_URL || 'http://localhost:8096';
const JELLYFIN_API_KEY = process.env.JELLYFIN_API_KEY || '';

interface JellyfinUser {
  Name: string;
  Id: string;
  PrimaryImageTag?: string;
}

interface JellyfinItem {
  Name: string;
  Id: string;
  ImageTags?: { Primary?: string };
  ProductionYear?: number;
  CommunityRating?: number;
  DateCreated?: string;
  Genres?: string[];
  UserData?: {
    PlaybackPositionTicks: number;
    PlayCount: number;
    PlayedPercentage?: number;
    LastPlayedDate?: string;
    Played?: boolean;
    UnplayedItemCount?: number;
  };
  RecursiveUnplayedItemCount?: number;
  RecursiveItemCount?: number;
}

interface UserMediaStats {
  userId: string;
  userName: string;
  avatarTag?: string;
  movieCount: number;
  seriesCount: number;
  movies: JellyfinItem[];
  series: JellyfinItem[];
}

interface UserMovieStats extends UserMediaStats {}

interface GlobalStats {
  totalMoviesWatched: number;
  totalSeriesWatched: number;
  totalMediaWatched: number;
  totalUsers: number;
  mostActiveUser?: { name: string; movieCount: number; seriesCount: number };
  topGenres?: { genre: string; count: number }[];
}

interface SharedMediaItem {
  item: JellyfinItem;
  viewers: string[]; // List of user names who watched this
  viewerCount: number;
  type: 'movie' | 'series';
}

interface SharedMediaStats {
  sharedMovies: SharedMediaItem[];
  sharedSeries: SharedMediaItem[];
}

interface RecentActivity {
  userName: string;
  itemName: string;
  itemId: string;
  lastPlayedDate: string;
  playCount: number;
  type: 'movie' | 'series';
  isCurrentlyWatching: boolean; // Recently active (within last 10 minutes)
  itemPoster?: string;
}

interface ActivityStats {
  recentActivities: RecentActivity[];
  weeklyActivityData: Array<{
    date: string;
    movies: number;
    series: number;
    total: number;
    activeUsers: string[];
    activeUserCount: number;
    activities: RecentActivity[];
  }>;
  currentlyWatching: Array<{
    userName: string;
    itemName: string;
    type: 'movie' | 'series';
    progress: number; // 0-100
    duration: number; // in seconds
    elapsed: number; // in seconds
  }>;
  topContent: Array<{
    name: string;
    type: 'movie' | 'series';
    views: number;
    viewers: string[];
  }>;
  userActivity: Array<{
    userName: string;
    totalMinutes: number;
    itemsWatched: number;
  }>;
  weekStats: {
    totalWatchTime: number; // in minutes
    averagePerDay: number; // in minutes
    totalItems: number;
    uniqueUsers: number;
  };
}

interface UserGenreStats {
  userName: string;
  genres: Array<{
    genre: string;
    count: number;
    percentage: number;
  }>;
  totalItems: number;
}

interface Recommendation {
  item: JellyfinItem;
  type: 'movie' | 'series';
  viewedByCount: number;
  viewedBy: string[];
}

interface CollaborativeRecommendations {
  userId: string;
  userName: string;
  recommendations: Recommendation[];
}

async function fetchJellyfin(endpoint: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(`${JELLYFIN_URL}${endpoint}`);
  url.searchParams.set('api_key', JELLYFIN_API_KEY);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  try {
    const response = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Jellyfin API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data as any;
  } catch (error) {
    console.error('Jellyfin API call failed:', error);
    throw error;
  }
}

// Debug function to see all series for a user without filtering
export async function debugGetAllSeries(userId: string): Promise<JellyfinItem[]> {
  let allItems: JellyfinItem[] = [];
  let startIndex = 0;
  const limit = 500;

  for (let page = 0; page < 10; page++) {
    const data: any = await fetchJellyfin(`/Users/${userId}/Items`, {
      IncludeItemTypes: 'Series',
      Recursive: 'true',
      SortBy: 'DateCreated',
      SortOrder: 'Descending',
      StartIndex: startIndex.toString(),
      Limit: limit.toString(),
      Fields: 'PrimaryImageTag,ImageTags,ProductionYear,CommunityRating,UserData,RecursiveUnplayedItemCount,RecursiveItemCount'
    });

    const items = (data?.Items || []) as JellyfinItem[];
    if (items.length === 0) break;
    allItems = allItems.concat(items);
    startIndex += limit;
    if (items.length < limit) break;
  }

  return allItems;
}

export const jellyfinService = {
  async getUsers(): Promise<JellyfinUser[]> {
    const data = await fetchJellyfin('/Users');
    return (Array.isArray(data) ? data : []) as JellyfinUser[];
  },

  async getUserMovies(userId: string): Promise<JellyfinItem[]> {
    let allItems: JellyfinItem[] = [];
    let startIndex = 0;
    const limit = 500;
    const maxPages = 100; // Récupérer jusqu'à 50,000 items (500 * 100)

    for (let page = 0; page < maxPages; page++) {
      const data: any = await fetchJellyfin(`/Users/${userId}/Items`, {
        IncludeItemTypes: 'Movie',
        Recursive: 'true',
        SortBy: 'DateCreated',
        SortOrder: 'Descending',
        StartIndex: startIndex.toString(),
        Limit: limit.toString(),
        Fields: 'PrimaryImageTag,ImageTags,ProductionYear,CommunityRating,UserData'
      });

      const items = (data?.Items || []) as JellyfinItem[];
      if (items.length === 0) break;

      allItems = allItems.concat(items);
      startIndex += limit;

      // If we got less than the limit, we've reached the end
      if (items.length < limit) break;
    }

    // Filter: show only movies that have been watched
    // A movie is considered watched if:
    // 1. Played = true
    // 2. PlayCount > 0 (movie marked as viewed)
    // 3. PlaybackPositionTicks > 0 (user started watching)
    // 4. PlayedPercentage > 0 (any progress watching)
    return allItems.filter(item => {
      const userData = item.UserData;
      if (!userData) return false;

      return userData.Played === true ||
             (userData.PlayCount && userData.PlayCount > 0) ||
             (userData.PlaybackPositionTicks && userData.PlaybackPositionTicks > 0) ||
             (userData.PlayedPercentage && userData.PlayedPercentage > 0);
    });
  },

  async getUserSeries(userId: string): Promise<JellyfinItem[]> {
    let allItems: JellyfinItem[] = [];
    let startIndex = 0;
    const limit = 500;
    const maxPages = 100; // Récupérer jusqu'à 50,000 items (500 * 100)

    for (let page = 0; page < maxPages; page++) {
      const data: any = await fetchJellyfin(`/Users/${userId}/Items`, {
        IncludeItemTypes: 'Series',
        Recursive: 'true',
        SortBy: 'DateCreated',
        SortOrder: 'Descending',
        StartIndex: startIndex.toString(),
        Limit: limit.toString(),
        Fields: 'PrimaryImageTag,ImageTags,ProductionYear,CommunityRating,UserData,RecursiveUnplayedItemCount,RecursiveItemCount'
      });

      const items = (data?.Items || []) as JellyfinItem[];
      if (items.length === 0) break;

      allItems = allItems.concat(items);
      startIndex += limit;

      // If we got less than the limit, we've reached the end
      if (items.length < limit) break;
    }

    // Filter: show only series that have been watched
    // A series is considered watched if:
    // 1. Played = true (all episodes watched)
    // 2. PlayCount > 0 (series marked as viewed)
    // 3. PlaybackPositionTicks > 0 (user started watching)
    // 4. PlayedPercentage > 0 (any episodes watched - indicator from Jellyfin)
    // 5. RecursiveUnplayedItemCount === 0 (all episodes watched)
    return allItems.filter(item => {
      const userData = item.UserData;
      if (!userData) return false;

      const played = userData.Played === true;
      const hasPlayCount = userData.PlayCount && userData.PlayCount > 0;
      const hasPlaybackPosition = userData.PlaybackPositionTicks && userData.PlaybackPositionTicks > 0;
      const hasPlayedPercentage = userData.PlayedPercentage && userData.PlayedPercentage > 0;
      const allEpisodesWatched = item.RecursiveUnplayedItemCount === 0;

      // Show if any of these conditions are true
      return played || hasPlayCount || hasPlaybackPosition || hasPlayedPercentage || allEpisodesWatched;
    });
  },

  async getGlobalStats(): Promise<GlobalStats> {
    try {
      const users = await this.getUsers();

      let totalMoviesWatched = 0;
      let totalSeriesWatched = 0;
      const userStats: Array<{ name: string; movieCount: number; seriesCount: number }> = [];

      for (const user of users) {
        const [movies, series] = await Promise.all([
          this.getUserMovies(user.Id),
          this.getUserSeries(user.Id)
        ]);
        totalMoviesWatched += movies.length;
        totalSeriesWatched += series.length;
        userStats.push({ name: user.Name, movieCount: movies.length, seriesCount: series.length });
      }

      userStats.sort((a, b) => (b.movieCount + b.seriesCount) - (a.movieCount + a.seriesCount));

      return {
        totalMoviesWatched,
        totalSeriesWatched,
        totalMediaWatched: totalMoviesWatched + totalSeriesWatched,
        totalUsers: users.length,
        mostActiveUser: userStats[0],
        topGenres: []
      };
    } catch (error) {
      console.error('Failed to get global stats:', error);
      throw error;
    }
  },

  async getUserMovieStats(userId: string): Promise<UserMovieStats> {
    try {
      const users = await this.getUsers();
      const user = users.find(u => u.Id === userId);

      if (!user) {
        throw new Error('User not found');
      }

      const [movies, series] = await Promise.all([
        this.getUserMovies(userId),
        this.getUserSeries(userId)
      ]);

      return {
        userId,
        userName: user.Name,
        avatarTag: user.PrimaryImageTag,
        movieCount: movies.length,
        seriesCount: series.length,
        movies,
        series
      };
    } catch (error) {
      console.error('Failed to get user movie stats:', error);
      throw error;
    }
  },

  async getAllUsersMovieStats(): Promise<UserMovieStats[]> {
    try {
      const users = await this.getUsers();
      const stats: UserMovieStats[] = [];

      for (const user of users) {
        const userStats = await this.getUserMovieStats(user.Id);
        stats.push(userStats);
      }

      // Sort by total media count (movies + series)
      return stats.sort((a, b) => (b.movieCount + b.seriesCount) - (a.movieCount + a.seriesCount));
    } catch (error) {
      console.error('Failed to get all users movie stats:', error);
      throw error;
    }
  },

  async getSharedMedia(): Promise<SharedMediaStats> {
    try {
      const users = await this.getUsers();

      // Maps to track items viewed by multiple users
      const movieMap = new Map<string, { item: JellyfinItem; viewers: Set<string> }>();
      const seriesMap = new Map<string, { item: JellyfinItem; viewers: Set<string> }>();

      // Collect all movies and series watched by each user
      for (const user of users) {
        const [movies, series] = await Promise.all([
          this.getUserMovies(user.Id),
          this.getUserSeries(user.Id)
        ]);

        // Add movies to map
        for (const movie of movies) {
          if (!movieMap.has(movie.Id)) {
            movieMap.set(movie.Id, { item: movie, viewers: new Set() });
          }
          movieMap.get(movie.Id)!.viewers.add(user.Name);
        }

        // Add series to map
        for (const serie of series) {
          if (!seriesMap.has(serie.Id)) {
            seriesMap.set(serie.Id, { item: serie, viewers: new Set() });
          }
          seriesMap.get(serie.Id)!.viewers.add(user.Name);
        }
      }

      // Filter items viewed by 2+ users and convert to result format
      const sharedMovies: SharedMediaItem[] = Array.from(movieMap.values())
        .filter(entry => entry.viewers.size >= 2)
        .map(entry => ({
          item: entry.item,
          viewers: Array.from(entry.viewers).sort(),
          viewerCount: entry.viewers.size,
          type: 'movie' as const
        }))
        .sort((a, b) => b.viewerCount - a.viewerCount);

      const sharedSeries: SharedMediaItem[] = Array.from(seriesMap.values())
        .filter(entry => entry.viewers.size >= 2)
        .map(entry => ({
          item: entry.item,
          viewers: Array.from(entry.viewers).sort(),
          viewerCount: entry.viewers.size,
          type: 'series' as const
        }))
        .sort((a, b) => b.viewerCount - a.viewerCount);

      return {
        sharedMovies,
        sharedSeries
      };
    } catch (error) {
      console.error('Failed to get shared media:', error);
      throw error;
    }
  },

  async getActivityStats(): Promise<ActivityStats> {
    try {
      const users = await this.getUsers();
      const recentActivities: RecentActivity[] = [];
      const activityByDate: Map<
        string,
        { movies: number; series: number; activeUsers: Set<string> }
      > = new Map();

      // Initialize last 7 days
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        activityByDate.set(dateStr, { movies: 0, series: 0, activeUsers: new Set() });
      }

      // Collect activity from all users
      for (const user of users) {
        const [movies, series] = await Promise.all([
          this.getUserMovies(user.Id),
          this.getUserSeries(user.Id)
        ]);

        const now = new Date();
        const tenMinutesAgo = new Date(now.getTime() - 10 * 60000);

        // Process movies
        for (const movie of movies) {
          const lastPlayed = movie.UserData?.LastPlayedDate
            ? new Date(movie.UserData.LastPlayedDate)
            : null;

          if (lastPlayed) {
            // Add to recent activities
            recentActivities.push({
              userName: user.Name,
              itemName: movie.Name,
              itemId: movie.Id,
              lastPlayedDate: lastPlayed.toISOString(),
              playCount: movie.UserData?.PlayCount || 0,
              type: 'movie',
              isCurrentlyWatching: lastPlayed > tenMinutesAgo,
              itemPoster: movie.ImageTags?.Primary
            });

            // Count for weekly activity
            const dateStr = lastPlayed.toISOString().split('T')[0];
            if (activityByDate.has(dateStr)) {
              const activity = activityByDate.get(dateStr)!;
              activity.movies++;
              activity.activeUsers.add(user.Name);
            }
          }
        }

        // Process series
        for (const serie of series) {
          const lastPlayed = serie.UserData?.LastPlayedDate
            ? new Date(serie.UserData.LastPlayedDate)
            : null;

          if (lastPlayed) {
            // Add to recent activities
            recentActivities.push({
              userName: user.Name,
              itemName: serie.Name,
              itemId: serie.Id,
              lastPlayedDate: lastPlayed.toISOString(),
              playCount: serie.UserData?.PlayCount || 0,
              type: 'series',
              isCurrentlyWatching: lastPlayed > tenMinutesAgo,
              itemPoster: serie.ImageTags?.Primary
            });

            // Count for weekly activity
            const dateStr = lastPlayed.toISOString().split('T')[0];
            if (activityByDate.has(dateStr)) {
              const activity = activityByDate.get(dateStr)!;
              activity.series++;
              activity.activeUsers.add(user.Name);
            }
          }
        }
      }

      // Sort by most recent first
      recentActivities.sort(
        (a, b) =>
          new Date(b.lastPlayedDate).getTime() -
          new Date(a.lastPlayedDate).getTime()
      );

      // Convert activity map to array
      const weeklyActivityData = Array.from(activityByDate.entries())
        .map(([date, activity]) => ({
          date,
          movies: activity.movies,
          series: activity.series,
          total: activity.movies + activity.series,
          activeUsers: Array.from(activity.activeUsers).sort(),
          activeUserCount: activity.activeUsers.size
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Calculate currently watching (items with recent playback position)
      const now = new Date();
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60000);
      const currentlyWatching = recentActivities
        .filter(a => a.isCurrentlyWatching)
        .map(a => ({
          userName: a.userName,
          itemName: a.itemName,
          type: a.type,
          progress: a.playCount > 0 ? Math.min(100, (a.playCount || 0) * 25) : 0, // Approximate progress
          duration: 0, // Would need more data from Jellyfin
          elapsed: 0 // Would need more data from Jellyfin
        }));

      // Calculate top content (items viewed by multiple users or most viewed)
      const contentViewMap = new Map<string, { name: string; type: 'movie' | 'series'; viewers: Set<string>; views: number }>();
      for (const activity of recentActivities) {
        const key = activity.itemId;
        if (!contentViewMap.has(key)) {
          contentViewMap.set(key, {
            name: activity.itemName,
            type: activity.type,
            viewers: new Set(),
            views: 0
          });
        }
        const content = contentViewMap.get(key)!;
        content.viewers.add(activity.userName);
        content.views = Math.max(content.views, activity.playCount);
      }

      const topContent = Array.from(contentViewMap.values())
        .filter(c => c.viewers.size > 1 || c.views > 1)
        .map(c => ({
          name: c.name,
          type: c.type,
          views: c.viewers.size,
          viewers: Array.from(c.viewers).sort()
        }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 10);

      // Calculate user activity (total watch time, items watched)
      const userActivityMap = new Map<string, { userName: string; totalMinutes: number; itemsWatched: Set<string> }>();
      const itemDurationCache = new Map<string, number>();

      // Get unique item IDs and fetch their durations in parallel
      const uniqueItemIds = new Set(recentActivities.map(a => a.itemId));
      const durationPromises = Array.from(uniqueItemIds).map(async (itemId) => {
        try {
          const itemData: any = await fetchJellyfin(`/Items/${itemId}`, {
            Fields: 'RunTimeTicks'
          });
          if (itemData && itemData.RunTimeTicks) {
            // RunTimeTicks is in 100-nanosecond intervals
            // Convert to minutes: divide by 10000000 to get seconds, then by 60 to get minutes
            const durationMinutes = Math.round(itemData.RunTimeTicks / 10000000 / 60);
            itemDurationCache.set(itemId, Math.max(durationMinutes, 1)); // Minimum 1 minute
          }
        } catch (error) {
          // If fetch fails, we'll use defaults later
          // Don't log here, just silently use fallback
        }
      });

      // Wait for all duration fetches to complete (with timeout)
      await Promise.race([
        Promise.all(durationPromises),
        new Promise(resolve => setTimeout(resolve, 5000)) // 5 second timeout
      ]);

      // Calculate user activity using cached durations
      for (const activity of recentActivities) {
        if (!userActivityMap.has(activity.userName)) {
          userActivityMap.set(activity.userName, {
            userName: activity.userName,
            totalMinutes: 0,
            itemsWatched: new Set()
          });
        }
        const userAct = userActivityMap.get(activity.userName)!;
        userAct.itemsWatched.add(activity.itemId);

        // Use cached duration or fallback estimate
        let durationMinutes = itemDurationCache.get(activity.itemId);
        if (!durationMinutes) {
          // Fallback estimates
          durationMinutes = activity.type === 'movie' ? 110 : 45; // Slightly higher average for movies
        }
        userAct.totalMinutes += durationMinutes;
      }

      const userActivity = Array.from(userActivityMap.values())
        .map(u => ({
          userName: u.userName,
          totalMinutes: u.totalMinutes,
          itemsWatched: u.itemsWatched.size
        }))
        .sort((a, b) => b.totalMinutes - a.totalMinutes);

      // Calculate week stats
      const totalWatchTime = userActivity.reduce((sum, u) => sum + u.totalMinutes, 0);
      const uniqueUsersSet = new Set(recentActivities.map(a => a.userName));

      const weekStats = {
        totalWatchTime,
        averagePerDay: Math.round(totalWatchTime / 7),
        totalItems: recentActivities.length,
        uniqueUsers: uniqueUsersSet.size
      };

      // Add activities to each day
      const weeklyActivityDataWithActivities = weeklyActivityData.map(day => ({
        ...day,
        activities: recentActivities.filter(a => a.lastPlayedDate.split('T')[0] === day.date)
      }));

      return {
        recentActivities: recentActivities.slice(0, 20), // Last 20 activities
        weeklyActivityData: weeklyActivityDataWithActivities,
        currentlyWatching,
        topContent,
        userActivity,
        weekStats
      };
    } catch (error) {
      console.error('Failed to get activity stats:', error);
      throw error;
    }
  },

  async getUserGenres(userId: string): Promise<UserGenreStats> {
    try {
      const users = await this.getUsers();
      const user = users.find(u => u.Id === userId);
      if (!user) throw new Error('User not found');

      // Fetch items with genres - do it with separate detailed calls
      let allItems: JellyfinItem[] = [];
      let startIndex = 0;
      const limit = 500;

      for (let page = 0; page < 10; page++) {
        const data: any = await fetchJellyfin(`/Users/${userId}/Items`, {
          Recursive: 'true',
          SortBy: 'DateCreated',
          SortOrder: 'Descending',
          StartIndex: startIndex.toString(),
          Limit: limit.toString(),
          Fields: 'Genres'
        });

        const items = (data?.Items || []) as JellyfinItem[];
        if (items.length === 0) break;
        allItems = allItems.concat(items);
        startIndex += limit;
        if (items.length < limit) break;
      }

      const genreCount = new Map<string, number>();

      // Count genres from items that were watched
      const [watchedMovies, watchedSeries] = await Promise.all([
        this.getUserMovies(userId),
        this.getUserSeries(userId)
      ]);
      const watchedIds = new Set([...watchedMovies.map(m => m.Id), ...watchedSeries.map(s => s.Id)]);

      for (const item of allItems) {
        if (watchedIds.has(item.Id) && item.Genres && Array.isArray(item.Genres)) {
          for (const genre of item.Genres) {
            genreCount.set(genre, (genreCount.get(genre) || 0) + 1);
          }
        }
      }

      // If no genres found, create default empty response
      const totalItems = watchedMovies.length + watchedSeries.length;
      const genres = Array.from(genreCount.entries())
        .map(([genre, count]) => ({
          genre,
          count,
          percentage: totalItems > 0 ? Math.round((count / totalItems) * 100) : 0
        }))
        .sort((a, b) => b.count - a.count);

      return {
        userName: user.Name,
        genres,
        totalItems
      };
    } catch (error) {
      console.error('Failed to get user genres:', error);
      throw error;
    }
  },

  async getCollaborativeRecommendations(userId: string): Promise<CollaborativeRecommendations> {
    try {
      const users = await this.getUsers();
      const user = users.find(u => u.Id === userId);
      if (!user) throw new Error('User not found');

      // Get current user's watched items
      const [userMovies, userSeries] = await Promise.all([
        this.getUserMovies(userId),
        this.getUserSeries(userId)
      ]);
      const userWatchedIds = new Set([
        ...userMovies.map(m => m.Id),
        ...userSeries.map(s => s.Id)
      ]);

      // Get all other users' items
      const recommendationMap = new Map<string, { item: JellyfinItem; type: 'movie' | 'series'; viewers: Set<string> }>();

      for (const otherUser of users) {
        if (otherUser.Id === userId) continue;

        const [otherMovies, otherSeries] = await Promise.all([
          this.getUserMovies(otherUser.Id),
          this.getUserSeries(otherUser.Id)
        ]);

        // Add movies
        for (const movie of otherMovies) {
          if (userWatchedIds.has(movie.Id)) continue; // Skip already watched
          const key = `movie-${movie.Id}`;
          if (!recommendationMap.has(key)) {
            recommendationMap.set(key, { item: movie, type: 'movie', viewers: new Set() });
          }
          recommendationMap.get(key)!.viewers.add(otherUser.Name);
        }

        // Add series
        for (const serie of otherSeries) {
          if (userWatchedIds.has(serie.Id)) continue; // Skip already watched
          const key = `series-${serie.Id}`;
          if (!recommendationMap.has(key)) {
            recommendationMap.set(key, { item: serie, type: 'series', viewers: new Set() });
          }
          recommendationMap.get(key)!.viewers.add(otherUser.Name);
        }
      }

      // Convert to recommendations array and sort by popularity
      const recommendations: Recommendation[] = Array.from(recommendationMap.values())
        .map(entry => ({
          item: entry.item,
          type: entry.type,
          viewedByCount: entry.viewers.size,
          viewedBy: Array.from(entry.viewers).sort()
        }))
        .sort((a, b) => b.viewedByCount - a.viewedByCount)
        .slice(0, 50); // Top 50 recommendations

      return {
        userId,
        userName: user.Name,
        recommendations
      };
    } catch (error) {
      console.error('Failed to get collaborative recommendations:', error);
      throw error;
    }
  }
};
