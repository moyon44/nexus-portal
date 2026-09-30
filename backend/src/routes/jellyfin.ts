import { Router, Request, Response } from 'express';
import { jellyfinService, debugGetAllSeries } from '../services/jellyfin.js';

const router = Router();

// Get all users
router.get('/users', async (req: Request, res: Response) => {
  try {
    const users = await jellyfinService.getUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch Jellyfin users' });
  }
});

// Get all users with their movie statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await jellyfinService.getAllUsersMovieStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch Jellyfin stats' });
  }
});

// Get specific user's movie stats
router.get('/stats/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const stats = await jellyfinService.getUserMovieStats(userId);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user movie stats' });
  }
});

// Get global statistics
router.get('/global-stats', async (req: Request, res: Response) => {
  try {
    const stats = await jellyfinService.getGlobalStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch global stats' });
  }
});

// Get Jellyfin configuration (URL, etc.)
router.get('/config', async (req: Request, res: Response) => {
  try {
    const jellyfinUrl = process.env.JELLYFIN_URL || 'http://localhost:8096';
    res.json({ jellyfinUrl });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch Jellyfin config' });
  }
});

// Get shared media (movies and series watched by multiple users)
router.get('/shared-media', async (req: Request, res: Response) => {
  try {
    const sharedMedia = await jellyfinService.getSharedMedia();
    res.json(sharedMedia);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch shared media' });
  }
});

// Get activity statistics (recent activity and weekly activity)
router.get('/activity', async (req: Request, res: Response) => {
  try {
    const activity = await jellyfinService.getActivityStats();
    res.json(activity);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch activity stats' });
  }
});

// Debug endpoint to see all series with UserData for a user (for troubleshooting)
router.get('/debug/all-series/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const allSeries = await debugGetAllSeries(userId);

    // Return series with details about why they might be filtered
    const seriesWithDebugInfo = allSeries.map(series => {
      const userData = series.UserData;
      const played = userData?.Played === true;
      const hasPlayCount = (userData?.PlayCount || 0) > 0;
      const hasPlaybackPosition = (userData?.PlaybackPositionTicks || 0) > 0;
      const hasPlayedPercentage = (userData?.PlayedPercentage || 0) > 0;
      const allEpisodesWatched = series.RecursiveUnplayedItemCount === 0;

      const willBeIncluded = played || hasPlayCount || hasPlaybackPosition || hasPlayedPercentage || allEpisodesWatched;

      return {
        name: series.Name,
        id: series.Id,
        totalEpisodes: series.RecursiveItemCount,
        unplayedEpisodes: series.RecursiveUnplayedItemCount,
        userData: userData,
        isFiltered: {
          played,
          hasPlayCount,
          hasPlaybackPosition,
          hasPlayedPercentage,
          allEpisodesWatched,
          willBeIncluded
        }
      };
    });

    res.json({
      totalSeries: seriesWithDebugInfo.length,
      includedCount: seriesWithDebugInfo.filter((s: any) => s.isFiltered.willBeIncluded).length,
      series: seriesWithDebugInfo.sort((a: any, b: any) => {
        // Show series starting with T (The Bear) or W (Wonder Man) at top for easier debugging
        const aStarts = a.name[0];
        const bStarts = b.name[0];
        if ((aStarts === 'T' || aStarts === 'W') && (bStarts !== 'T' && bStarts !== 'W')) return -1;
        if ((aStarts !== 'T' && aStarts !== 'W') && (bStarts === 'T' || bStarts === 'W')) return 1;
        return a.name.localeCompare(b.name);
      })
    });
  } catch (error) {
    console.error('Debug series error:', error);
    res.status(500).json({ error: 'Failed to fetch debug series data' });
  }
});

// Get genre statistics for a user
router.get('/genres/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const genres = await jellyfinService.getUserGenres(userId);
    res.json(genres);
  } catch (error) {
    console.error('Genre stats error:', error);
    res.status(500).json({ error: 'Failed to fetch genre statistics' });
  }
});

// Get collaborative recommendations for a user
router.get('/recommendations/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const recommendations = await jellyfinService.getCollaborativeRecommendations(userId);
    res.json(recommendations);
  } catch (error) {
    console.error('Recommendations error:', error);
    res.status(500).json({ error: 'Failed to fetch recommendations' });
  }
});

// Proxy for Jellyfin images
router.get('/image/:itemId', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const { tag, type = 'Primary' } = req.query;

    if (!tag) {
      return res.status(400).json({ error: 'Missing tag parameter' });
    }

    const imageUrl = `${process.env.JELLYFIN_URL || 'http://localhost:8096'}/Items/${itemId}/Images/${type}?tag=${tag}&api_key=${process.env.JELLYFIN_API_KEY || ''}`;

    const response = await fetch(imageUrl);

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch image' });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours

    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Image proxy error:', error);
    res.status(500).json({ error: 'Failed to proxy image' });
  }
});

export default router;
