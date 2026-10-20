import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { AppData, Service, Category, ThemeConfig } from './types';
import { servicesApi, categoriesApi, themeApi, integrationsApi, skinsApi, maintenanceApi } from './api';
import { isSkin, setCustomSkins, type CustomSkin } from './theme/skins';
import { normalize } from './theme/customSkin';
import { petReact } from './lib/pet';

interface DashboardContextType {
  data: AppData;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  /** Resolves with the id of the created service. */
  addService: (service: Service) => Promise<string>;
  updateService: (service: Service) => Promise<void>;
  deleteService: (id: string) => Promise<void>;
  /** Brings deleted links back (undo, history). */
  restoreServices: (ids: string[]) => Promise<void>;
  setServices: (services: Service[]) => Promise<void>;
  /** Moves/reorders services at once (tree drag): applied locally first. */
  reorderServices: (items: { id: string; categoryId: string; order: number }[]) => Promise<void>;
  /** New folder order, as category ids. Applied locally first. */
  reorderCategories: (ids: string[]) => Promise<void>;
  toggleFavorite: (serviceId: string) => Promise<void>;
  /** Resolves with the id of the created category. */
  addCategory: (category: Category) => Promise<string>;
  updateCategory: (category: Category) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  updateTheme: (theme: Partial<ThemeConfig>) => Promise<void>;
  resetData: () => Promise<void>;
  /** Records an open (feeds "Récents") and refreshes the list. */
  logAccess: (serviceId: string) => void;
  /** Starts updating a container; the jobs show up in data.updates. */
  updateContainer: (container: string) => Promise<void>;
  /** Asks the registries again. */
  checkUpdates: () => Promise<void>;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export const DashboardProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [data, setData] = useState<AppData>({
    updates: { checkedAt: null, checking: false, containers: {}, jobs: {} },
    customSkins: [],
    services: [],
    categories: [],
    theme: {
      mode: 'auto',
      primaryColor: '#6366f1',
      backgroundType: 'solid',
      backgroundValue: '#ffffff',
      density: 'normal',
      showClock: true,
      showWeather: true,
      showDescriptions: true,
    },
    health: {},
    widgets: {},
    recent: [],
    usage: {},
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch data in parallel
      const [servicesData, categoriesData, themeData, skinsData] = await Promise.all([
        servicesApi.getAll(),
        categoriesApi.getAll(),
        themeApi.get(),
        skinsApi.getAll().catch(() => [] as CustomSkin[]),
      ]);
      // Registered before the theme is applied: it may be one of them.
      const customSkins = skinsData.map(k => ({ ...k, config: normalize(k.config) }));
      setCustomSkins(customSkins);

      // Transform services from snake_case to camelCase
      const transformedServices: Service[] = servicesData.map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        url: s.url,
        categoryId: s.category_id,
        tags: typeof s.tags === 'string' ? JSON.parse(s.tags) : s.tags || [],
        icon: s.icon,
        customImage: s.custom_image,
        isFavorite: s.is_favorite || false,
        status: s.status || 'unknown',
        openInNewTab: s.open_in_new_tab !== false,
        isVisible: s.is_visible !== false,
        order: s.order || 0,
        stats: typeof s.stats === 'string' ? JSON.parse(s.stats) : s.stats,
      }));

      // Transform theme from snake_case to camelCase
      const transformedTheme: ThemeConfig = {
        mode: themeData.mode || 'auto',
        primaryColor: themeData.primary_color || '#6366f1',
        backgroundType: themeData.background_type || 'solid',
        backgroundValue: themeData.background_value || '#ffffff',
        density: themeData.density || 'normal',
        showClock: themeData.show_clock !== false,
        showWeather: themeData.show_weather !== false,
        showDescriptions: themeData.show_descriptions !== false,
        showSystemStats: themeData.show_system_stats !== false,
        systemStatsPosition: themeData.system_stats_position || 'top-right',
        systemStatsCustomPosition: themeData.system_stats_custom_position
          ? JSON.parse(themeData.system_stats_custom_position)
          : undefined,
        weatherCity: themeData.weather_city || 'Paris',
        weatherUnit: themeData.weather_unit || 'metric',
        userName: themeData.user_name || '',
        sshTarget: themeData.ssh_target || '',
        skin: isSkin(themeData.skin) ? themeData.skin : 'default',
      };

      setData(prev => ({
        updates: prev.updates,
        customSkins,
        services: transformedServices.map(s => ({ ...s, status: prev.health[s.id]?.status ?? s.status })),
        categories: categoriesData,
        theme: transformedTheme,
        health: prev.health,
        widgets: prev.widgets,
        recent: prev.recent,
        usage: prev.usage,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load dashboard data';
      setError(message);
      console.error('Dashboard data load error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshRecent = () =>
    servicesApi
      .getRecent()
      .then(({ recent, usage }) => setData(prev => ({ ...prev, recent, usage })))
      .catch(() => undefined);

  const refreshUpdates = () =>
    maintenanceApi
      .updates()
      .then(updates => setData(prev => ({ ...prev, updates })))
      .catch(() => undefined);

  const updateContainer = async (container: string) => {
    const job = await maintenanceApi.update(container);
    setData(prev => ({ ...prev, updates: { ...prev.updates, jobs: { ...prev.updates.jobs, [container]: job } } }));
  };

  const checkUpdates = async () => {
    setData(prev => ({ ...prev, updates: { ...prev.updates, checking: true } }));
    const updates = await maintenanceApi.check().catch(() => null);
    if (updates) setData(prev => ({ ...prev, updates }));
    else setData(prev => ({ ...prev, updates: { ...prev.updates, checking: false } }));
  };

  // Every minute; every 2 s while an update runs.
  const busy = (Object.values(data.updates.jobs) as import("./types").UpdateJob[]).some(j => !j.endedAt);
  useEffect(() => {
    refreshUpdates();
    const t = setInterval(refreshUpdates, busy ? 2000 : 60000);
    return () => clearInterval(t);
  }, [busy]);

  const logAccess = (serviceId: string) => {
    // Optimistic: the link jumps to the front of "Récents" at once.
    setData(prev => ({
      ...prev,
      recent: [{ id: serviceId, at: new Date().toISOString() }, ...prev.recent.filter(r => r.id !== serviceId)].slice(0, 8),
      usage: { ...prev.usage, [serviceId]: (prev.usage[serviceId] ?? 0) + 1 },
    }));
    servicesApi.logAccess(serviceId).catch(() => undefined);
  };

  useEffect(() => {
    loadData();

    // Set up intervals for refreshing data
    const loadInterval = setInterval(loadData, 30000); // Refetch every 30 seconds

    // Health (status, latency, history) from the backend monitor, which
    // probes every 30 s; polling faster only picks results up sooner.
    const refreshHealth = async () => {
      try {
        const health = await servicesApi.getHealth();
        setData(prev => ({
          ...prev,
          health,
          services: prev.services.map(service => ({
            ...service,
            status: health[service.id]?.status ?? service.status,
          })),
        }));
      } catch (err) {
        console.error('Failed to update health:', err);
      }
    };
    refreshHealth();
    const statusInterval = setInterval(refreshHealth, 10000);

    const refreshWidgets = () =>
      integrationsApi
        .getWidgets()
        .then(widgets => setData(prev => ({ ...prev, widgets })))
        .catch(() => undefined);
    refreshWidgets();
    const widgetsInterval = setInterval(refreshWidgets, 20000);

    refreshRecent();
    const recentInterval = setInterval(refreshRecent, 60000);

    return () => {
      clearInterval(loadInterval);
      clearInterval(statusInterval);
      clearInterval(widgetsInterval);
      clearInterval(recentInterval);
    };
  }, []);

  const refetch = async () => {
    await loadData();
  };

  const addService = async (service: Service) => {
    try {
      const created = await servicesApi.create(service);
      await loadData();
      return created?.id as string;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add service';
      setError(message);
      throw err;
    }
  };

  const updateService = async (service: Service) => {
    try {
      await servicesApi.update(service.id, service);
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update service';
      setError(message);
      throw err;
    }
  };

  const deleteService = async (id: string) => {
    try {
      await servicesApi.delete(id);
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete service';
      setError(message);
      throw err;
    }
  };

  const restoreServices = async (ids: string[]) => {
    try {
      for (const id of ids) await servicesApi.restore(id);
      petReact('dig');
    } finally {
      await loadData();
    }
  };

  const setServices = async (services: Service[]) => {
    try {
      // Update all services in order
      for (const service of services) {
        await servicesApi.update(service.id, service);
      }
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update services';
      setError(message);
      throw err;
    }
  };

  const reorderServices = async (items: { id: string; categoryId: string; order: number }[]) => {
    const byId = new Map(items.map(i => [i.id, i]));
    setData(prev => ({
      ...prev,
      services: prev.services.map(s => {
        const i = byId.get(s.id);
        return i ? { ...s, categoryId: i.categoryId, order: i.order } : s;
      }),
    }));
    try {
      await servicesApi.reorder(items.map(i => ({ id: i.id, category_id: i.categoryId, order: i.order })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder services');
      await loadData();
      throw err;
    }
  };

  const reorderCategories = async (ids: string[]) => {
    setData(prev => ({
      ...prev,
      categories: prev.categories.map(c => ({ ...c, order: ids.indexOf(c.id) === -1 ? c.order : ids.indexOf(c.id) })),
    }));
    try {
      await categoriesApi.reorder(ids.map((id, order) => ({ id, order })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder categories');
      await loadData();
      throw err;
    }
  };

  const addCategory = async (category: Category) => {
    try {
      const created = await categoriesApi.create(category);
      await loadData();
      return created?.id as string;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add category';
      setError(message);
      throw err;
    }
  };

  const updateCategory = async (category: Category) => {
    try {
      await categoriesApi.update(category.id, category);
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update category';
      setError(message);
      throw err;
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      await categoriesApi.delete(id);
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete category';
      setError(message);
      throw err;
    }
  };

  const updateTheme = async (themeUpdate: Partial<ThemeConfig>) => {
    try {
      const newTheme = { ...data.theme, ...themeUpdate };
      // Applied locally first (synchronously, so a view transition can
      // capture it), then persisted.
      setData(prev => ({ ...prev, theme: { ...prev.theme, ...themeUpdate } }));
      await themeApi.update(newTheme);
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update theme';
      setError(message);
      throw err;
    }
  };

  const toggleFavorite = async (serviceId: string) => {
    try {
      const service = data.services.find(s => s.id === serviceId);
      if (!service) {
        throw new Error('Service not found');
      }

      const updatedService = {
        ...service,
        isFavorite: !service.isFavorite,
      };

      await servicesApi.update(serviceId, updatedService);
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to toggle favorite';
      setError(message);
      throw err;
    }
  };

  const resetData = async () => {
    try {
      // For now, just refetch to show the database state
      // In a real app, you might have a reset endpoint
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reset data';
      setError(message);
      throw err;
    }
  };

  const value: DashboardContextType = {
    data,
    isLoading,
    error,
    refetch,
    addService,
    updateService,
    deleteService,
    restoreServices,
    setServices,
    reorderServices,
    reorderCategories,
    toggleFavorite,
    addCategory,
    updateCategory,
    deleteCategory,
    updateTheme,
    resetData,
    logAccess,
    updateContainer,
    checkUpdates,
  };

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
};

export const useDashboard = (): DashboardContextType => {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
};
