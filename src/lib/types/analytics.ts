export interface AnalyticsData {
  kpis: {
    totalRentals: number;
    uniqueUsers: number;
    mostPopularItem: {
      id: number;
      name: string | null;
      rentals: number;
    } | null;
    mostPopularCategory: {
      name: string;
      rentals: number;
    } | null;
  };
  ageGroupStats: {
    child: {
      count: number;
      uniqueUsers: number;
      percentage: number;
    };
    teen: {
      count: number;
      uniqueUsers: number;
      percentage: number;
    };
    adult: {
      count: number;
      uniqueUsers: number;
      percentage: number;
    };
  };
  categoryStats: {
    category: string;
    totalRentals: number;
    percentage: number;
    topItems: {
      itemId: number;
      itemName: string;
      rentals: number;
    }[];
  }[];
  itemStats: {
    topItems: {
      id: number;
      name: string | null;
      category: string;
      rentals: number;
    }[];
    unpopularItems: {
      id: number;
      name: string | null;
      category: string;
      rentals: number;
    }[];
  };
  timePatternStats?: {
    byHour: { hour: number; rentals: number }[];
    byDayOfWeek: { day: string; rentals: number }[];
  };
  dayOfWeekStats: { name: string; count: number }[];
  hourStats: { name: string; count: number }[];
  genderStats: { name: string; value: number }[];
  peopleCountItemStats?: {
    peopleCount: number;
    items: {
      itemId: number;
      itemName: string;
      rentals: number;
    }[];
  }[];
}
